'use client';

import { useState, useEffect, useCallback } from 'react';
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
  years: YearReturn[];
}

interface Metrics {
  xirr: number | null;
  maxDrawdown: number;
  volatility: number;
  sharpe: number | null;
  winRate: { wins: number; total: number; rate: number };
  returns?: PeriodReturns;
  underwater: { date: string; drawdown: number }[];
}

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
}

const UP = '#22c55e';
const DOWN = '#ef4444';

const pct = (v: number | null, sign = false) => {
  if (v === null || !Number.isFinite(v)) return 'N/A';
  const s = sign && v > 0 ? '+' : '';
  return `${s}${(v * 100).toFixed(1)}%`;
};

export default function MetricsPanel({ portfolioId, refreshKey }: Props) {
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

  const formatDate = (dateStr: string) => {
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
  }) => {
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
              <ReturnsSection returns={data.returns} />

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                <Metric
                  label="年化報酬 (XIRR)"
                  value={pct(data.xirr, true)}
                  positive={data.xirr !== null && data.xirr >= 0}
                />
                <Metric label="最大回撤" value={pct(data.maxDrawdown)} positive={false} />
                <Metric label="波動率 (年化)" value={pct(data.volatility)} />
                <Metric
                  label="Sharpe"
                  value={data.sharpe === null ? 'N/A' : data.sharpe.toFixed(2)}
                  positive={data.sharpe !== null && data.sharpe >= 1}
                />
                <Metric
                  label="勝率"
                  value={
                    data.winRate.total > 0
                      ? `${(data.winRate.rate * 100).toFixed(0)}%`
                      : 'N/A'
                  }
                  sub={data.winRate.total > 0 ? `${data.winRate.wins}/${data.winRate.total}` : undefined}
                />
              </div>

              <div className="text-xs text-muted mb-2">
                回撤走勢（underwater，谷底 {pct(trough)}）
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
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

// 報酬率區塊（TWR 累積）：Total / YTD hero + 各年度長條
function ReturnsSection({ returns }: { returns?: PeriodReturns }) {
  if (!returns || returns.total === null) return null;

  const { total, ytd, years } = returns;
  const firstDate = years[0]?.startDate;
  const currentYear = years[years.length - 1]?.year;
  const ytdStart = years[years.length - 1]?.startDate;

  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold">報酬率</h3>
        <span className="text-xs text-muted">TWR 時間加權 · 累積</span>
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

      {years.length >= 2 && <YearReturnsChart years={years} />}

      <div className="border-t border-border mt-5" />
    </section>
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
}) {
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

function YearReturnsChart({ years }: { years: YearReturn[] }) {
  const values = years.map((y) => y.return);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // 上下各留 22% headroom 給長條端點的數值標籤，避免貼邊或被 XAxis 切到
  const pad = (max - min || 0.1) * 0.22;

  return (
    <div>
      <div className="text-xs text-muted mb-2">各年度報酬</div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
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
}) {
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
}) {
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
}) {
  const color =
    positive === undefined ? 'text-foreground' : positive ? 'text-up' : 'text-down';
  return (
    <div className="bg-background border border-border rounded-lg p-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
