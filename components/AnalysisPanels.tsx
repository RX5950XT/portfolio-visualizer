'use client';

import { useRef, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import dynamic from 'next/dynamic';
import { Activity, BarChart3, Coins, History, Layers, RefreshCw } from 'lucide-react';

function LoadingPanel(): ReactElement {
  return <div className="flex h-32 items-center justify-center" role="status" aria-label="載入分析資料"><RefreshCw className="h-5 w-5 animate-spin text-primary" /></div>;
}

const MetricsPanel = dynamic(() => import('@/components/charts/MetricsPanel'), { loading: LoadingPanel });
const TransactionsPanel = dynamic(() => import('@/components/transactions/TransactionsPanel'), { loading: LoadingPanel });
const DividendsPanel = dynamic(() => import('@/components/insights/DividendsPanel'), { loading: LoadingPanel });
const DailyPnLChart = dynamic(() => import('@/components/charts/DailyPnLChart'), { loading: LoadingPanel });
const LookthroughPanel = dynamic(() => import('@/components/insights/LookthroughPanel'), { loading: LoadingPanel });

const PANELS = [
  { id: 'performance', label: '績效分析', icon: Activity },
  { id: 'daily', label: '每日損益', icon: BarChart3 },
  { id: 'transactions', label: '賣出紀錄', icon: History },
  { id: 'dividends', label: '配息追蹤', icon: Coins },
  { id: 'lookthrough', label: '配置透視', icon: Layers },
] as const;

type PanelId = typeof PANELS[number]['id'];

interface Props {
  portfolioId: string | null;
  refreshKey: number;
  onTransactionsChange: () => void;
}

const STORAGE_KEY = 'analysis-tab';
const listeners = new Set<() => void>();
let current: PanelId | null | undefined; // 本頁狀態以記憶體為準，儲存只負責跨次造訪

// 記住上次看的分頁；無痕或封鎖儲存時視為收起
function readTab(): PanelId | null {
  if (current !== undefined) return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return PANELS.find(({ id }) => id === stored)?.id ?? null;
  } catch {
    return null;
  }
}

function writeTab(id: PanelId | null): void {
  current = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY);
  } catch { /* 儲存失敗只影響下次是否記得 */ }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export default function AnalysisPanels({ portfolioId, refreshKey, onTransactionsChange }: Props): ReactElement {
  const active = useSyncExternalStore(subscribe, readTab, () => null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const contentProps = { portfolioId, refreshKey };
  const select = writeTab;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const focused = tabRefs.current.findIndex((el) => el === document.activeElement);
    tabRefs.current[(focused + step + PANELS.length) % PANELS.length]?.focus();
  };

  const activePanel = PANELS.find(({ id }) => id === active);

  return (
    <section aria-label="投資分析" className="mb-6 min-w-0 rounded-xl border border-border bg-card">
      <div role="tablist" aria-label="投資分析" onKeyDown={onKeyDown}
        className={`grid grid-cols-5 sm:flex sm:gap-1 sm:px-2 ${activePanel ? 'border-b border-border' : ''}`}>
        {PANELS.map(({ id, label, icon: Icon }, index) => {
          const selected = id === active;
          return (
            <button key={id} type="button" role="tab" id={`${id}-tab`}
              ref={(el) => { tabRefs.current[index] = el; }}
              aria-selected={selected} aria-controls={selected ? `${id}-panel` : undefined}
              tabIndex={selected || (!active && index === 0) ? 0 : -1}
              title={selected ? '再點一次收起' : undefined}
              onClick={() => select(selected ? null : id)}
              className={`relative flex min-h-12 items-center justify-center gap-2 px-1 text-sm font-medium transition-colors sm:px-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors ${selected ? 'text-primary after:bg-primary' : 'text-muted hover:text-foreground after:bg-transparent'}`}>
              <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              {label}
            </button>
          );
        })}
        {!activePanel && <span className="hidden self-center pl-2 text-xs text-muted sm:block">點選查看</span>}
      </div>
      {activePanel && (
        <div role="tabpanel" id={`${activePanel.id}-panel`} aria-labelledby={`${activePanel.id}-tab`} className="min-w-0 p-3 sm:p-4">
          {active === 'performance' && <MetricsPanel key={portfolioId} {...contentProps} />}
          {active === 'daily' && <div className="h-[320px]"><DailyPnLChart key={portfolioId} {...contentProps} /></div>}
          {active === 'transactions' && <TransactionsPanel key={portfolioId} {...contentProps} onChange={onTransactionsChange} />}
          {active === 'dividends' && <DividendsPanel key={portfolioId} {...contentProps} />}
          {active === 'lookthrough' && <LookthroughPanel key={portfolioId} {...contentProps} />}
        </div>
      )}
    </section>
  );
}
