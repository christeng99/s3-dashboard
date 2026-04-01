'use client';

import { useCallback, useMemo, useState } from 'react';
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

const COIN_LABEL = Object.fromEntries(COIN_OPTIONS.map((o) => [o.id, o.label])) as Record<
  CoinId,
  string
>;

type RoundMetrics = {
  spent: number;
  earned: number;
  bought: number;
  sold: number;
  profit: number;
};

type CoinBreakdown = {
  spent: number;
  earned: number;
  bought: number;
  sold: number;
  profit: number;
  minBalance: number;
  slugCount: number;
  byRound: Record<string, RoundMetrics>;
};

type GrandTotals = {
  spent: number;
  earned: number;
  bought: number;
  sold: number;
  profit: number;
  minBalance: number;
};

type Scenario = {
  totals: GrandTotals;
  byCoin: Record<string, CoinBreakdown>;
};

type ApiResult = {
  roundsByCoin: Record<string, number>;
  oncePerRound: Scenario;
  multiWithinRound: Scenario;
};

type BestCaseRow = {
  buy: number;
  sell: number;
  spread: number;
  profit: number;
  spent: number;
  earned: number;
  bought: number;
  sold: number;
  minBalance: number;
};

type BestCasesResult = {
  maxSpread: number;
  topN: number;
  minBuyPrice?: number;
  oncePerRound: BestCaseRow[];
  multiWithinRound: BestCaseRow[];
};

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function ResultBlock({
  title,
  description,
  scenario,
  coinOrder,
}: {
  title: string;
  description: string;
  scenario: Scenario;
  coinOrder: CoinId[];
}) {
  const t = scenario.totals;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground text-xs mt-1">{description}</p>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Market</th>
              <th className="py-2 pr-3 font-medium tabular-nums">Rounds</th>
              <th className="py-2 pr-3 font-medium tabular-nums">Bought</th>
              <th className="py-2 pr-3 font-medium tabular-nums">Sold</th>
              <th className="py-2 pr-3 font-medium tabular-nums">Spent</th>
              <th className="py-2 pr-3 font-medium tabular-nums">Earned</th>
              <th className="py-2 pr-3 font-medium tabular-nums">Profit</th>
              <th className="py-2 font-medium tabular-nums">Min bal</th>
            </tr>
          </thead>
          <tbody>
            {coinOrder.map((id) => {
              const row = scenario.byCoin[id];
              if (!row) return null;
              return (
                <tr key={id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <div>{COIN_LABEL[id]}</div>
                    <details className="mt-1 text-xs text-muted-foreground max-w-[12rem]">
                      <summary className="cursor-pointer select-none">Per slug</summary>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-snug">
                        {JSON.stringify(row.byRound, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.slugCount}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.bought}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.sold}</td>
                  <td className="py-2 pr-3 tabular-nums">{money(row.spent)}</td>
                  <td className="py-2 pr-3 tabular-nums">{money(row.earned)}</td>
                  <td className="py-2 pr-3 tabular-nums">{money(row.profit)}</td>
                  <td className="py-2 tabular-nums">{money(row.minBalance)}</td>
                </tr>
              );
            })}
            <tr className="font-medium bg-muted/50">
              <td className="py-2 pr-3">Total (sum)</td>
              <td className="py-2 pr-3 tabular-nums">—</td>
              <td className="py-2 pr-3 tabular-nums">{t.bought}</td>
              <td className="py-2 pr-3 tabular-nums">{t.sold}</td>
              <td className="py-2 pr-3 tabular-nums">{money(t.spent)}</td>
              <td className="py-2 pr-3 tabular-nums">{money(t.earned)}</td>
              <td className="py-2 pr-3 tabular-nums">{money(t.profit)}</td>
              <td className="py-2 tabular-nums">{money(t.minBalance)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-card/60 px-3 py-3 sm:px-4 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Totals (sum across markets)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">{money(t.spent)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Earned</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">{money(t.earned)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit</p>
            <p
              className={cn(
                'text-lg font-semibold tabular-nums tracking-tight',
                t.profit < 0 && 'text-destructive',
                t.profit > 0 && 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {money(t.profit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bought</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">{t.bought}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sold</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">{t.sold}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Min balance (per market, summed)</p>
            <p className="text-lg font-semibold tabular-nums tracking-tight">{money(t.minBalance)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BestCasesSection({
  data,
  onApplyPair,
}: {
  data: BestCasesResult;
  onApplyPair: (buy: number, sell: number) => void;
}) {
  const table = (title: string, rows: BestCaseRow[]) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs sm:text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <th className="py-2 px-2 font-medium">#</th>
              <th className="py-2 px-2 font-medium tabular-nums">Buy</th>
              <th className="py-2 px-2 font-medium tabular-nums">Sell</th>
              <th className="py-2 px-2 font-medium tabular-nums">Spread</th>
              <th className="py-2 px-2 font-medium tabular-nums">Profit</th>
              <th className="py-2 px-2 font-medium tabular-nums">Spent</th>
              <th className="py-2 px-2 font-medium tabular-nums">Earned</th>
              <th className="py-2 px-2 font-medium tabular-nums">B/S</th>
              <th className="py-2 px-2 font-medium tabular-nums">Min bal</th>
              <th className="py-2 px-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.buy}-${r.sell}-${i}`} className="border-b border-border/60">
                <td className="py-1.5 px-2 tabular-nums">{i + 1}</td>
                <td className="py-1.5 px-2 tabular-nums">{r.buy.toFixed(2)}</td>
                <td className="py-1.5 px-2 tabular-nums">{r.sell.toFixed(2)}</td>
                <td className="py-1.5 px-2 tabular-nums">{r.spread.toFixed(2)}</td>
                <td
                  className={cn(
                    'py-1.5 px-2 tabular-nums font-medium',
                    r.profit < 0 && 'text-destructive',
                    r.profit > 0 && 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {money(r.profit)}
                </td>
                <td className="py-1.5 px-2 tabular-nums">{money(r.spent)}</td>
                <td className="py-1.5 px-2 tabular-nums">{money(r.earned)}</td>
                <td className="py-1.5 px-2 tabular-nums">
                  {r.bought}/{r.sold}
                </td>
                <td className="py-1.5 px-2 tabular-nums">{money(r.minBalance)}</td>
                <td className="py-1.5 px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => onApplyPair(r.buy, r.sell)}
                  >
                    Use
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Best price pairs</h3>
        <p className="text-muted-foreground text-xs mt-1">
          Top {data.topN} by profit per mode, with sell − buy ≤ {data.maxSpread.toFixed(2)} and sell &gt;
          buy only. Buy threshold floored at{' '}
          <span className="text-foreground font-medium tabular-nums">
            {(data.minBuyPrice ?? 0).toFixed(2)}
          </span>
          . Same simulator rules (multi: max 5 buys / 5 sells per slug per market). Min bal is the sum of
          per-market minimum balances for that pair.
        </p>
      </div>
      {table('Multi within each round', data.multiWithinRound)}
      {table('Once per round', data.oncePerRound)}
    </div>
  );
}

export function InspectPanel() {
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [usdPerBuy, setUsdPerBuy] = useState('');
  const [selected, setSelected] = useState<Set<CoinId>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loadingBest, setLoadingBest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [bestCases, setBestCases] = useState<BestCasesResult | null>(null);

  const selectedOrder = useMemo(() => COIN_OPTIONS.map((o) => o.id).filter((id) => selected.has(id)), [selected]);

  const toggleCoin = (id: CoinId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runCalc = useCallback(async () => {
    setError(null);
    setResult(null);
    const buy = Number(buyPrice);
    const sell = Number(sellPrice);
    const usd = Number(usdPerBuy);
    if (!Number.isFinite(buy) || !Number.isFinite(sell) || !Number.isFinite(usd) || usd <= 0) {
      setError('Enter valid buy price, sell price, and a positive USD buy amount.');
      return;
    }
    if (!(sell > buy)) {
      setError('Sell price must be greater than buy price.');
      return;
    }
    if (selected.size === 0) {
      setError('Select at least one market (checkbox).');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/inspect/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyPrice: buy,
          sellPrice: sell,
          usdPerBuy: usd,
          coins: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Request failed');
        return;
      }
      setResult(data as ApiResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [buyPrice, sellPrice, usdPerBuy, selected]);

  const runFindBest = useCallback(async () => {
    setError(null);
    const usd = Number(usdPerBuy);
    if (!Number.isFinite(usd) || usd <= 0) {
      setError('Enter a valid USD per buy amount to search.');
      return;
    }
    if (selected.size === 0) {
      setError('Select at least one market (checkbox).');
      return;
    }

    setLoadingBest(true);
    setBestCases(null);
    try {
      const res = await fetch('/api/inspect/best-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usdPerBuy: usd,
          maxSpread: 0.4,
          topN: 10,
          coins: Array.from(selected),
          minBuyPrice:
            buyPrice.trim() === ''
              ? 0
              : Number.isFinite(Number(buyPrice)) && Number(buyPrice) >= 0
                ? Number(buyPrice)
                : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Request failed');
        return;
      }
      setBestCases(data as BestCasesResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoadingBest(false);
    }
  }, [usdPerBuy, buyPrice, selected]);

  const busy = loading || loadingBest;

  const applyPair = useCallback((buy: number, sell: number) => {
    setBuyPrice(String(buy));
    setSellPrice(String(sell));
  }, []);

  return (
    <Card className="max-w-5xl p-5 md:p-6 space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground leading-snug">
          <span className="font-medium text-foreground">Rounds (slugs per JSON):</span>{' '}
          {result == null ? (
            <span>—</span>
          ) : (
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              {selectedOrder.map((id, i) => (
                <span key={id}>
                  {i > 0 ? <span className="text-muted-foreground/40 px-0.5">·</span> : null}
                  <span className="text-foreground font-medium">{COIN_LABEL[id]}</span>{' '}
                  <span className="tabular-nums">{result.roundsByCoin[id] ?? 0}</span>
                </span>
              ))}
            </span>
          )}
        </p>
      </div>

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="buy-price" className="text-sm font-medium">
              Price to buy
            </label>
            <Input
              id="buy-price"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0.45"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sell-price" className="text-sm font-medium">
              Price to sell
            </label>
            <Input
              id="sell-price"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0.55"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="usd-buy" className="text-sm font-medium">
              USD per buy (once)
            </label>
            <Input
              id="usd-buy"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              placeholder="32"
              value={usdPerBuy}
              onChange={(e) => setUsdPerBuy(e.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
          Sell must be <span className="text-foreground font-medium">greater than</span> buy for
          Calculate. Buy when market &lt; buy; sell when market &gt; sell. Multi mode: at most 5 buys and
          5 sells per slug per market. <span className="text-foreground">Find best cases</span> uses{' '}
          <span className="font-medium">Price to buy</span> as the minimum buy threshold only (leave empty
          for 0).
        </p>
      </div>

      <div className="space-y-2 pt-0.5">
        <p className="text-sm font-medium">Markets</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {COIN_OPTIONS.map(({ id, label }) => (
            <label
              key={id}
              className={cn(
                'flex items-center gap-2 text-sm cursor-pointer select-none',
                'rounded-md px-2 py-1 -mx-2 transition-colors',
                selected.has(id) ? 'bg-accent' : 'hover:bg-muted/60',
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(id)}
                onChange={() => toggleCoin(id)}
                className="size-4 rounded border-input accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={runCalc} disabled={busy} className="sm:min-w-[7rem]">
          {loading ? 'Calculating…' : 'Calculate'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={runFindBest}
          disabled={busy}
          className="sm:min-w-[9rem]"
        >
          {loadingBest ? 'Searching…' : 'Find best cases'}
        </Button>
      </div>

      {bestCases ? <BestCasesSection data={bestCases} onApplyPair={applyPair} /> : null}

      <div className="space-y-4 pt-1">
        {result == null ? (
          <div className="rounded-lg border border-border bg-muted/30 p-5">
            <p className="text-muted-foreground text-sm">Results appear here after you calculate.</p>
          </div>
        ) : (
          <>
          <ResultBlock
            title="Multi within each round (per coin)"
            description="Same slug: repeated buy/sell as prices move; each market still has its own balance."
            scenario={result.multiWithinRound}
            coinOrder={selectedOrder}
          />
            <ResultBlock
              title="Once per round (per coin)"
              description="Within each slug, at most one buy and one sell; no re-entry after sell until the next slug."
              scenario={result.oncePerRound}
              coinOrder={selectedOrder}
            />
          </>
        )}
      </div>
    </Card>
  );
}
