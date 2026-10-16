'use client';

import type { ReactElement } from 'react';

interface Props {
  on: boolean;
  onToggle: () => void;
}

// S&P 500 對照線開關：走勢圖與回撤圖共用同一外觀
export default function BenchmarkToggle({ on, onToggle }: Props): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`min-h-9 shrink-0 px-3 py-1 text-xs rounded-full font-medium transition-colors flex items-center gap-1.5 ${
        on ? 'bg-primary text-white' : 'bg-border/50 text-muted hover:text-foreground hover:bg-border'
      }`}
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: '#ffffff', opacity: on ? 1 : 0.4 }}
        aria-hidden="true"
      />
      S&amp;P 500 對照
    </button>
  );
}
