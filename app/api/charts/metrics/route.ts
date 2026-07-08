import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole, getVisiblePortfolioIdsForRole } from '@/lib/auth';
import { buildEquityCurve, type EquityLot } from '@/lib/equity-curve';
import {
  maxDrawdown,
  drawdownSeries,
  annualizedVolatility,
  xirr,
  winRate,
  periodReturns,
  type CashFlow,
} from '@/lib/metrics';

// 無風險利率（年化）：台美折衷，用於 Sharpe；可日後移入設定
const RISK_FREE = 0.015;

interface SellTxRow {
  holding_id: string;
  symbol: string;
  shares: number;
  price: number;
  transaction_date: string;
  market: 'US' | 'TW';
  realized_pnl_twd: number | null;
}

// GET: 計算進階績效指標（XIRR / 最大回撤 / 波動率 / Sharpe / 勝率）+ underwater 序列
export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!role) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(role);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();

    // 含軟刪除 lot（shares=0），用於重建歷史與還原原始投入
    let holdingsQuery = supabase
      .from('holdings')
      .select('id, symbol, shares, cost_price, purchase_date, market')
      .order('purchase_date', { ascending: true });

    if (portfolioId) {
      holdingsQuery = holdingsQuery.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) return NextResponse.json({ data: null });
      holdingsQuery = holdingsQuery.in('portfolio_id', visibleIds);
    }

    const { data: holdings, error } = await holdingsQuery;
    if (error) {
      console.error('取得持股失敗:', error);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }
    if (!holdings || holdings.length === 0) return NextResponse.json({ data: null });

    const holdingIds = holdings.map((h) => h.id);

    // 兩種範圍的賣出：
    // - matchedSells：對應「現存 lot」，供權益曲線還原 + XIRR 賣出流入（與買入流出相配對）
    // - realizedSells：整個投組的已實現賣出（用 portfolio_id），供勝率——
    //   因為被硬刪除的 lot 其賣出仍是真實平倉紀錄，用 holding_id 篩會漏掉
    let realizedQuery = supabase
      .from('transactions')
      .select('symbol, market, price, transaction_date, created_at, realized_pnl_twd')
      .eq('type', 'sell');
    if (portfolioId) {
      realizedQuery = realizedQuery.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      realizedQuery = realizedQuery.in('portfolio_id', visibleIds);
    }

    const [{ data: matched }, { data: realized }] = await Promise.all([
      supabase
        .from('transactions')
        .select('holding_id, symbol, shares, price, transaction_date, market, realized_pnl_twd')
        .in('holding_id', holdingIds)
        .eq('type', 'sell'),
      realizedQuery,
    ]);

    const sellRows = (matched ?? []) as SellTxRow[];
    const realizedSells = (realized ?? []) as {
      symbol: string;
      market: string;
      price: number;
      transaction_date: string;
      created_at: string;
      realized_pnl_twd: number | null;
    }[];

    const curve = await buildEquityCurve(
      holdings as EquityLot[],
      sellRows.map((s) => ({
        holding_id: s.holding_id,
        shares: s.shares,
        transaction_date: s.transaction_date,
      }))
    );

    if (curve.values.length < 2) return NextResponse.json({ data: null });

    // 現金流：買入為流出、賣出為流入、期末市值為流入
    // 同時建立每日「淨注入」TWD 映射（+ 為投入、- 為提領），供 TWR 指數剝離買賣干擾
    const flows: CashFlow[] = [];
    const netInflowByDate = new Map<string, number>();
    const addInflow = (date: string, amount: number) =>
      netInflowByDate.set(date, (netInflowByDate.get(date) ?? 0) + amount);

    for (const lot of holdings as EquityLot[]) {
      const originalShares = curve.getSharesAtDate(lot, lot.purchase_date);
      if (originalShares <= 0) continue;
      const isUS = lot.market === 'US';
      const fx = isUS ? curve.denseRateMap.get(lot.purchase_date) ?? 32 : 1;
      const cost = originalShares * Number(lot.cost_price) * fx;
      flows.push({ date: lot.purchase_date, amount: -cost });
      addInflow(lot.purchase_date, cost);
    }
    for (const s of sellRows) {
      const isUS = s.market === 'US';
      const fx = isUS ? curve.denseRateMap.get(s.transaction_date) ?? 32 : 1;
      const proceeds = Number(s.shares) * Number(s.price) * fx;
      flows.push({ date: s.transaction_date, amount: proceeds });
      addInflow(s.transaction_date, -proceeds);
    }
    const currentValue = curve.values[curve.values.length - 1];
    flows.push({ date: new Date().toISOString().split('T')[0], amount: currentValue });

    // TWR 指數：r[i] = (V[i] - flow[i]) / V[i-1] - 1；以此為基準算回撤/波動率，
    // 避免賣出造成的市值掉落被誤判為「跌幅」、買入抬高峰值。
    // 第 0 日視為起始資本（index = 1），不貢獻報酬。
    const twrIndex: number[] = new Array(curve.values.length);
    twrIndex[0] = 1;
    for (let i = 1; i < curve.values.length; i++) {
      const prev = curve.values[i - 1];
      const flow = netInflowByDate.get(curve.dates[i]) ?? 0;
      if (prev > 0) {
        const r = (curve.values[i] - flow) / prev - 1;
        twrIndex[i] = twrIndex[i - 1] * (1 + r);
      } else {
        twrIndex[i] = twrIndex[i - 1];
      }
    }

    // 勝率：一次賣出動作為一筆決策。鍵與交易頁 groupSales 一致
    // （pro-rata 多 lot 同一 batch insert → created_at 相同 → 併為一筆；不同次賣出 created_at 不同 → 分開）
    const pnlByDecision = new Map<string, number>();
    for (const s of realizedSells) {
      const key = `${s.transaction_date}|${s.symbol}|${s.market}|${s.price}|${s.created_at}`;
      pnlByDecision.set(key, (pnlByDecision.get(key) ?? 0) + Number(s.realized_pnl_twd ?? 0));
    }

    const vol = annualizedVolatility(twrIndex);
    const annualReturn = xirr(flows);
    const ddSeries = drawdownSeries(twrIndex);

    const data = {
      xirr: annualReturn,
      maxDrawdown: maxDrawdown(twrIndex),
      volatility: vol,
      sharpe: annualReturn !== null && vol > 0 ? (annualReturn - RISK_FREE) / vol : null,
      winRate: winRate([...pnlByDecision.values()]),
      // 期間報酬率（TWR 累積）：Total / YTD / 各曆年，複用同一條 twrIndex
      returns: periodReturns(curve.dates, twrIndex),
      underwater: curve.dates.map((date, i) => ({ date, drawdown: ddSeries[i] })),
    };

    return NextResponse.json({ data });
  } catch (err) {
    console.error('計算績效指標失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
