'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, LogOut, TrendingUp, TrendingDown } from 'lucide-react';
import type { Transaction } from '@/types';
import TransactionList from '@/components/transactions/TransactionList';
import EditNotesDialog from '@/components/transactions/EditNotesDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolio_id');
  const portfolioName = searchParams.get('name');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'guest' | null>(null);
  const isAdmin = userRole === 'admin';

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
      return [];
    }
  }, [portfolioId]);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    const data = await loadTransactions();
    setTransactions(data);
    setLoading(false);
    setRefreshing(false);
  }, [loadTransactions]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 載入角色
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(json => setUserRole(json.data?.role || null))
      .catch(() => setUserRole(null));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/');
  };

  // 返回 Dashboard（帶回 portfolio 參數）
  const handleBack = () => {
    if (portfolioId) {
      router.push(`/dashboard?portfolio_id=${portfolioId}`);
    } else {
      router.push('/dashboard');
    }
  };

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
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            title="返回 Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold">
            賣出紀錄
            {portfolioName && (
              <span className="text-base font-normal text-muted ml-2">
                — {decodeURIComponent(portfolioName)}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-card transition-colors"
            title="重新整理"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-card transition-colors text-muted hover:text-danger"
            title="登出"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 統計摘要 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-muted mb-1">總已實現損益</p>
          <p className={`text-2xl font-bold ${totalRealizedPnl >= 0 ? 'text-up' : 'text-down'}`}>
            <span className="flex items-center gap-2">
              {totalRealizedPnl >= 0
                ? <TrendingUp className="w-5 h-5" />
                : <TrendingDown className="w-5 h-5" />
              }
              {totalRealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalRealizedPnl)}
            </span>
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">賣出次數</p>
          <p className="text-2xl font-bold">{totalSellCount}</p>
        </div>
      </div>

      {/* 賣出紀錄列表 */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">賣出明細</h2>
        <TransactionList
          transactions={sellTransactions}
          onDelete={isAdmin ? handleDeleteClick : undefined}
          onEditNotes={isAdmin ? handleEditNotesClick : undefined}
          readOnly={!isAdmin}
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

// Suspense 包裝層（useSearchParams 需要）
export default function TransactionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <TransactionsContent />
    </Suspense>
  );
}
