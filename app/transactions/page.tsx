'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, LogOut, TrendingUp, TrendingDown } from 'lucide-react';
import type { Transaction } from '@/types';
import TransactionList from '@/components/transactions/TransactionList';
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

  // 刪除確認對話框
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    transactionId: string | null;
    symbol: string;
  }>({ isOpen: false, transactionId: null, symbol: '' });

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

  // 刪除交易紀錄
  const handleDeleteClick = (tx: Transaction) => {
    setDeleteConfirm({
      isOpen: true,
      transactionId: tx.id,
      symbol: tx.symbol,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.transactionId) return;

    try {
      const res = await fetch(`/api/transactions/${deleteConfirm.transactionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        refreshData();
      }
    } catch (err) {
      console.error('刪除紀錄失敗:', err);
    } finally {
      setDeleteConfirm({ isOpen: false, transactionId: null, symbol: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, transactionId: null, symbol: '' });
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
  const totalSellCount = sellTransactions.length;

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
