import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole, getVisiblePortfolioIdsForRole } from '@/lib/auth';
import { fetchDividends, fetchDividendInfo, fetchMultipleQuotes } from '@/lib/stocks';
import { fetchFxHistory, buildDenseRateMap, makeSharesResolver } from '@/lib/portfolio-history';

interface HoldingRow {
  id: string;
  symbol: string;
  shares: number;
  cost_price: number;
  purchase_date: string;
  market: 'US' | 'TW';
}

// GET: 配息追蹤（預估年配息、殖利率、近 12 月配息、即將除息）
export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!role) return NextResponse.json({ error: '未授權' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const visibleIds = await getVisiblePortfolioIdsForRole(role);
    if (visibleIds !== null && portfolioId && !visibleIds.includes(portfolioId)) {
      return NextResponse.json({ error: '無權限檢視此投資組合' }, { status: 403 });
    }

    const supabase = createServerClient();
    // 含軟刪除 lot：歷史配息需還原除息當日持股
    let query = supabase
      .from('holdings')
      .select('id, symbol, shares, cost_price, purchase_date, market')
      .order('purchase_date', { ascending: true });
    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    } else if (visibleIds !== null) {
      if (visibleIds.length === 0) return NextResponse.json({ data: null });
      query = query.in('portfolio_id', visibleIds);
    }

    const { data: holdings, error } = await query;
    if (error) {
      console.error('取得持股失敗:', error);
      return NextResponse.json({ error: '取得持股失敗' }, { status: 500 });
    }
    if (!holdings || holdings.length === 0) return NextResponse.json({ data: null });

    const lots = holdings as HoldingRow[];
    const earliestDate = lots.reduce(
      (min, h) => (h.purchase_date < min ? h.purchase_date : min),
      lots[0].purchase_date
    );

    const holdingIds = lots.map((h) => h.id);
    const { data: sells } = await supabase
      .from('transactions')
      .select('holding_id, shares, transaction_date')
      .in('holding_id', holdingIds)
      .eq('type', 'sell');
    const getSharesAtDate = makeSharesResolver(sells ?? []);

    // 各標的：市場、現行持股、成本（原幣）、lot 清單
    const symbolInfo = new Map<
      string,
      { market: 'US' | 'TW'; currentShares: number; costOrig: number; lots: HoldingRow[] }
    >();
    for (const lot of lots) {
      const info = symbolInfo.get(lot.symbol) ?? {
        market: lot.market,
        currentShares: 0,
        costOrig: 0,
        lots: [],
      };
      info.lots.push(lot);
      if (Number(lot.shares) > 0) {
        info.currentShares += Number(lot.shares);
        info.costOrig += Number(lot.shares) * Number(lot.cost_price);
      }
      symbolInfo.set(lot.symbol, info);
    }

    const symbols = [...symbolInfo.keys()];

    // 日期序列 + 密集匯率（含 today）
    const dateList: string[] = [];
    for (let d = new Date(earliestDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
      dateList.push(d.toISOString().split('T')[0]);
    }
    const today = dateList[dateList.length - 1];

    const [fxSparse, quotes, divData] = await Promise.all([
      fetchFxHistory(earliestDate),
      fetchMultipleQuotes(symbols),
      Promise.all(
        symbols.map(async (s) => {
          const [events, info] = await Promise.all([
            fetchDividends(s, earliestDate),
            fetchDividendInfo(s),
          ]);
          return { symbol: s, events, info };
        })
      ),
    ]);
    const denseRateMap = buildDenseRateMap(fxSparse, dateList);
    const currentFx = denseRateMap.get(today) ?? 32;
    const divMap = new Map(divData.map((d) => [d.symbol, d]));

    // 近 12 月起點（YYYY-MM）
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - 11);
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0].slice(0, 7);
    const months: { month: string; amount: number }[] = [];
    const monthIndex = new Map<string, number>();
    {
      const cursor = new Date(monthStart);
      for (let i = 0; i < 12; i++) {
        const key = cursor.toISOString().split('T')[0].slice(0, 7);
        monthIndex.set(key, months.length);
        months.push({ month: key, amount: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    const currentMonth = today.slice(0, 7);
    let annualEstimate = 0;
    let marketValue = 0;
    let costBasis = 0;
    let thisMonthIncome = 0;
    const upcoming: {
      symbol: string;
      exDate: string;
      perShare: number;
      shares: number;
      estAmount: number;
    }[] = [];

    const sharesAtDate = (symbol: string, date: string) =>
      (symbolInfo.get(symbol)?.lots ?? []).reduce(
        (sum, lot) => sum + getSharesAtDate(lot, date),
        0
      );

    for (const [symbol, info] of symbolInfo) {
      const isUS = info.market === 'US';
      const fxCur = isUS ? currentFx : 1;
      const price = quotes.get(symbol)?.regularMarketPrice ?? 0;
      marketValue += price * info.currentShares * fxCur;
      costBasis += info.costOrig * fxCur;

      const dv = divMap.get(symbol);
      if (!dv) continue;

      // 近 12 月實際配息（用除息當日持股還原）+ 累計每股配息供回推
      let trailingPerShare = 0;
      let eventsInWindow = 0;
      for (const ev of dv.events) {
        const key = ev.date.slice(0, 7);
        if (key < monthStartStr) continue;
        trailingPerShare += ev.amount;
        eventsInWindow++;
        const idx = monthIndex.get(key);
        if (idx === undefined) continue;
        const shAt = sharesAtDate(symbol, ev.date);
        if (shAt <= 0) continue;
        const fx = isUS ? denseRateMap.get(ev.date) ?? currentFx : 1;
        months[idx].amount += ev.amount * shAt * fx;
      }

      const lastEvent = dv.events.length > 0 ? dv.events[dv.events.length - 1] : null;
      const lastPerShare = lastEvent?.amount ?? null;

      // 預估年配息：優先用 summaryDetail 年化率，否則用近 12 月實配回推（crumb 失效時仍可運作）
      const annualPerShare =
        dv.info.annualRate != null ? dv.info.annualRate : trailingPerShare > 0 ? trailingPerShare : null;
      if (annualPerShare != null && info.currentShares > 0) {
        annualEstimate += annualPerShare * info.currentShares * fxCur;
      }

      // 即將除息：優先用 summaryDetail exDate，否則依歷史配息頻率推估下次除息日
      let exDate = dv.info.exDate && dv.info.exDate >= today ? dv.info.exDate : null;
      if (!exDate && lastEvent && eventsInWindow > 0) {
        const proj = new Date(lastEvent.date);
        proj.setDate(proj.getDate() + Math.round(365 / eventsInWindow));
        const projStr = proj.toISOString().split('T')[0];
        if (projStr >= today) exDate = projStr;
      }
      if (exDate && info.currentShares > 0 && lastPerShare) {
        const est = lastPerShare * info.currentShares * fxCur;
        upcoming.push({
          symbol,
          exDate,
          perShare: lastPerShare,
          shares: info.currentShares,
          estAmount: Math.round(est),
        });
        if (exDate.slice(0, 7) === currentMonth) thisMonthIncome += est;
      }
    }

    upcoming.sort((a, b) => a.exDate.localeCompare(b.exDate));

    return NextResponse.json({
      data: {
        annualEstimate: Math.round(annualEstimate),
        thisMonthIncome: Math.round(thisMonthIncome),
        yieldRate: marketValue > 0 ? annualEstimate / marketValue : 0,
        yieldOnCost: costBasis > 0 ? annualEstimate / costBasis : 0,
        monthly: months.map((m) => ({ month: m.month, amount: Math.round(m.amount) })),
        upcoming,
      },
    });
  } catch (err) {
    console.error('配息計算失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
