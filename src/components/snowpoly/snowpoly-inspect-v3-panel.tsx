"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { compareInspectV3MetricRows } from "@/lib/snowpoly-inspect-v3-metrics";
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

type MetricRow = {
  buyX: number;
  totalRounds: number;
  xAppearance: number;
  xDiffAppearance: number;
  spent: number;
  got: number;
  profit: number;
};

type InspectV3Response = {
  meta: {
    coin: string;
    date: string;
    timeSeconds: number;
    amount: number;
    priceDiff: number;
    minimumPrice: number;
    belowAndAbove: boolean;
    rowCount: number;
    totalRowsInTable: number;
    s3Key: string;
  };
  rows: MetricRow[];
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function priceLevel(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const USD_LEVEL_MIN = 0.01;
const USD_LEVEL_MAX = 1;

function isUsdLevel(n: number): boolean {
  return Number.isFinite(n) && n >= USD_LEVEL_MIN && n <= USD_LEVEL_MAX;
}

export function SnowpolyInspectV3Panel() {
  const groupId = useId();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [timeSeconds, setTimeSeconds] = useState("");
  const [amount, setAmount] = useState("");
  const [priceDiff, setPriceDiff] = useState("0.10");
  const [minimumPrice, setMinimumPrice] = useState("0.01");
  const [belowAndAbove, setBelowAndAbove] = useState(false);
  const [token, setToken] = useState<CoinId | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectV3Response | null>(null);

  const find = useCallback(async () => {
    setError(null);
    setResult(null);
    const t = Number(timeSeconds);
    const a = Number(amount);
    const pd = Number(priceDiff);
    const mp = Number(minimumPrice);
    if (!date?.trim()) {
      setError("Pick a date (loads snowpoly_history/prices_YYYY-MM-DD.db).");
      return;
    }
    if (!Number.isFinite(t) || t < 0 || t > 300) {
      setError("Time must be a number from 0 to 300 (seconds).");
      return;
    }
    if (!Number.isFinite(a)) {
      setError("Enter a valid amount.");
      return;
    }
    if (!isUsdLevel(pd)) {
      setError(
        `Price diff must be a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
      );
      return;
    }
    if (!isUsdLevel(mp)) {
      setError(
        `Min buy X must be a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
      );
      return;
    }
    if (!token) {
      setError("Select a market.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/inspect-v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin: token,
          date: date.trim(),
          timeSeconds: t,
          amount: a,
          priceDiff: pd,
          minimumPrice: mp,
          belowAndAbove,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Request failed",
        );
        return;
      }
      setResult(data as InspectV3Response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [timeSeconds, amount, priceDiff, minimumPrice, belowAndAbove, token, date]);

  const displayRows = useMemo(() => {
    if (result == null || result.rows.length === 0) return [];
    const sorted = [...result.rows].sort(compareInspectV3MetricRows);
    const positive = sorted.filter((r) => r.profit > 0);
    const nonPositive = sorted.filter((r) => r.profit <= 0);
    return [...positive, ...nonPositive];
  }, [result]);

  return (
    <Card className="max-w-6xl p-5 md:p-6 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">
        Snowpoly Inspect - v3
      </h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 min-w-[9rem] flex-1 sm:flex-initial sm:max-w-[11rem]">
          <label htmlFor="inspect-v3-date" className="text-sm font-medium">
            Date
          </label>
          <Input
            id="inspect-v3-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v3-time" className="text-sm font-medium">
            Time (seconds)
          </label>
          <Input
            id="inspect-v3-time"
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
          <label htmlFor="inspect-v3-amount" className="text-sm font-medium">
            Amount
          </label>
          <Input
            id="inspect-v3-amount"
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[11rem]">
          <label htmlFor="inspect-v3-pricediff" className="text-sm font-medium">
            Price diff (USD level)
          </label>
          <Input
            id="inspect-v3-pricediff"
            type="number"
            inputMode="decimal"
            min={USD_LEVEL_MIN}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder={`${USD_LEVEL_MIN}–${USD_LEVEL_MAX}`}
            value={priceDiff}
            onChange={(e) => setPriceDiff(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[11rem]">
          <label htmlFor="inspect-v3-minprice" className="text-sm font-medium">
            Min buy X (USD level)
          </label>
          <Input
            id="inspect-v3-minprice"
            type="number"
            inputMode="decimal"
            min={USD_LEVEL_MIN}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder={`${USD_LEVEL_MIN}–${USD_LEVEL_MAX}`}
            value={minimumPrice}
            onChange={(e) => setMinimumPrice(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-2 shrink-0 max-w-[14rem] leading-snug">
          <input
            type="checkbox"
            checked={belowAndAbove}
            onChange={(e) => setBelowAndAbove(e.target.checked)}
            className="size-4 rounded border-input accent-primary shrink-0 mt-0.5"
          />
          Below &amp; above (ask band 0.7·X…X; bid ≥ X + diff)
        </label>
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
        <div className="rounded-md border border-border overflow-x-auto">
          <p className="text-sm text-muted-foreground px-3 pt-3">
            {result.meta.s3Key} · {result.meta.rowCount} row
            {result.meta.rowCount === 1 ? "" : "s"} loaded · Total rounds:{" "}
            {result.rows[0]?.totalRounds ?? 0}
          </p>
          <table className="w-full text-sm border-collapse min-w-[720px] mt-2 mb-3">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="py-2 px-3 font-medium tabular-nums">buy X</th>
                <th className="py-2 px-3 font-medium tabular-nums">
                  Total Rounds
                </th>
                <th className="py-2 px-3 font-medium tabular-nums">
                  X Appearance
                </th>
                <th className="py-2 px-3 font-medium tabular-nums">
                  X+Diff Appearance
                </th>
                <th className="py-2 px-3 font-medium tabular-nums">Spent</th>
                <th className="py-2 px-3 font-medium tabular-nums">Got</th>
                <th className="py-2 px-3 font-medium tabular-nums">Profit</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 px-3 text-muted-foreground text-center"
                    colSpan={7}
                  >
                    No buy-X cases for this min X and price diff (check inputs).
                  </td>
                </tr>
              ) : (
                displayRows.map((row, i) => {
                  const prev = i > 0 ? displayRows[i - 1] : null;
                  const sectionBreak =
                    prev != null && prev.profit > 0 && row.profit <= 0;
                  return (
                  <tr
                    key={String(row.buyX)}
                    className={cn(
                      "border-b border-border/60",
                      row.profit > 0 &&
                        "bg-emerald-500/12 dark:bg-emerald-500/15",
                      sectionBreak && "border-t-4 border-t-primary",
                    )}
                  >
                    <td className="py-2 px-3 tabular-nums">
                      {priceLevel(row.buyX)}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {row.totalRounds}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {row.xAppearance}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {row.xDiffAppearance}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {money(row.spent)}
                    </td>
                    <td className="py-2 px-3 tabular-nums">{money(row.got)}</td>
                    <td
                      className={cn(
                        "py-2 px-3 tabular-nums font-medium",
                        row.profit < 0 && "text-destructive",
                        row.profit > 0 &&
                          "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {money(row.profit)}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
