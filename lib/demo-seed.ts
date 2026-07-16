import { createServerClient } from '@/lib/supabase';
import { fetchHistory } from '@/lib/stocks';
import { fetchFxHistory } from '@/lib/portfolio-history';

// Demo 沙盒的種子與清理。
// 種子故事：「一年前各投入 NT$50 萬買 VT 與 0050」——買入日回溯，
// 淨值曲線本就從最早買入日以歷史價回推，故無需 daily_snapshots 即有完整歷史。

const DEMO_TTL_HOURS = 24;
const SEED_LEG_TWD = 500_000; // 每腿投入金額（TWD）
const BACKDATE_DAYS = 365;

// 刪除順序：先子表再 portfolios（holdings/cash 雖有 FK CASCADE，明確刪不依賴它）
const DEMO_TABLES = ['transactions', 'holdings', 'cash_balance', 'portfolios'] as const;

// 抓價失敗時的備援，確保登入不被外部 API 卡住（曲線起點價格會與真實歷史略有出入）
const FALLBACK_VT_USD = 100;
const FALLBACK_0050_TWD = 150;
const FALLBACK_FX = 32;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// 清理過期沙盒。以 space 為單位而非靠 FK cascade + 各表自身 created_at：
// 後者會留下「space 已死但子列未滿 24h」的孤兒，且沙盒被玩家刪光組合後就無列可判齡。
export async function sweepExpiredDemo(): Promise<void> {
  const supabase = createServerClient();
  const cutoff = new Date(Date.now() - DEMO_TTL_HOURS * 3600_000).toISOString();

  const { data, error } = await supabase
    .from('portfolios')
    .select('demo_space')
    .not('demo_space', 'is', null)
    .lt('created_at', cutoff);

  if (error) {
    console.error('掃描過期 demo 沙盒失敗:', error);
    return;
  }

  const spaces = [...new Set((data ?? []).map((r: { demo_space: string }) => r.demo_space))];
  if (spaces.length === 0) return;

  for (const table of DEMO_TABLES) {
    const { error: delError } = await supabase.from(table).delete().in('demo_space', spaces);
    // 單表清理失敗不中斷其餘表，僅記錄；殘留列會在下次登入再被掃到
    if (delError) console.error(`清理過期 demo ${table} 失敗:`, delError);
  }
}

// 取回溯日當天（或之後第一個交易日）的收盤價
function firstClose(
  history: { date: string; close: number }[],
  fallbackPrice: number,
  fallbackDate: string
): { price: number; date: string } {
  const first = history[0];
  if (!first || !(first.close > 0)) return { price: fallbackPrice, date: fallbackDate };
  return { price: first.close, date: first.date };
}

// 建立一個 demo 沙盒的種子資料；DB 寫入失敗時拋出，讓登入回報 500 而非給出空沙盒
export async function seedDemoSpace(space: string): Promise<void> {
  const supabase = createServerClient();

  const { data: portfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .insert({ name: 'Demo 示範組合', demo_space: space, visible_to_guest: false })
    .select('id')
    .single();

  if (portfolioError || !portfolio) {
    throw new Error(`建立 demo 組合失敗: ${portfolioError?.message ?? '無回傳資料'}`);
  }

  const backdate = daysAgo(BACKDATE_DAYS);
  const [vtHistory, twHistory, fxSparse] = await Promise.all([
    fetchHistory('VT', { startDate: backdate }),
    fetchHistory('0050.TW', { startDate: backdate }),
    fetchFxHistory(backdate),
  ]);

  const vt = firstClose(vtHistory, FALLBACK_VT_USD, backdate);
  const tw = firstClose(twHistory, FALLBACK_0050_TWD, backdate);

  const fxDates = [...fxSparse.keys()].sort();
  const fx = fxSparse.get(vt.date) ?? (fxDates.length ? fxSparse.get(fxDates[0])! : FALLBACK_FX);

  // 各投入 NT$50 萬：VT 以買入日匯率換算成 USD 計價，0050 直接以 TWD 計價
  const vtShares = Math.round((SEED_LEG_TWD / (vt.price * fx)) * 1e8) / 1e8;
  const twShares = Math.floor(SEED_LEG_TWD / tw.price); // 台股以整股較貼近真實

  const { error: holdingsError } = await supabase.from('holdings').insert([
    {
      symbol: 'VT',
      shares: vtShares,
      cost_price: vt.price,
      purchase_date: vt.date,
      market: 'US',
      portfolio_id: portfolio.id,
      demo_space: space,
    },
    {
      symbol: '0050.TW',
      shares: twShares,
      cost_price: tw.price,
      purchase_date: tw.date,
      market: 'TW',
      portfolio_id: portfolio.id,
      demo_space: space,
    },
  ]);

  if (holdingsError) {
    throw new Error(`建立 demo 持股失敗: ${holdingsError.message}`);
  }

  const { error: cashError } = await supabase
    .from('cash_balance')
    .insert({ amount_twd: 0, portfolio_id: portfolio.id, demo_space: space });

  if (cashError) {
    throw new Error(`建立 demo 現金失敗: ${cashError.message}`);
  }
}
