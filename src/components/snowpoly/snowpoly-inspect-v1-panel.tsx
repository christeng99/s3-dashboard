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

type SweepRow = {
  profitRate: number;
  totalRounds: number;
  totalSold: number;
  sellSuccessPct: number;
  spent: number;
  earned: number;
  profit: number;
  minBalance: number;
};

type ApiResponse = {
  meta: {
    coin: string;
    date: string;
    usdPerBuy: number;
    buyTimeSec: number;
    avgBuyPrice: number | null;
    rowCount: number;
    totalRowsInTable: number;
    s3Key: string;
  };
  table: SweepRow[];
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

function fmtProfitRate(n: number) {
  return n.toFixed(1);
}

export function SnowpolyInspectV1Panel() {
  const groupId = useId();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [usdPerBuy, setUsdPerBuy] = useState("");
  const [buyTimeSec, setBuyTimeSec] = useState("8");
  const [token, setToken] = useState<CoinId | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const find = useCallback(async () => {
    setError(null);
    setResult(null);
    const usd = Number(usdPerBuy);
    const b = Number(buyTimeSec);
    if (!date?.trim()) {
      setError("Pick a date (loads snowpoly_history/prices_YYYY-MM-DD.db).");
      return;
    }
    if (!Number.isFinite(usd) || usd <= 0) {
      setError("Enter a positive usdPerBuy.");
      return;
    }
    if (!Number.isFinite(b) || b < 0 || b > 300) {
      setError("buy time (seconds) must be between 0 and 300.");
      return;
    }
    if (!token) {
      setError("Select a market.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/snowpoly-inspect-v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.trim(),
          usdPerBuy: usd,
          buyTimeSec: b,
          coin: token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Request failed",
        );
        return;
      }
      setResult(data as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [date, usdPerBuy, buyTimeSec, token]);

  const rows = result?.table ?? [];

  const snapshotLabel =
    result != null
      ? `${result.meta.buyTimeSec}s (${
          result.meta.avgBuyPrice != null
            ? result.meta.avgBuyPrice.toFixed(2)
            : "—"
        })`
      : null;

  return (
    <Card className="max-w-6xl p-5 md:p-6 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">
        SnowPoly Inspect - V1
      </h2>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Fixed buy time <span className="text-foreground">B</span> (last tick at or before B; mid else
        ask). Sweeps <span className="text-foreground">profitRate</span> from 0.1 to 10.0 in steps of
        0.1; each row sells when best_bid ≥ buy × (1 + profitRate), capped at 0.999. Mean buy level
        at B is shown as <span className="font-mono">8s (0.48)</span>. Sort: sell success %, profit,
        min balance (desc).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 min-w-[9rem] flex-1 sm:flex-initial sm:max-w-[11rem]">
          <label htmlFor="inspect-v1-date" className="text-sm font-medium">
            Date
          </label>
          <Input
            id="inspect-v1-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v1-usd" className="text-sm font-medium">
            usdPerBuy
          </label>
          <Input
            id="inspect-v1-usd"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            placeholder="e.g. 25"
            value={usdPerBuy}
            onChange={(e) => setUsdPerBuy(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v1-b" className="text-sm font-medium">
            Buy time B (s)
          </label>
          <Input
            id="inspect-v1-b"
            type="number"
            inputMode="numeric"
            min={0}
            max={300}
            step={1}
            placeholder="8"
            value={buyTimeSec}
            onChange={(e) => setBuyTimeSec(e.target.value)}
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

      {result != null ? (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="text-xs text-muted-foreground px-3 pt-3 space-y-1">
            <p className="font-mono break-all">{result.meta.s3Key}</p>
            <p>
              {result.meta.rowCount} rows · {result.meta.coin} · Avg buy @ B:{" "}
              <span className="font-mono text-foreground">{snapshotLabel}</span>
            </p>
          </div>
          <div className="max-h-[min(70vh,560px)] overflow-auto mt-2">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3 font-medium tabular-nums">profitRate</th>
                  <th className="py-2 px-3 font-medium tabular-nums">
                    Total rounds
                  </th>
                  <th className="py-2 px-3 font-medium tabular-nums">
                    Total sold
                  </th>
                  <th className="py-2 px-3 font-medium tabular-nums">
                    Sell success %
                  </th>
                  <th className="py-2 px-3 font-medium tabular-nums">
                    Total spent
                  </th>
                  <th className="py-2 px-3 font-medium tabular-nums">
                    Total earned
                  </th>
                  <th className="py-2 px-3 font-medium tabular-nums">
                    Min balance
                  </th>
                  <th className="py-2 px-3 font-medium tabular-nums">Profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      className="py-8 px-3 text-muted-foreground text-center"
                      colSpan={8}
                    >
                      No rows.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.profitRate}
                      className="border-b border-border/60 hover:bg-muted/30"
                    >
                      <td className="py-1.5 px-3 tabular-nums font-mono text-xs">
                        {fmtProfitRate(r.profitRate)}
                      </td>
                      <td className="py-1.5 px-3 tabular-nums">
                        {r.totalRounds}
                      </td>
                      <td className="py-1.5 px-3 tabular-nums">{r.totalSold}</td>
                      <td className="py-1.5 px-3 tabular-nums">
                        {pct(r.sellSuccessPct)}
                      </td>
                      <td className="py-1.5 px-3 tabular-nums">
                        {money(r.spent)}
                      </td>
                      <td className="py-1.5 px-3 tabular-nums">
                        {money(r.earned)}
                      </td>
                      <td className="py-1.5 px-3 tabular-nums">
                        {money(r.minBalance)}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 px-3 tabular-nums font-medium",
                          r.profit < 0 && "text-destructive",
                          r.profit > 0 &&
                            "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {money(r.profit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
