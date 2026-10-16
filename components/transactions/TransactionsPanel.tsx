'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import type { Transaction } from '@/types';
import TransactionList from '@/components/transactions/TransactionList';
import EditNotesDialog from '@/components/transactions/EditNotesDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Props {
  portfolioId?: string | null;
  refreshKey?: number;
  onChange?: () => void;
}

export default function TransactionsPanel({ portfolioId, refreshKey, onChange }: Props): ReactElement {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'guest' | 'demo' | null>(null);
  // demo 可自由編輯自己的沙盒
  const canEdit = userRole === 'admin' || userRole === 'demo';

  // 刪除確認對話框（一次賣出可能對應多筆 tx，故存 id 陣列）
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    ids: string[];
    symbol: string;
  }>({ isOpen: false, ids: [], symbol: '' });

  // 編輯備註對話框（整組 tx 共用同一備註）
  const [editNotes, setEditNotes] = useState<{
    isOpen: boolean;
    ids: string[];
    symbol: string;
    notes: string | null;
  }>({ isOpen: false, ids: [], symbol: '', notes: null });

  const loadTransactions = useCallback(async () => {
    try {
      const url = portfolioId
        ? `/api/transactions?portfolio_id=${portfolioId}`
        : '/api/transactions';
      const res = await fetch(url);
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      return (data as Transaction[]) || [];
    } catch (err) {
      console.error('載入賣出紀錄失敗:', err);
      throw err;
    }
  }, [portfolioId]);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setTransactions(await loadTransactions());
    } catch {
      setError('無法載入賣出紀錄，請重新整理');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadTransactions]);

  useEffect(() => {
    refreshData();
  }, [refreshData, refreshKey]);

  // 載入角色
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(json => setUserRole(json.data?.role || null))
      .catch(() => setUserRole(null));
  }, []);

  // 刪除交易紀錄（整組賣出一起刪）
  const handleDeleteClick = (ids: string[], symbol: string) => {
    setDeleteConfirm({ isOpen: true, ids, symbol });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.ids.length === 0) return;

    try {
      const results = await Promise.all(
        deleteConfirm.ids.map((id) =>
          fetch(`/api/transactions/${id}`, { method: 'DELETE' })
        )
      );
      onChange?.();
      if (results.every((r) => r.ok)) {
        refreshData();
      } else {
        console.error('部分賣出紀錄刪除失敗');
        refreshData();
      }
    } catch (err) {
      console.error('刪除紀錄失敗:', err);
    } finally {
      setDeleteConfirm({ isOpen: false, ids: [], symbol: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, ids: [], symbol: '' });
  };

  // 編輯備註：整組 tx 一起更新
  const handleEditNotesClick = (ids: string[], symbol: string, currentNotes: string | null) => {
    setEditNotes({ isOpen: true, ids, symbol, notes: currentNotes });
  };

  const handleNotesSave = async (notes: string) => {
    if (editNotes.ids.length === 0) return;

    try {
      const results = await Promise.all(
        editNotes.ids.map((id) =>
          fetch(`/api/transactions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes }),
          })
        )
      );
      if (!results.every((r) => r.ok)) {
        console.error('部分備註更新失敗');
      }
      refreshData();
    } catch (err) {
      console.error('更新備註失敗:', err);
    } finally {
      setEditNotes({ isOpen: false, ids: [], symbol: '', notes: null });
    }
  };

  const handleNotesCancel = () => {
    setEditNotes({ isOpen: false, ids: [], symbol: '', notes: null });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // 統計摘要（只看賣出）
  const sellTransactions = transactions.filter(t => t.type === 'sell');
  const totalRealizedPnl = sellTransactions.reduce(
    (sum, t) => sum + (t.realized_pnl_twd || 0), 0
  );
  // 賣出次數以「一次賣出」為單位（同 日期/標的/市場/價/created_at 的多筆 tx 算一次）
  const totalSellCount = new Set(
    sellTransactions.map(t => `${t.transaction_date}|${t.symbol}|${t.market}|${t.price}|${t.created_at}`)
  ).size;

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-6 border-b border-border pb-3">
        <div>
          <p className="text-xs text-muted mb-1">總已實現損益</p>
          <p className={`flex items-center gap-1.5 text-lg font-semibold tabular-nums ${totalRealizedPnl >= 0 ? 'text-up' : 'text-down'}`}>
            {totalRealizedPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {totalRealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalRealizedPnl)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">賣出次數</p>
          <p className="text-lg font-semibold tabular-nums">{totalSellCount}</p>
        </div>
        <button onClick={refreshData} disabled={refreshing} title="重新整理賣出紀錄"
          className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-border/50 focus-visible:outline-2 focus-visible:outline-primary">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {/* 賣出紀錄列表 */}
      <div>
        <h3 className="text-sm font-semibold mb-3">賣出明細</h3>
        <TransactionList
          transactions={sellTransactions}
          onDelete={canEdit ? handleDeleteClick : undefined}
          onEditNotes={canEdit ? handleEditNotesClick : undefined}
          readOnly={!canEdit}
        />
      </div>

      {/* 刪除確認對話框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="確認刪除"
        message={`確定要刪除「${deleteConfirm.symbol}」的賣出紀錄嗎？此操作無法復原。`}
        confirmText="刪除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* 編輯備註對話框（開啟時才掛載，確保初始值正確） */}
      {editNotes.isOpen && (
        <EditNotesDialog
          symbol={editNotes.symbol}
          initialNotes={editNotes.notes}
          onSave={handleNotesSave}
          onCancel={handleNotesCancel}
        />
      )}
    </div>
  );
}

