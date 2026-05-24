'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  symbol: string;
  initialNotes: string | null;
  onSave: (notes: string) => void;
  onCancel: () => void;
}

// 由父層在開啟時才掛載（條件渲染），故初始備註直接作為初始 state，無須同步 effect
export default function EditNotesDialog({ symbol, initialNotes, onSave, onCancel }: Props) {
  const [value, setValue] = useState<string>(initialNotes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const handleSave = () => {
    setSaving(true);
    onSave(value.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">編輯備註 — {symbol}</h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-border transition-colors text-muted hover:text-foreground"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <label className="block text-sm text-muted mb-1">備註</label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例如：停損、獲利了結"
            rows={3}
            autoFocus
            className="w-full resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border hover:bg-border transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
