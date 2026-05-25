import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole, getVisiblePortfolioIdsForRole } from '@/lib/auth';
import { fetchMultipleQuotes, fetchExchangeRate } from '@/lib/stocks';
import { fetchQuoteSummary } from '@/lib/yahoo-crumb';
import { ETF_HOLDINGS_FALLBACK, STOCK_SECTOR_FALLBACK } from '@/lib/etf-holdings';

interface HoldingRow {
  symbol: string;
  shares: number;
  market: 'US' | 'TW';
}

interface EtfUnderlying {
  symbol: string;
  name: string;
  percent: number; // 0~1
}

interface SymbolProfile {
  isEtf: boolean;
  underlyings: EtfUnderlying[];
  sectors: { name: string; weight: number }[]; // ETF 產業權重（0~1）
  stockSector: string | null; // 個股產業
}

// Yahoo 產業 slug / 英文名 → 繁中
const SECTOR_MAP: Record<string, string> = {
  technology: '科技',
  'financial services': '金融',
  financial_services: '金融',
  healthcare: '醫療保健',
  'consumer cyclical': '非必需消費',
  consumer_cyclical: '非必需消費',
  'consumer defensive': '必需消費',
  consumer_defensive: '必需消費',
  'communication services': '通訊服務',
  communication_services: '通訊服務',
  industrials: '工業',
  energy: '能源',
  utilities: '公用事業',
  'basic materials': '原物料',
  basic_materials: '原物料',
  'real estate': '房地產',
  realestate: '房地產',
};

function mapSector(raw: string | null | undefined): string {
  if (!raw) return '未分類';
  return SECTOR_MAP[raw.toLowerCase()] ?? raw;
}

// 取得 ETF 成分與產業，或個股產業。
// 策略：先用備援表（Yahoo topHoldings 實務上需 crumb 而拿不到），再嘗試 live，最後個股產業備援。
async function fetchProfile(symbol: string): Promise<SymbolProfile> {
  const upper = symbol.toUpperCase();

  const fb = ETF_HOLDINGS_FALLBACK[upper] ?? ETF_HOLDINGS_FALLBACK[symbol];
  if (fb) {
    return {
      isEtf: true,
      underlyings: fb.holdings.map((h) => ({
        symbol: h.symbol.toUpperCase(),
        name: '',
        percent: h.percent,
      })),
      sectors: fb.sectors.map((s) => ({ name: s.name, weight: s.weight })),
      stockSector: null,
    };
  }

  // live 嘗試（fc.yahoo.com 已停用、多數環境取不到 crumb，故為最佳努力）
  try {
    const result = await fetchQuoteSummary(symbol, 'topHoldings,assetProfile');
    const top = result?.topHoldings as
      | {
          holdings?: { symbol?: string; holdingName?: string; holdingPercent?: { raw?: number } }[];
          sectorWeightings?: Record<string, { raw?: number }>[];
        }
      | undefined;
    const holdings = Array.isArray(top?.holdings) ? top.holdings : [];

    if (holdings.length > 0) {
      const underlyings: EtfUnderlying[] = holdings
        .map((h) => ({
          symbol: (h.symbol || h.holdingName || '').toUpperCase(),
          name: h.holdingName || h.symbol || '',
          percent: Number(h.holdingPercent?.raw ?? 0),
        }))
        .filter((u) => u.symbol && u.percent > 0);

      const sectors: { name: string; weight: number }[] = [];
      if (Array.isArray(top?.sectorWeightings)) {
        for (const entry of top.sectorWeightings) {
          for (const [slug, val] of Object.entries(entry)) {
            const weight = Number(val?.raw ?? 0);
            if (weight > 0) sectors.push({ name: mapSector(slug), weight });
          }
        }
      }
      return { isEtf: true, underlyings, sectors, stockSector: null };
    }

    const assetProfile = result?.assetProfile as { sector?: string } | undefined;
    if (assetProfile?.sector) {
      return { isEtf: false, underlyings: [], sectors: [], stockSector: mapSector(assetProfile.sector) };
    }
  } catch {
    // 落到個股產業備援
  }

  const stockSector = STOCK_SECTOR_FALLBACK[upper] ?? STOCK_SECTOR_FALLBACK[symbol] ?? null;
  return { isEtf: false, underlyings: [], sectors: [], stockSector };
}

function addTo(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

// GET: 配置透視（ETF 穿透真實重倉 + 產業 + 地區）
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
    let query = supabase.from('holdings').select('symbol, shares, market').gt('shares', 0);
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

    // 合併同標的、計算各標的市值（TWD）
    const bySymbol = new Map<string, { symbol: string; market: 'US' | 'TW'; shares: number }>();
    for (const lot of holdings as HoldingRow[]) {
      const agg = bySymbol.get(lot.symbol) ?? { symbol: lot.symbol, market: lot.market, shares: 0 };
      agg.shares += Number(lot.shares);
      bySymbol.set(lot.symbol, agg);
    }

    const symbols = [...bySymbol.keys()];
    const [quotes, exchangeRate, profiles] = await Promise.all([
      fetchMultipleQuotes(symbols),
      fetchExchangeRate().then((r) => r ?? 32),
      Promise.all(symbols.map((s) => fetchProfile(s).then((p) => [s, p] as const))),
    ]);
    const profileMap = new Map(profiles);

    const valueBySymbol = new Map<string, number>();
    let totalAssets = 0;
    for (const agg of bySymbol.values()) {
      const price = quotes.get(agg.symbol)?.regularMarketPrice ?? 0;
      const fx = agg.market === 'US' ? exchangeRate : 1;
      const value = price * agg.shares * fx;
      valueBySymbol.set(agg.symbol, value);
      totalAssets += value;
    }
    if (totalAssets <= 0) return NextResponse.json({ data: null });

    const direct = new Map<string, number>();
    const viaEtf = new Map<string, number>();
    const sectorMap = new Map<string, number>();
    const regionMap = new Map<string, number>();
    const nameMap = new Map<string, string>();

    for (const agg of bySymbol.values()) {
      const value = valueBySymbol.get(agg.symbol) ?? 0;
      if (value <= 0) continue;
      const profile = profileMap.get(agg.symbol);

      addTo(regionMap, agg.market === 'US' ? '美國' : '台灣', value);

      if (profile?.isEtf) {
        for (const u of profile.underlyings) {
          addTo(viaEtf, u.symbol, value * u.percent);
          if (!nameMap.has(u.symbol)) nameMap.set(u.symbol, u.name);
        }
        if (profile.sectors.length) {
          for (const s of profile.sectors) addTo(sectorMap, s.name, value * s.weight);
        } else {
          addTo(sectorMap, '未分類', value);
        }
      } else {
        addTo(direct, agg.symbol, value);
        addTo(sectorMap, mapSector(profile?.stockSector), value);
      }
    }

    // 合併直接持有與透過 ETF 持有 → 真實重倉
    const allSymbols = new Set<string>([...direct.keys(), ...viaEtf.keys()]);
    const realHoldings = [...allSymbols]
      .map((symbol) => {
        const d = direct.get(symbol) ?? 0;
        const e = viaEtf.get(symbol) ?? 0;
        const total = d + e;
        return {
          symbol,
          name: nameMap.get(symbol) ?? '',
          direct: Math.round(d),
          viaEtf: Math.round(e),
          total: Math.round(total),
          pct: total / totalAssets,
          warn: total / totalAssets > 0.1,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const toDist = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([name, value]) => ({ name, value: Math.round(value), pct: value / totalAssets }))
        .sort((a, b) => b.value - a.value);

    return NextResponse.json({
      data: {
        totalAssets: Math.round(totalAssets),
        realHoldings,
        sectors: toDist(sectorMap),
        regions: toDist(regionMap),
      },
    });
  } catch (err) {
    console.error('配置透視計算失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
