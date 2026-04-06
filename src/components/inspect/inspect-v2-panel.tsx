'use client';

import { useCallback, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const COIN_OPTIONS = [
  { id: 'btc_up', label: 'BTC UP' },
  { id: 'btc_down', label: 'BTC DOWN' },
  { id: 'eth_up', label: 'ETH UP' },
  { id: 'eth_down', label: 'ETH DOWN' },
  { id: 'sol_up', label: 'SOL UP' },
  { id: 'sol_down', label: 'SOL DOWN' },
  { id: 'xrp_up', label: 'XRP UP' },
  { id: 'xrp_down', label: 'XRP DOWN' },
] as const;

type CoinId = (typeof COIN_OPTIONS)[number]['id'];

type TopScoreRow = {
  price: number;
  spent: number;
  earned: number;
  profit: number;
  minBalance: number;
  bought: number;
  sold: number;
};

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

type InspectV2Response = {
  meta: {
    timeSeconds: number;
    amount: number;
    token: string;
    s3Key: string;
    priceDiff: number;
    multiMode: boolean;
  };
  slugCount: number | null;
  topScores: TopScoreRow[];
  priceData: unknown;
};

export function InspectV2Panel() {
  const groupId = useId();
  const [timeSeconds, setTimeSeconds] = useState('');
  const [amount, setAmount] = useState('');
  const [priceDiff, setPriceDiff] = useState('10');
  const [multiMode, setMultiMode] = useState(false);
  const [token, setToken] = useState<CoinId | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectV2Response | null>(null);

  const find = useCallback(async () => {
    setError(null);
    setResult(null);
    const t = Number(timeSeconds);
    const a = Number(amount);
    const pd = Number(priceDiff);
    if (!Number.isFinite(t) || t < 0 || t > 300) {
      setError('Time must be a number from 0 to 300 (seconds).');
      return;
    }
    if (!Number.isFinite(a)) {
      setError('Enter a valid amount.');
      return;
    }
    if (!Number.isFinite(pd)) {
      setError('Enter a valid price diff.');
      return;
    }
    if (!token) {
      setError('Select a market.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/inspect-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeSeconds: t,
          amount: a,
          token,
          priceDiff: pd,
          multiMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.detail === 'string'
            ? data.detail
            : typeof data.error === 'string'
              ? data.error
              : 'Request failed',
        );
        return;
      }
      setResult(data as InspectV2Response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [timeSeconds, amount, priceDiff, multiMode, token]);

  return (
    <Card className="max-w-5xl p-5 md:p-6 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Inspect V2</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v2-time" className="text-sm font-medium">
            Time (seconds)
          </label>
          <Input
            id="inspect-v2-time"
            type="number"
            inputMode="numeric"
            min={0}
            max={300}
            step={1}
            placeholder="0–300 seconds"
            value={timeSeconds}
            onChange={(e) => setTimeSeconds(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v2-amount" className="text-sm font-medium">
            Amount
          </label>
          <Input
            id="inspect-v2-amount"
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v2-pricediff" className="text-sm font-medium">
            Price diff
          </label>
          <Input
            id="inspect-v2-pricediff"
            type="number"
            inputMode="numeric"
            step="any"
            placeholder="e.g. 10"
            value={priceDiff}
            onChange={(e) => setPriceDiff(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-2 shrink-0">
          <input
            type="checkbox"
            checked={multiMode}
            onChange={(e) => setMultiMode(e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          Multi mode
        </label>
        <Button type="button" onClick={find} disabled={loading} className="shrink-0">
          {loading ? '…' : 'Find'}
        </Button>
      </div>

      <div
        className="flex flex-wrap gap-x-6 gap-y-2"
        role="radiogroup"
        aria-labelledby={`${groupId}-legend`}
      >
        <p id={`${groupId}-legend`} className="sr-only">
          Market
        </p>
        {COIN_OPTIONS.map(({ id, label }) => (
          <label
            key={id}
            className={cn(
              'flex items-center gap-2 text-sm cursor-pointer select-none',
              'rounded-md px-2 py-1 -mx-2 transition-colors',
              token === id ? 'bg-accent' : 'hover:bg-muted/60',
            )}
          >
            <input
              type="radio"
              name={`${groupId}-token`}
              checked={token === id}
              onChange={() => setToken(id)}
              className="size-4 border-input accent-primary"
            />
            {label}
          </label>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {result != null ? (
        <div className="rounded-md border border-border overflow-x-auto">
          <p className="text-sm font-medium px-3 pt-3">
            Top by profit (then lowest min. balance). Buy at X, sell 94% of tokens at X + price diff.
          </p>
          <table className="w-full text-sm border-collapse min-w-[640px] mt-2 mb-3">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="py-2 px-3 font-medium tabular-nums">#</th>
                <th className="py-2 px-3 font-medium tabular-nums">Buy X</th>
                <th className="py-2 px-3 font-medium tabular-nums">Spent</th>
                <th className="py-2 px-3 font-medium tabular-nums">Earned</th>
                <th className="py-2 px-3 font-medium tabular-nums">Profit</th>
                <th className="py-2 px-3 font-medium tabular-nums">Min bal</th>
                <th className="py-2 px-3 font-medium tabular-nums">Bought</th>
                <th className="py-2 px-3 font-medium tabular-nums">Sold</th>
              </tr>
            </thead>
            <tbody>
              {(result.topScores ?? []).length === 0 ? (
                <tr>
                  <td className="py-6 px-3 text-muted-foreground text-center" colSpan={8}>
                    No rows (no candidate prices).
                  </td>
                </tr>
              ) : (
                (result.topScores ?? []).map((row, i) => (
                  <tr key={`${row.price}-${i}`} className="border-b border-border/60">
                    <td className="py-2 px-3 tabular-nums">{i + 1}</td>
                    <td className="py-2 px-3 tabular-nums">{row.price}</td>
                    <td className="py-2 px-3 tabular-nums">{money(row.spent)}</td>
                    <td className="py-2 px-3 tabular-nums">{money(row.earned)}</td>
                    <td
                      className={cn(
                        'py-2 px-3 tabular-nums font-medium',
                        row.profit < 0 && 'text-destructive',
                        row.profit > 0 && 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {money(row.profit)}
                    </td>
                    <td className="py-2 px-3 tabular-nums">{money(row.minBalance)}</td>
                    <td className="py-2 px-3 tabular-nums">{row.bought ?? 0}</td>
                    <td className="py-2 px-3 tabular-nums">{row.sold ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[320px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <th className="py-2 px-3 font-medium w-[40%]">Field</th>
              <th className="py-2 px-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {result ? (
              <>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">S3 key</td>
                  <td className="py-2 px-3 font-mono text-xs break-all">{result.meta.s3Key}</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Time (s)</td>
                  <td className="py-2 px-3 tabular-nums">{result.meta.timeSeconds}</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Amount</td>
                  <td className="py-2 px-3 tabular-nums">{result.meta.amount}</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Price diff</td>
                  <td className="py-2 px-3 tabular-nums">{result.meta.priceDiff}</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Multi mode</td>
                  <td className="py-2 px-3">{result.meta.multiMode ? 'Yes' : 'No'}</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Token</td>
                  <td className="py-2 px-3 font-mono text-xs">{result.meta.token}</td>
                </tr>
                {result.slugCount != null ? (
                  <tr className="border-b border-border/60">
                    <td className="py-2 px-3 text-muted-foreground">Rounds (slug count)</td>
                    <td className="py-2 px-3 tabular-nums">{result.slugCount}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="py-2 px-3 text-muted-foreground align-top">Price data (JSON)</td>
                  <td className="py-2 px-3">
                    <pre className="font-mono text-[11px] leading-snug max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted/30 rounded-md p-2 border border-border/60">
                      {JSON.stringify(result.priceData, null, 2)}
                    </pre>
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td className="py-8 px-3 text-muted-foreground text-center" colSpan={2}>
                  Run Find to load <span className="font-mono">history/&lt;TOKEN&gt;.json</span> from S3.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
