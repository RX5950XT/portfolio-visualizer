'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface YearReturn {
  year: number;
  return: number;
  startDate: string;
  endDate: string;
}

interface PeriodReturns {
  total: number | null;
  ytd: number | null;
  annualized: number | null;
  years: YearReturn[];
}

interface BenchmarkSummary {
  name: string;
  total: number | null;
  excess: number | null;
}

interface DrawdownSummary {
  trough: number;
  peakDate: string | null;
  troughDate: string | null;
  recoveryDate: string | null;
  durationDays: number;
  recoveryDays: number | null;
  recovered: boolean;
}

interface Metrics {
  xirr: number | null;
  volatility: number;
  sharpe: number | null;
  sortino: number | null;
  winRate: { wins: number; total: number; rate: number };
  returns?: PeriodReturns;
  benchmark?: BenchmarkSummary;
  drawdown?: DrawdownSummary;
  underwater: { date: string; drawdown: number }[];
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

const UP = '#22c55e';
const DOWN = '#ef4444';

const pct = (v: number | null, sign = false): string => {
  if (v === null || !Number.isFinite(v)) return 'N/A';
  const s = sign && v > 0 ? '+' : '';
  return `${s}${(v * 100).toFixed(1)}%`;
};

export default function MetricsPanel({ portfolioId, refreshKey }: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = portfolioId
        ? `/api/charts/metrics?portfolio_id=${portfolioId}`
        : '/api/charts/metrics';
      const res = await fetch(url);
      const { data: metrics, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setData(metrics);
      setLoaded(true);
    } catch {
      setError('無法載入績效指標');
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  // 展開後才載入，避免拖慢 dashboard；portfolio/refresh 變動時若已展開則重抓
  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData, refreshKey]);

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // 自訂 Tooltip：確保回撤數字在深色背景清楚顯示
  const UnderwaterTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value?: number }[];
    label?: string;
  }): ReactElement | null => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
          <p className="text-xs text-muted mb-0.5">{formatDate(String(label))}</p>
          <p className="text-sm font-semibold text-down">回撤 {pct(Number(payload[0].value ?? 0))}</p>
        </div>
      );
    }
    return null;
  };

  const trough =
    data && data.underwater.length
      ? data.underwater.reduce((min, p) => (p.drawdown < min ? p.drawdown : min), 0)
      : 0;

  return (
    <div className="card mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <span className="font-semibold">績效分析</span>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted" />
        )}
      </button>

      {open && (
        <div className="mt-4">
          {loading && !loaded ? (
            <div className="h-40 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-danger">{error}</div>
          ) : !data ? (
            <div className="h-40 flex items-center justify-center text-muted">
              尚無足夠資料計算績效指標
            </div>
          ) : (
            <>
              <ReturnsSection
                returns={data.returns}
                xirr={data.xirr}
                benchmark={data.benchmark}
              />

              <section className="mb-5">
                <h3 className="text-sm font-semibold mb-3">風險與交易品質</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  <Metric label="年化波動率" value={pct(data.volatility)} />
                  <Metric
                    label="Sharpe"
                    value={data.sharpe === null ? 'N/A' : data.sharpe.toFixed(2)}
                    positive={data.sharpe !== null && data.sharpe >= 1}
                  />
                  <Metric
                    label="Sortino"
                    value={data.sortino === null ? 'N/A' : data.sortino.toFixed(2)}
                    positive={data.sortino !== null && data.sortino >= 1}
                  />
                  <Metric
                    label="勝率"
                    value={
                      data.winRate.total > 0
                        ? `${(data.winRate.rate * 100).toFixed(0)}%`
                        : 'N/A'
                    }
                    sub={
                      data.winRate.total > 0
                        ? `${data.winRate.wins}/${data.winRate.total}`
                        : undefined
                    }
                  />
                </div>
              </section>

              <DrawdownHeader summary={data.drawdown} fallbackTrough={trough} />
              <div className="h-48">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  initialDimension={{ width: 300, height: 192 }}
                >
                  <AreaChart
                    data={data.underwater}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      stroke="#666"
                      fontSize={12}
                      tickLine={false}
                      interval={Math.max(0, Math.floor(data.underwater.length / 6))}
                    />
                    <YAxis
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      stroke="#666"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={[Math.min(trough * 1.1, -0.01), 0]}
                    />
                    <Tooltip content={<UnderwaterTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      stroke="#ef4444"
                      fill="url(#ddFill)"
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// TWR 與 XIRR 分別回答策略表現、實際資金結果，不應混為單一報酬口徑。
function ReturnsSection({
  returns,
  xirr,
  benchmark,
}: {
  returns?: PeriodReturns;
  xirr: number | null;
  benchmark?: BenchmarkSummary;
}): ReactElement | null {
  if (!returns || returns.total === null) return null;

  const { total, ytd, annualized, years } = returns;
  const firstDate = years[0]?.startDate;
  const currentYear = years[years.length - 1]?.year;
  const ytdStart = years[years.length - 1]?.startDate;

  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold">報酬表現</h3>
        <span className="text-xs text-muted">TWR · 時間加權</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <HeroReturn
          label="累積報酬"
          value={total}
          sub={firstDate ? `自 ${firstDate} 起` : undefined}
        />
        <HeroReturn
          label="今年至今 (YTD)"
          value={ytd}
          sub={currentYear ? `${currentYear} 年${ytdStart ? ` · 起於 ${ytdStart}` : ''}` : undefined}
        />
      </div>

      <BenchmarkComparison portfolioTotal={total} benchmark={benchmark} />
      {years.length > 0 && <YearReturnsChart years={years} />}
      <AnnualizedReturns twr={annualized} xirr={xirr} />

      <div className="border-t border-border mt-5" />
    </section>
  );
}

function BenchmarkComparison({
  portfolioTotal,
  benchmark,
}: {
  portfolioTotal: number;
  benchmark?: BenchmarkSummary;
}): ReactElement | null {
  if (!benchmark || benchmark.total === null) return null;
  const values = [
    { label: '投組 TWR', value: portfolioTotal },
    { label: benchmark.name, value: benchmark.total },
    { label: '超額報酬', value: benchmark.excess },
  ];

  return (
    <div className="border-y border-border py-3 mb-4">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h4 className="text-xs font-medium">同期基準比較</h4>
        <span className="text-xs text-muted">累積 · TWD（含匯率）</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border">
        {values.map(({ label, value }) => (
          <div key={label} className="min-w-0 px-2 first:pl-0 last:pr-0">
            <p className="truncate text-xs text-muted">{label}</p>
            <p
              className={`mt-1 text-sm font-semibold tabular-nums ${
                value === null ? 'text-foreground' : value >= 0 ? 'text-up' : 'text-down'
              }`}
            >
              {pct(value, true)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawdownHeader({
  summary,
  fallbackTrough,
}: {
  summary?: DrawdownSummary;
  fallbackTrough: number;
}): ReactElement {
  const trough = summary?.trough ?? fallbackTrough;
  const timing =
    trough >= 0
      ? '尚無回撤'
      : summary?.recovered
      ? `歷時 ${summary.durationDays} 天 · 谷底後 ${summary.recoveryDays ?? 0} 天復原`
      : summary
        ? `已持續 ${summary.durationDays} 天 · 尚未復原`
        : null;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
      <h3 className="text-sm font-semibold">最大回撤走勢</h3>
      <p className="text-xs text-muted tabular-nums">
        {trough < 0 ? `谷底 ${pct(trough)}${timing ? ` · ${timing}` : ''}` : timing}
      </p>
    </div>
  );
}

function HeroReturn({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | null;
  sub?: string;
}): ReactElement {
  const up = value !== null && value >= 0;
  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <p className="text-sm font-medium text-muted mb-2">{label}</p>
      <p
        className={`text-2xl sm:text-3xl font-bold tabular-nums ${up ? 'text-up' : 'text-down'}`}
      >
        {pct(value, true)}
      </p>
      {sub && <p className="text-xs text-muted mt-1.5">{sub}</p>}
    </div>
  );
}

function AnnualizedReturns({ twr, xirr }: { twr: number | null; xirr: number | null }): ReactElement {
  return (
    <div className="border-t border-border mt-4 pt-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h4 className="text-sm font-semibold">年化報酬率</h4>
        <span className="text-xs text-muted">兩種口徑，各自保留</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AnnualizedReturn
          label="TWR 年化"
          value={twr}
          description="策略表現 · 排除資金進出"
        />
        <AnnualizedReturn
          label="XIRR 年化"
          value={xirr}
          description="實際資金 · 納入金額與時點"
        />
      </div>
      <p className="text-xs leading-5 text-muted mt-2.5">
        比較投資策略看 TWR；檢視個人實際成果看 XIRR。兩者不同屬正常現象。
      </p>
    </div>
  );
}

function AnnualizedReturn({
  label,
  value,
  description,
}: {
  label: string;
  value: number | null;
  description: string;
}): ReactElement {
  const up = value !== null && value >= 0;
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3 sm:p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${up ? 'text-up' : 'text-down'}`}>
        {pct(value, true)}
      </p>
      <p className="text-xs leading-4 text-muted mt-1.5">{description}</p>
    </div>
  );
}

function YearReturnsChart({ years }: { years: YearReturn[] }): ReactElement {
  const values = years.map((y) => y.return);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // 上下各留 22% headroom 給長條端點的數值標籤，避免貼邊或被 XAxis 切到
  const pad = (max - min || 0.1) * 0.22;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted mb-2">
        <span>各年度報酬（TWR）</span>
        <span>今年為 YTD</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 300, height: 208 }}
        >
          <BarChart
            data={years}
            margin={{ top: 22, right: 8, left: 8, bottom: 4 }}
            barCategoryGap="28%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
            <XAxis
              dataKey="year"
              stroke="#666"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide domain={[min - pad, max + pad]} />
            <ReferenceLine y={0} stroke="#404040" />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<YearTooltip />} />
            <Bar dataKey="return" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
              {years.map((y) => (
                <Cell key={y.year} fill={y.return >= 0 ? UP : DOWN} />
              ))}
              <LabelList dataKey="return" content={<YearBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// 長條端點數值標籤：正報酬標於頂端上方、負報酬標於底端下方，並套用漲跌色。
// Recharts v3 LabelList 把幾何放在 props.viewBox（非頂層），且負值長條 height 為負、
// y 落在長條尖端；故以 min/max 取上下緣，對正負號皆穩健，不直接依賴 height 正負。
function YearBarLabel(props: {
  value?: number;
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
}): ReactElement | null {
  const { value, viewBox } = props;
  if (value === undefined || !viewBox) return null;
  const { x, y, width, height } = viewBox;
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return null;
  }
  const r = Number(value);
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  const labelY = r >= 0 ? top - 7 : bottom + 14;
  return (
    <text
      x={x + width / 2}
      y={labelY}
      textAnchor="middle"
      fontSize={12}
      fontWeight={600}
      fill={r >= 0 ? UP : DOWN}
    >
      {pct(r, true)}
    </text>
  );
}

function YearTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: YearReturn }[];
}): ReactElement | null {
  if (active && payload && payload.length && payload[0].payload) {
    const y = payload[0].payload;
    const up = y.return >= 0;
    return (
      <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg">
        <p className="text-xs text-muted mb-1">
          {y.year} 年 · {y.startDate} ~ {y.endDate}
        </p>
        <p className={`text-sm font-semibold ${up ? 'text-up' : 'text-down'}`}>
          {pct(y.return, true)}
        </p>
      </div>
    );
  }
  return null;
}

function Metric({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}): ReactElement {
  const color =
    positive === undefined ? 'text-foreground' : positive ? 'text-up' : 'text-down';
  return (
    <div className="min-w-0 bg-background border border-border rounded-lg p-2.5 sm:p-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
