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

function sec2(n: number | null): string {
  if (n == null) return "-";
  return n.toFixed(2);
}

function pct(n: number | null): string {
  if (n == null) return "-";
  return `${n.toFixed(1)}%`;
}

type InspectV2AppearanceRoundRow = {
  roundTs: string;
  firstAppearanceSec: number | null;
  secondAppearanceSec: number | null;
};

type InspectV2Metrics = {
  totalRounds: number;
  firstAppearanceCount: number;
  secondAppearanceCount: number;
  firstVsSecondPct: number | null;
  firstVsTotalPct: number | null;
  rounds: InspectV2AppearanceRoundRow[];
};

type InspectV2Response = {
  meta: {
    date: string;
    token: string;
    s3Key: string;
    rowCount: number;
    totalRowsInTable: number;
    firstPrice: number;
    secondPrice: number;
  };
  metrics: InspectV2Metrics;
};

export function InspectV2Panel() {
  const groupId = useId();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fileDate, setFileDate] = useState(today);
  const [firstPrice, setFirstPrice] = useState("0.50");
  const [secondPrice, setSecondPrice] = useState("0.55");
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
    const first = Number(firstPrice);
    const second = Number(secondPrice);
    if (!Number.isFinite(first) || first < 0.01 || first > 0.99) {
      setError("1st Price must be between 0.01 and 0.99.");
      return;
    }
    if (!Number.isFinite(second) || second < 0.01 || second > 0.99) {
      setError("2nd Price must be between 0.01 and 0.99.");
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
          firstPrice: first,
          secondPrice: second,
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
  }, [fileDate, firstPrice, secondPrice, token]);

  const columns = useMemo(() => {
    const rows = result?.metrics.rounds ?? [];
    const cols: [InspectV2AppearanceRoundRow[], InspectV2AppearanceRoundRow[], InspectV2AppearanceRoundRow[]] =
      [[], [], []];
    rows.forEach((row, idx) => cols[idx % 3].push(row));
    return cols;
  }, [result?.metrics.rounds]);

  return (
    <Card className="max-w-6xl p-5 md:p-6 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Inspect V2</h2>
      <p className="text-sm text-muted-foreground max-w-4xl">
        Pick date + coin, enter 1st/2nd prices, then Find. Per round: first appearance of 1st Price on{" "}
        <span className="text-foreground">best_ask</span>, then first appearance of 2nd Price on{" "}
        <span className="text-foreground">best_bid</span> after <span className="text-foreground">+3s</span>.
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
        <div className="space-y-1.5 min-w-[8rem]">
          <label htmlFor="inspect-v2-first-price" className="text-sm font-medium">
            1st Price
          </label>
          <Input
            id="inspect-v2-first-price"
            type="number"
            inputMode="decimal"
            min={0.01}
            max={0.99}
            step={0.01}
            value={firstPrice}
            onChange={(e) => setFirstPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem]">
          <label htmlFor="inspect-v2-second-price" className="text-sm font-medium">
            2nd Price
          </label>
          <Input
            id="inspect-v2-second-price"
            type="number"
            inputMode="decimal"
            min={0.01}
            max={0.99}
            step={0.01}
            value={secondPrice}
            onChange={(e) => setSecondPrice(e.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={find}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? "…" : "Find"}
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

      {result ? (
        <div className="rounded-md border border-border p-4">
          <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-3">
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total Rounds</dt>
              <dd className="tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {result.metrics.totalRounds}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">1st App</dt>
              <dd className="tabular-nums text-2xl font-semibold text-indigo-700 dark:text-indigo-300">
                {result.metrics.firstAppearanceCount}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">2nd App</dt>
              <dd className="tabular-nums text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
                {result.metrics.secondAppearanceCount}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">2nd / 1st</dt>
              <dd className="tabular-nums text-2xl font-semibold text-amber-700 dark:text-amber-300">
                {pct(result.metrics.firstVsSecondPct)}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">1st / Total</dt>
              <dd className="tabular-nums text-2xl font-semibold text-sky-700 dark:text-sky-300">
                {pct(result.metrics.firstVsTotalPct)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {columns.map((rows, colIdx) => (
          <div key={`inspect-v2-col-${colIdx}`} className="rounded-md border border-border">
            <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="py-1.5 px-2 font-medium text-sky-700 dark:text-sky-300">round_ts</th>
                <th className="py-1.5 px-2 font-medium text-indigo-700 dark:text-indigo-300">1st_App (s)</th>
                <th className="py-1.5 px-2 font-medium text-emerald-700 dark:text-emerald-300">2nd_App (s)</th>
              </tr>
            </thead>
            <tbody>
              {result ? (
                rows.map((r) => (
                  <tr key={`${colIdx}-${r.roundTs}`} className="border-b border-border/60">
                    <td className="py-1.5 px-2 tabular-nums text-sky-700 dark:text-sky-300 font-mono text-xs">
                      {r.roundTs}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-indigo-700 dark:text-indigo-300">
                      {sec2(r.firstAppearanceSec)}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-emerald-700 dark:text-emerald-300">
                      {sec2(r.secondAppearanceSec)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="py-6 px-2 text-muted-foreground text-center"
                    colSpan={3}
                  >
                    Pick date, prices and coin, then Find.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        ))}
      </div>
      {result ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Source:</span>{" "}
          <span className="font-mono">{result.meta.s3Key}</span> · Date {result.meta.date} · Rows{" "}
          {result.meta.rowCount}/{result.meta.totalRowsInTable} · Token{" "}
          <span className="font-mono">{result.meta.token}</span> · 1st{" "}
          <span className="font-mono">{priceLevel(result.meta.firstPrice)}</span> · 2nd{" "}
          <span className="font-mono">{priceLevel(result.meta.secondPrice)}</span>
        </p>
      ) : null}
    </Card>
  );
}
