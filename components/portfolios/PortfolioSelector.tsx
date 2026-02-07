'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  FolderOpen,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Portfolio {
  id: string;
  name: string;
  is_default?: boolean;
}

interface Props {
  currentPortfolioId: string | null;
  onSelectPortfolio: (portfolio: Portfolio) => void;
}

export default function PortfolioSelector({
  currentPortfolioId,
  onSelectPortfolio,
}: Props) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 刪除確認對話框狀態
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    portfolioId: string | null;
    portfolioName: string;
  }>({ isOpen: false, portfolioId: null, portfolioName: '' });

  // 取得投資組合列表
  const fetchPortfolios = async () => {
    try {
      const res = await fetch('/api/portfolios');
      const { data } = await res.json();
      setPortfolios(data || []);

      // 如果沒有選中的組合，選第一個
      if (!currentPortfolioId && data && data.length > 0) {
        onSelectPortfolio(data[0]);
      }
    } catch (err) {
      console.error('載入投資組合失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolios();
  }, []);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 建立新投資組合
  const handleCreate = async () => {
    if (!inputValue.trim()) return;

    try {
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inputValue.trim() }),
      });
      const { data } = await res.json();

      if (data) {
        setPortfolios((prev) => [...prev, data]);
        onSelectPortfolio(data);
        setInputValue('');
        setIsCreating(false);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('建立投資組合失敗:', err);
    }
  };

  // 重命名投資組合
  const handleRename = async (id: string) => {
    if (!inputValue.trim()) return;

    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inputValue.trim() }),
      });
      const { data } = await res.json();

      if (data) {
        setPortfolios((prev) =>
          prev.map((p) => (p.id === id ? data : p))
        );
        if (currentPortfolioId === id) {
          onSelectPortfolio(data);
        }
        setInputValue('');
        setEditingId(null);
      }
    } catch (err) {
      console.error('重命名投資組合失敗:', err);
    }
  };

  // 請求刪除投資組合（開啟確認對話框）
  const handleDelete = (portfolio: Portfolio) => {
    setDeleteConfirm({
      isOpen: true,
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
    });
  };

  // 確認刪除投資組合
  const confirmDelete = async () => {
    const id = deleteConfirm.portfolioId;
    if (!id) return;

    try {
      await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });

      const remaining = portfolios.filter((p) => p.id !== id);
      setPortfolios(remaining);

      // 如果刪除的是當前組合，切換到第一個
      if (currentPortfolioId === id && remaining.length > 0) {
        onSelectPortfolio(remaining[0]);
      }
    } catch (err) {
      console.error('刪除投資組合失敗:', err);
    } finally {
      setDeleteConfirm({ isOpen: false, portfolioId: null, portfolioName: '' });
    }
  };

  const currentPortfolio = portfolios.find((p) => p.id === currentPortfolioId);
  const displayName = currentPortfolio?.name || '新的投資組合';

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border">
        <FolderOpen className="w-4 h-4 text-muted" />
        <span className="text-muted">載入中...</span>
      </div>
    );
  }

  return (
    <>
    <div className="relative" ref={dropdownRef}>
      {/* 觸發按鈕 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:bg-border/50 transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-primary" />
        <span className="font-medium max-w-[200px] truncate">{displayName}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉選單 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* 組合列表 */}
          <div className="max-h-64 overflow-y-auto">
            {portfolios.map((portfolio) => (
              <div
                key={portfolio.id}
                className={`flex items-center justify-between px-3 py-2 hover:bg-border/50 transition-colors ${
                  portfolio.id === currentPortfolioId ? 'bg-primary/10' : ''
                }`}
              >
                {editingId === portfolio.id ? (
                  // 編輯模式
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(portfolio.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 px-2 py-1 rounded bg-background border border-border text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(portfolio.id)}
                      className="p-1 rounded hover:bg-up/20 text-up"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded hover:bg-border"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  // 顯示模式
                  <>
                    <button
                      onClick={() => {
                        onSelectPortfolio(portfolio);
                        setIsOpen(false);
                      }}
                      className="flex-1 text-left truncate"
                    >
                      {portfolio.name}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInputValue(portfolio.name);
                          setEditingId(portfolio.id);
                        }}
                        className="p-1 rounded hover:bg-border transition-colors"
                        title="重命名"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {portfolios.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(portfolio);
                          }}
                          className="p-1 rounded hover:bg-danger/20 text-danger transition-colors"
                          title="刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* 新增組合 */}
          <div className="border-t border-border p-2">
            {isCreating ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="輸入組合名稱..."
                  className="flex-1 px-2 py-1.5 rounded bg-background border border-border text-sm"
                  autoFocus
                />
                <button
                  onClick={handleCreate}
                  className="p-1.5 rounded bg-primary hover:bg-primary/80 text-white"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className="p-1.5 rounded hover:bg-border"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setInputValue('');
                  setIsCreating(true);
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-border/50 text-primary transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">新增投資組合</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="刪除投資組合"
        message={`確定要刪除「${deleteConfirm.portfolioName}」嗎？所有持股資料將一併刪除，此操作無法復原！`}
        confirmText="刪除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, portfolioId: null, portfolioName: '' })}
      />
    </>
  );
}
