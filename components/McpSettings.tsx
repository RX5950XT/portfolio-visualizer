'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { Check, Copy, Plug, RefreshCw } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function McpSettings(): ReactElement {
  const [enabled, setEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'POST' | 'DELETE' | null>(null);

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/mcp`);
    fetch('/api/settings/mcp').then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '無法載入 MCP 設定');
      setEnabled(json.data.enabled);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : '無法載入 MCP 設定'))
      .finally(() => setLoading(false));
  }, []);

  async function update(method: 'POST' | 'DELETE'): Promise<void> {
    setConfirm(null);
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/settings/mcp', { method });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '無法更新 MCP 設定');
      setEnabled(json.data.enabled);
      setToken(json.data.token ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法更新 MCP 設定');
    } finally {
      setLoading(false);
    }
  }

  const connection = JSON.stringify({ mcpServers: { 'portfolio-visualizer': {
    url: endpoint, headers: { Authorization: `Bearer ${token || 'YOUR_MCP_TOKEN'}` },
  } } }, null, 2);

  async function copyConnection(): Promise<void> {
    try {
      await navigator.clipboard.writeText(connection);
      setCopied(true);
    } catch {
      setError('複製失敗，請從下方連線設定選取複製。');
    }
  }

  return (
    <section className="card space-y-5" aria-labelledby="mcp-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mcp-heading" className="flex items-center gap-2 font-semibold"><Plug className="h-5 w-5 text-primary" />MCP 連線</h2>
        <span className="text-sm text-muted">{loading ? '讀取中…' : enabled ? '已啟用 · 可讀寫' : '尚未啟用'}</span>
      </div>
      <p className="text-sm text-muted leading-relaxed">讓支援 MCP 的 AI 讀取所有真實投資組合、持股、現金、買賣紀錄與損益，並可新增、賣出、編輯持股與設定現金。連線採用 Streamable HTTP，不提供刪除。</p>
      <div>
        <label htmlFor="mcp-endpoint" className="mb-1 block text-sm text-muted">伺服器網址</label>
        <input id="mcp-endpoint" readOnly value={endpoint} className="w-full text-sm" />
      </div>
      {token && <div>
        <label htmlFor="mcp-token" className="mb-1 block text-sm text-muted">MCP 金鑰（僅顯示這一次）</label>
        <input id="mcp-token" readOnly value={token} spellCheck={false} autoComplete="off" className="w-full font-mono text-sm" />
        <p className="mt-2 text-xs text-muted">請妥善保管；持有金鑰的 AI 可讀取你的投資資料，也能新增、賣出、編輯持股與設定現金。離開此頁後無法再查看原金鑰。</p>
      </div>}
      <div className="flex flex-wrap gap-3">
        <button disabled={loading} onClick={() => enabled ? setConfirm('POST') : void update('POST')} className="btn-primary min-h-11 flex items-center gap-2">
          {loading && <RefreshCw className="h-4 w-4 animate-spin" />}{enabled ? '重設金鑰' : '建立金鑰'}
        </button>
        {enabled && <button disabled={loading} onClick={() => setConfirm('DELETE')} className="min-h-11 rounded-lg border border-border px-4 text-sm text-down hover:bg-border/50 disabled:opacity-50">撤銷連線</button>}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="mcp-connection" className="text-sm text-muted">連線設定</label>
          {token && <button onClick={copyConnection} className="min-h-11 flex items-center gap-2 rounded-lg px-3 text-sm hover:bg-border/50">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? '已複製' : '複製設定'}</button>}
        </div>
        <textarea id="mcp-connection" readOnly value={connection} rows={10} spellCheck={false} className="w-full resize-none font-mono text-xs leading-relaxed" />
        <p className="text-xs text-muted">AI 用戶端須支援自訂 Authorization header。讀取：清單、現況、買賣紀錄、績效、走勢、每日損益、配息、配置透視；寫入：新增持股、賣出、編輯持股、設定現金。</p>
      </div>
      {error && <p role="alert" className="text-sm text-down">{error}</p>}
      <ConfirmDialog isOpen={confirm !== null} title={confirm === 'POST' ? '重設 MCP 金鑰' : '撤銷 MCP 連線'}
        message="目前使用這把金鑰的 AI 將立即無法連線。" confirmText={confirm === 'POST' ? '重設金鑰' : '撤銷連線'}
        cancelText="取消" variant="danger" onConfirm={() => { if (confirm) void update(confirm); }} onCancel={() => setConfirm(null)} />
    </section>
  );
}
