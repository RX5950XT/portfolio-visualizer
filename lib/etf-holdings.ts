// ETF 成分與產業權重的「備援資料」。
// Why: Yahoo quoteSummary（topHoldings）自 2024 起需 crumb，而 fc.yahoo.com 已停用、
//      finance.yahoo.com 在 Node/undici 會 headers overflow，導致實務上拿不到 cookie。
//      與既有 etf/expense 的 FALLBACK 表同一務實策略：對常見指數型 ETF 提供近似前十大成分與產業，
//      讓「穿透真實重倉」可離線運作。數據為近似值（會隨時間漂移），僅涵蓋成分穩定的市值加權 ETF。

export interface FallbackHolding {
  symbol: string;
  percent: number; // 0~1
}

export interface FallbackEtf {
  holdings: FallbackHolding[];
  sectors: { name: string; weight: number }[]; // name 為繁中，weight 0~1
}

// S&P 500 系列（VOO / VTI / IVV / SPY 近似）
const SP500_HOLDINGS: FallbackHolding[] = [
  { symbol: 'AAPL', percent: 0.07 },
  { symbol: 'NVDA', percent: 0.065 },
  { symbol: 'MSFT', percent: 0.063 },
  { symbol: 'AMZN', percent: 0.038 },
  { symbol: 'META', percent: 0.025 },
  { symbol: 'AVGO', percent: 0.021 },
  { symbol: 'GOOGL', percent: 0.02 },
  { symbol: 'TSLA', percent: 0.018 },
  { symbol: 'GOOG', percent: 0.017 },
  { symbol: 'BRK-B', percent: 0.017 },
];

const SP500_SECTORS = [
  { name: '科技', weight: 0.31 },
  { name: '金融', weight: 0.13 },
  { name: '醫療保健', weight: 0.11 },
  { name: '非必需消費', weight: 0.1 },
  { name: '通訊服務', weight: 0.09 },
  { name: '工業', weight: 0.08 },
  { name: '必需消費', weight: 0.06 },
  { name: '能源', weight: 0.035 },
  { name: '公用事業', weight: 0.025 },
  { name: '房地產', weight: 0.022 },
  { name: '原物料', weight: 0.02 },
];

export const ETF_HOLDINGS_FALLBACK: Record<string, FallbackEtf> = {
  VOO: { holdings: SP500_HOLDINGS, sectors: SP500_SECTORS },
  VTI: { holdings: SP500_HOLDINGS, sectors: SP500_SECTORS },
  IVV: { holdings: SP500_HOLDINGS, sectors: SP500_SECTORS },
  SPY: { holdings: SP500_HOLDINGS, sectors: SP500_SECTORS },
  QQQ: {
    holdings: [
      { symbol: 'AAPL', percent: 0.09 },
      { symbol: 'NVDA', percent: 0.08 },
      { symbol: 'MSFT', percent: 0.08 },
      { symbol: 'AMZN', percent: 0.055 },
      { symbol: 'AVGO', percent: 0.05 },
      { symbol: 'META', percent: 0.045 },
      { symbol: 'TSLA', percent: 0.03 },
      { symbol: 'COST', percent: 0.027 },
      { symbol: 'GOOGL', percent: 0.025 },
      { symbol: 'GOOG', percent: 0.024 },
    ],
    sectors: [
      { name: '科技', weight: 0.5 },
      { name: '通訊服務', weight: 0.16 },
      { name: '非必需消費', weight: 0.13 },
      { name: '必需消費', weight: 0.06 },
      { name: '醫療保健', weight: 0.06 },
      { name: '工業', weight: 0.05 },
    ],
  },
  VT: {
    holdings: [
      { symbol: 'AAPL', percent: 0.04 },
      { symbol: 'NVDA', percent: 0.037 },
      { symbol: 'MSFT', percent: 0.037 },
      { symbol: 'AMZN', percent: 0.022 },
      { symbol: 'META', percent: 0.015 },
      { symbol: 'AVGO', percent: 0.012 },
      { symbol: 'GOOGL', percent: 0.012 },
      { symbol: 'TSM', percent: 0.011 },
      { symbol: 'TSLA', percent: 0.01 },
      { symbol: 'GOOG', percent: 0.01 },
    ],
    sectors: [
      { name: '科技', weight: 0.26 },
      { name: '金融', weight: 0.16 },
      { name: '工業', weight: 0.11 },
      { name: '非必需消費', weight: 0.11 },
      { name: '醫療保健', weight: 0.1 },
      { name: '通訊服務', weight: 0.07 },
      { name: '必需消費', weight: 0.06 },
      { name: '能源', weight: 0.04 },
      { name: '原物料', weight: 0.04 },
      { name: '公用事業', weight: 0.03 },
      { name: '房地產', weight: 0.03 },
    ],
  },
  '0050.TW': {
    holdings: [
      { symbol: '2330.TW', percent: 0.57 },
      { symbol: '2317.TW', percent: 0.05 },
      { symbol: '2454.TW', percent: 0.045 },
      { symbol: '2308.TW', percent: 0.025 },
      { symbol: '2382.TW', percent: 0.025 },
      { symbol: '2891.TW', percent: 0.018 },
      { symbol: '2412.TW', percent: 0.015 },
      { symbol: '2882.TW', percent: 0.015 },
      { symbol: '2881.TW', percent: 0.015 },
      { symbol: '2303.TW', percent: 0.013 },
    ],
    sectors: [
      { name: '科技', weight: 0.7 },
      { name: '金融', weight: 0.13 },
      { name: '非必需消費', weight: 0.05 },
      { name: '工業', weight: 0.05 },
      { name: '通訊服務', weight: 0.04 },
      { name: '原物料', weight: 0.03 },
    ],
  },
};

// 常見個股產業備援（穿透不到時，讓直接持有的個股也能歸類）
export const STOCK_SECTOR_FALLBACK: Record<string, string> = {
  AAPL: '科技',
  MSFT: '科技',
  NVDA: '科技',
  AVGO: '科技',
  TSM: '科技',
  'TSMC': '科技',
  AMZN: '非必需消費',
  TSLA: '非必需消費',
  META: '通訊服務',
  GOOGL: '通訊服務',
  GOOG: '通訊服務',
  NFLX: '通訊服務',
  'BRK-B': '金融',
  JPM: '金融',
  V: '金融',
  MA: '金融',
  COST: '必需消費',
  WMT: '必需消費',
  UNH: '醫療保健',
  LLY: '醫療保健',
  JNJ: '醫療保健',
  XOM: '能源',
  '2330.TW': '科技',
  '2317.TW': '科技',
  '2454.TW': '科技',
};
