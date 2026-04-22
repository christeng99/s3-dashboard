"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COIN_OPTIONS = [
  { id: "btc_up", label: "BTC UP" },
  { id: "btc_down", label: "BTC DOWN" },
  { id: "eth_up", label: "ETH UP" },
  { id: "eth_down", label: "ETH DOWN" },
  { id: "sol_up", label: "SOL UP" },
  { id: "sol_down", label: "SOL DOWN" },
  { id: "xrp_up", label: "XRP UP" },
  { id: "xrp_down", label: "XRP DOWN" },
] as const;

type CoinId = (typeof COIN_OPTIONS)[number]["id"];

function priceLevel(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

type InspectV2Row = {
  buyPrice: number;
  totalRounds: number;
  boughtRounds: number;
  wonRounds: number;
  failedRounds: number;
  winProbabilityPct: number | null;
};

type InspectV2Response = {
  meta: {
    date: string;
    token: string;
    s3Key: string;
    rowCount: number;
    totalRowsInTable: number;
  };
  rows: InspectV2Row[];
};

export function InspectV2Panel() {
  const groupId = useId();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fileDate, setFileDate] = useState(today);
  const [token, setToken] = useState<CoinId | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectV2Response | null>(null);

  const find = useCallback(async () => {
    setError(null);
    setResult(null);
    if (!fileDate?.trim()) {
      setError("Pick a date (loads snowpoly_history/prices_YYYY-MM-DD.db).");
      return;
    }
    if (!token) {
      setError("Select a market.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/inspect-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: fileDate.trim(),
          token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.detail === "string"
            ? data.detail
            : typeof data.error === "string"
              ? data.error
              : "Request failed",
        );
        return;
      }
      setResult(data as InspectV2Response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [fileDate, token]);

  const rowsByPriceDesc = useMemo(
    () => [...(result?.rows ?? [])].sort((a, b) => b.buyPrice - a.buyPrice),
    [result?.rows],
  );
  const rowsHighBand = useMemo(
    () => rowsByPriceDesc.filter((r) => r.buyPrice >= 0.5 - 1e-9),
    [rowsByPriceDesc],
  );
  const rowsLowBand = useMemo(
    () => rowsByPriceDesc.filter((r) => r.buyPrice < 0.5 - 1e-9),
    [rowsByPriceDesc],
  );
  const best = useMemo(() => {
    if (!result?.rows?.length) return null;
    return [...result.rows].sort((a, b) => {
      const pa = a.winProbabilityPct ?? -1;
      const pb = b.winProbabilityPct ?? -1;
      if (pb !== pa) return pb - pa;
      return a.buyPrice - b.buyPrice;
    })[0];
  }, [result?.rows]);

  return (
    <Card className="max-w-5xl p-5 md:p-6 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Inspect V2</h2>
      <p className="text-sm text-muted-foreground max-w-3xl">
        For each buy price level from <span className="text-foreground">0.01</span> to{" "}
        <span className="text-foreground">0.99</span>: buy once per round when market price touches that exact{" "}
        cent-level price,
        then evaluate the round by last price: <span className="text-foreground">&gt; 0.85</span> = won,{" "}
        <span className="text-foreground">&lt; 0.15</span> = failed, otherwise ignored. Results are ordered by highest
        winning probability.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 min-w-[10rem] flex-1 sm:flex-initial sm:max-w-[12rem]">
          <label htmlFor="inspect-v2-db-date" className="text-sm font-medium">
            Date
          </label>
          <Input
            id="inspect-v2-db-date"
            type="date"
            value={fileDate}
            onChange={(e) => setFileDate(e.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={find}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? "…" : "Run"}
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
              "flex items-center gap-2 text-sm cursor-pointer select-none",
              "rounded-md px-2 py-1 -mx-2 transition-colors",
              token === id ? "bg-accent" : "hover:bg-muted/60",
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

      {best != null ? (
        <div className="rounded-md border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Top buy level</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Buy price</dt>
              <dd className="tabular-nums font-medium">{priceLevel(best.buyPrice)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Total rounds</dt>
              <dd className="tabular-nums font-medium">{best.totalRounds}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Bought rounds</dt>
              <dd className="tabular-nums font-medium">{best.boughtRounds}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Won rounds</dt>
              <dd className="tabular-nums font-medium">{best.wonRounds}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Failed rounds</dt>
              <dd className="tabular-nums font-medium">{best.failedRounds}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">P(win)</dt>
              <dd className="tabular-nums font-medium">
                {pct(best.winProbabilityPct)}{" "}
                <span className="text-muted-foreground font-normal">(won / (won + failed))</span>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2">
          {result ? (
            <p className="text-xs text-muted-foreground">Price band: 0.99 to 0.50</p>
          ) : null}
          <div className="rounded-md border border-border">
            <table className="w-full text-xs border-collapse table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="py-1.5 px-2 font-medium text-sky-700 dark:text-sky-300">Price</th>
                <th className="py-1.5 px-2 font-medium text-slate-700 dark:text-slate-300">Total</th>
                <th className="py-1.5 px-2 font-medium text-indigo-700 dark:text-indigo-300">Bought</th>
                <th className="py-1.5 px-2 font-medium text-emerald-700 dark:text-emerald-300">Won / Fail</th>
                <th className="py-1.5 px-2 font-medium text-amber-700 dark:text-amber-300">P(win)</th>
              </tr>
            </thead>
            <tbody>
              {result ? (
                rowsHighBand.map((r) => (
                  <tr key={r.buyPrice} className="border-b border-border/60">
                    <td className="py-1.5 px-2 tabular-nums text-sky-700 dark:text-sky-300">
                      {priceLevel(r.buyPrice)}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-slate-700 dark:text-slate-300">
                      {r.totalRounds}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-indigo-700 dark:text-indigo-300">
                      {r.boughtRounds}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums">
                      <span className="text-emerald-700 dark:text-emerald-300">{r.wonRounds}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-rose-700 dark:text-rose-300">{r.failedRounds}</span>
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-amber-700 dark:text-amber-300 font-medium">
                      {pct(r.winProbabilityPct)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="py-6 px-2 text-muted-foreground text-center"
                    colSpan={5}
                  >
                    Pick date and token, then Run.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          {result ? (
            <p className="text-xs text-muted-foreground">Price band: 0.49 to 0.01</p>
          ) : null}
          <div className="rounded-md border border-border">
            <table className="w-full text-xs border-collapse table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="py-1.5 px-2 font-medium text-sky-700 dark:text-sky-300">Price</th>
                <th className="py-1.5 px-2 font-medium text-slate-700 dark:text-slate-300">Total</th>
                <th className="py-1.5 px-2 font-medium text-indigo-700 dark:text-indigo-300">Bought</th>
                <th className="py-1.5 px-2 font-medium text-emerald-700 dark:text-emerald-300">Won / Fail</th>
                <th className="py-1.5 px-2 font-medium text-amber-700 dark:text-amber-300">P(win)</th>
              </tr>
            </thead>
            <tbody>
              {result ? (
                rowsLowBand.map((r) => (
                  <tr key={r.buyPrice} className="border-b border-border/60">
                    <td className="py-1.5 px-2 tabular-nums text-sky-700 dark:text-sky-300">
                      {priceLevel(r.buyPrice)}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-slate-700 dark:text-slate-300">
                      {r.totalRounds}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-indigo-700 dark:text-indigo-300">
                      {r.boughtRounds}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums">
                      <span className="text-emerald-700 dark:text-emerald-300">{r.wonRounds}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-rose-700 dark:text-rose-300">{r.failedRounds}</span>
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-amber-700 dark:text-amber-300 font-medium">
                      {pct(r.winProbabilityPct)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="py-6 px-2 text-muted-foreground text-center"
                    colSpan={5}
                  >
                    Pick date and token, then Run.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      </div>
      {result ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Source:</span>{" "}
          <span className="font-mono">{result.meta.s3Key}</span> · Date {result.meta.date} · Rows{" "}
          {result.meta.rowCount}/{result.meta.totalRowsInTable} · Token{" "}
          <span className="font-mono">{result.meta.token}</span>
        </p>
      ) : null}
    </Card>
  );
}
