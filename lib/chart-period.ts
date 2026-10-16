export function taipeiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function dailyPnLDateRange(
  period: 'ytd' | 'year',
  now = new Date(),
): { start: string; end: string } {
  const end = taipeiDate(now);
  const [year, month, day] = end.split('-').map(Number);
  if (period === 'ytd') return { start: `${year}-01-01`, end };
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  const start = new Date(Date.UTC(year - 1, month - 1, Math.min(day, lastDay)));
  return { start: start.toISOString().slice(0, 10), end };
}
