'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import LookthroughPanel from '@/components/insights/LookthroughPanel';

function Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolio_id');
  const portfolioName = searchParams.get('name');
  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-center gap-2 mb-4">
        <button title="返回首頁" onClick={() => router.push(`/dashboard?${searchParams.toString()}`)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-card focus-visible:outline-2 focus-visible:outline-primary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">配置透視</h1>
        {portfolioName && <span className="min-w-0 break-words text-muted">· {portfolioName}</span>}
      </header>
      <LookthroughPanel portfolioId={portfolioId} />
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<RefreshCw className="m-6 w-6 h-6 animate-spin text-primary" />}><Content /></Suspense>;
}
