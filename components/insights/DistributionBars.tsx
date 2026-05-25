'use client';

interface DistItem {
  name: string;
  value: number;
  pct: number;
}

interface Props {
  title: string;
  items: DistItem[];
}

export default function DistributionBars({ title, items }: Props) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">暫無數據</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>{item.name}</span>
                <span className="text-muted">{(item.pct * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-border/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(item.pct * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
