'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const COIN_OPTIONS = [
  { id: 'btc_up', label: 'btc_up' },
  { id: 'btc_down', label: 'btc_down' },
  { id: 'eth_up', label: 'eth_up' },
  { id: 'eth_down', label: 'eth_down' },
  { id: 'sol_up', label: 'sol_up' },
  { id: 'sol_down', label: 'sol_down' },
  { id: 'xrp_up', label: 'xrp_up' },
  { id: 'xrp_down', label: 'xrp_down' },
] as const;

type CoinId = (typeof COIN_OPTIONS)[number]['id'];

type QueryResponse = {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  s3Key: string;
};

/** Three side-by-side tables; page sizes are multiples of this. */
const TABLE_COLUMNS = 3;
const PAGE_SIZE_OPTIONS = [90, 150, 300, 450] as const;

function isMsecsColumn(name: string): boolean {
  return name.toLowerCase() === 'msecs';
}

function isRoundTsColumn(name: string): boolean {
  return name.toLowerCase() === 'round_ts';
}

function isPriceLikeName(name: string): boolean {
  const l = name.toLowerCase();
  if (l === 'msecs' || l === 'round_ts') return false;
  if (
    l === 'price' ||
    l === 'bid' ||
    l === 'ask' ||
    l === 'mid' ||
    l === 'last' ||
    l === 'px' ||
    l === 'prob' ||
    l === 'probability' ||
    l === 'spread'
  ) {
    return true;
  }
  if (l.endsWith('_price')) return true;
  if (l.includes('price')) return true;
  return false;
}

function columnHeader(col: string): string {
  if (isMsecsColumn(col)) return 'time (s)';
  const l = col.toLowerCase();
  if (l === 'bid') return 'buy';
  if (l === 'ask') return 'sell';
  if (l === 'mid') return 'mid';
  return col;
}

function formatCell(col: string, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (isMsecsColumn(col)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return '';
    return (n / 1000).toFixed(2);
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isFinite(n)) {
    if (isRoundTsColumn(col)) {
      return String(Math.trunc(n));
    }
    const frac = Math.abs(n % 1) > 1e-12;
    if (frac || isPriceLikeName(col)) {
      return n.toFixed(2);
    }
    return String(n);
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  return String(v);
}

function splitRowsForTripleColumns(rows: Record<string, unknown>[], pageSize: number) {
  const chunk = Math.floor(pageSize / TABLE_COLUMNS);
  const a = rows.slice(0, chunk);
  const b = rows.slice(chunk, chunk * 2);
  const c = rows.slice(chunk * 2, chunk * TABLE_COLUMNS);
  return [a, b, c] as const;
}

function resolveRoundTsKey(columns: string[]): string | null {
  const hit = columns.find((c) => c.toLowerCase() === 'round_ts');
  return hit ?? null;
}

/** Monotonic group id (1-based) when `round_ts` changes within the page. */
function buildRoundTsGroupIds(
  rows: Record<string, unknown>[],
  roundTsKey: string | null,
): number[] {
  if (!roundTsKey || rows.length === 0) return rows.map(() => 0);
  const ids: number[] = [];
  let g = 0;
  let prev: unknown = Symbol('sentinel');
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i][roundTsKey];
    if (i === 0 || cur !== prev) g += 1;
    ids.push(g);
    prev = cur;
  }
  return ids;
}

export function SnowpolyPricePanel() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [coin, setCoin] = useState<CoinId | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(150);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QueryResponse | null>(null);

  const load = useCallback(
    async (nextPage: number, nextSize: number) => {
      setError(null);
      if (!coin) {
        setError('Select a coin (table).');
        return;
      }
      if (!date?.trim()) {
        setError('Pick a date (loads snowpoly_history/prices_YYYY-MM-DD.db).');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/snowpoly-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coin,
            date: date.trim(),
            page: nextPage,
            pageSize: nextSize,
          }),
        });
        const payload = await res.json();
        if (!res.ok) {
          setData(null);
          setError(typeof payload.error === 'string' ? payload.error : 'Request failed.');
          return;
        }
        setData(payload as QueryResponse);
        setPage(nextPage);
        setPageSize(nextSize);
      } catch {
        setData(null);
        setError('Network error while loading history.');
      } finally {
        setLoading(false);
      }
    },
    [coin, date],
  );

  const onLoadClick = () => load(1, pageSize);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 md:flex-nowrap md:items-center">
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">Coin / table</label>
            <select
              className={cn(
                'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs',
                'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              )}
              value={coin}
              onChange={(e) => setCoin((e.target.value || '') as CoinId | '')}
            >
              <option value="">Choose…</option>
              {COIN_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" className="shrink-0" disabled={loading} onClick={onLoadClick}>
            {loading ? 'Loading…' : 'Load'}
          </Button>
        </div>
        {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}
      </Card>

      {data && data.columns.length > 0 ? (
        <Card className="overflow-hidden p-0">
          {(() => {
            const roundTsKey = resolveRoundTsKey(data.columns);
            const groupIds = buildRoundTsGroupIds(data.rows, roundTsKey);
            const [segA, segB, segC] = splitRowsForTripleColumns(data.rows, data.pageSize);
            const chunk = Math.floor(data.pageSize / TABLE_COLUMNS);
            const starts = [0, chunk, chunk * 2] as const;

            const renderTable = (
              segment: Record<string, unknown>[],
              startIdx: number,
              key: string,
            ) => (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-0 border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      {data.columns.map((col) => (
                        <th
                          key={`${key}-${col}`}
                          className="text-foreground px-2 py-2 text-left font-medium whitespace-nowrap sm:px-3"
                        >
                          {columnHeader(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segment.length === 0 ? (
                      <tr>
                        <td
                          className="text-muted-foreground px-2 py-6 text-center sm:px-3"
                          colSpan={data.columns.length}
                        >
                          No rows.
                        </td>
                      </tr>
                    ) : (
                      segment.map((row, i) => {
                        const globalIdx = startIdx + i;
                        const gid = groupIds[globalIdx] ?? 0;
                        const prevGid =
                          globalIdx > 0 ? (groupIds[globalIdx - 1] ?? 0) : null;
                        const groupStart = roundTsKey && (globalIdx === 0 || gid !== prevGid);
                            const stripe = gid % 2 === 1;
                        return (
                          <tr
                            key={`${key}-${globalIdx}`}
                            className={cn(
                              'border-b border-border/80 hover:bg-muted/30',
                              stripe && 'bg-muted/25',
                              groupStart && 'border-t-2 border-t-primary/45',
                            )}
                          >
                            {data.columns.map((col) => (
                              <td
                                key={col}
                                className="px-2 py-2 align-top whitespace-nowrap sm:px-3"
                              >
                                {formatCell(col, row[col])}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            );

            return data.rows.length === 0 ? (
              <div className="text-muted-foreground px-4 py-8 text-center text-sm">
                No rows for this selection.
              </div>
            ) : (
              <div className="divide-border grid gap-0 md:grid-cols-3 md:divide-x">
                <div>{renderTable(segA, starts[0], 'A')}</div>
                <div>{renderTable(segB, starts[1], 'B')}</div>
                <div>{renderTable(segC, starts[2], 'C')}</div>
              </div>
            );
          })()}
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="min-w-0 break-all">
              Page {data.page} of {totalPages} · {data.total} row{data.total === 1 ? '' : 's'} ·{' '}
              {TABLE_COLUMNS} columns × {Math.floor(data.pageSize / TABLE_COLUMNS)} rows max
              {data.s3Key ? <span className="text-muted-foreground/90 ml-2">· {data.s3Key}</span> : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <span className="text-xs">Per page</span>
                <select
                  className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                  value={pageSize}
                  disabled={loading}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    void load(1, n);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || data.page <= 1}
                onClick={() => load(data.page - 1, data.pageSize)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || data.page >= totalPages}
                onClick={() => load(data.page + 1, data.pageSize)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
