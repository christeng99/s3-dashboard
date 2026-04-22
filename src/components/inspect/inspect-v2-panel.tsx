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

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

type InspectV2Summary = {
  totalRounds: number;
  bought: number;
  soldAt1: number;
  soldAt0: number;
  successPct: number | null;
  spent: number;
  earned: number;
  profit: number;
  minBalance: number;
};

type InspectV2Response = {
  meta: {
    date: string;
    timeSeconds: number;
    amount: number;
    priceToBuy: number;
    token: string;
    s3Key: string;
    rowCount: number;
    totalRowsInTable: number;
  };
  summary: InspectV2Summary;
};

const USD_LEVEL_MIN = 0.01;
const USD_LEVEL_MAX = 1;

function isUsdLevel(n: number): boolean {
  return Number.isFinite(n) && n >= USD_LEVEL_MIN && n <= USD_LEVEL_MAX;
}

export function InspectV2Panel() {
  const groupId = useId();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fileDate, setFileDate] = useState(today);
  const [timeSeconds, setTimeSeconds] = useState("");
  const [amount, setAmount] = useState("");
  const [priceToBuy, setPriceToBuy] = useState("0.45");
  const [token, setToken] = useState<CoinId | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectV2Response | null>(null);

  const find = useCallback(async () => {
    setError(null);
    setResult(null);
    const t = Number(timeSeconds);
    const a = Number(amount);
    const pb = Number(priceToBuy);
    if (!fileDate?.trim()) {
      setError("Pick a date (loads snowpoly_history/prices_YYYY-MM-DD.db).");
      return;
    }
    if (!Number.isFinite(t) || t < 0 || t > 300) {
      setError("Time must be a number from 0 to 300 (seconds).");
      return;
    }
    if (!Number.isFinite(a) || a <= 0) {
      setError("Amount must be a positive number (USD per buy).");
      return;
    }
    if (!isUsdLevel(pb)) {
      setError(
        `Price to buy must be a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
      );
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
          timeSeconds: t,
          amount: a,
          priceToBuy: pb,
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
  }, [fileDate, timeSeconds, amount, priceToBuy, token]);

  const s = result?.summary;

  return (
    <Card className="max-w-5xl p-5 md:p-6 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Inspect V0</h2>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Pick the <span className="text-foreground">date</span> to load exactly one file:{" "}
        <span className="font-mono text-xs">snowpoly_history/prices_YYYY-MM-DD.db</span> (same SQLite as Inspect
        V3). All metrics are for that calendar day only. Per <span className="text-foreground">round_ts</span>{" "}
        round: first tick in the first <span className="text-foreground">time (seconds)</span> window where real
        price ≤ <span className="text-foreground">price to buy</span> (mid if present, else best ask). Settle at
        $1 if the <strong>last</strong> tick settle level ≥ 0.50 (mid, else bid–ask mid, else ask), otherwise $0.
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
            placeholder="0–300"
            value={timeSeconds}
            onChange={(e) => setTimeSeconds(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v2-amount" className="text-sm font-medium">
            Amount (USD / buy)
          </label>
          <Input
            id="inspect-v2-amount"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            placeholder="e.g. 25"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[11rem]">
          <label htmlFor="inspect-v2-buy" className="text-sm font-medium">
            Price to buy (≤)
          </label>
          <Input
            id="inspect-v2-buy"
            type="number"
            inputMode="decimal"
            min={USD_LEVEL_MIN}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder={`${USD_LEVEL_MIN}–${USD_LEVEL_MAX}`}
            value={priceToBuy}
            onChange={(e) => setPriceToBuy(e.target.value)}
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

      {s != null ? (
        <div className="rounded-md border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Results</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Total rounds</dt>
              <dd className="tabular-nums font-medium">{s.totalRounds}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Bought</dt>
              <dd className="tabular-nums font-medium">{s.bought}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Sold at $1</dt>
              <dd className="tabular-nums font-medium">{s.soldAt1}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Sold at $0</dt>
              <dd className="tabular-nums font-medium">{s.soldAt0}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Success rate</dt>
              <dd className="tabular-nums font-medium">
                {pct(s.successPct)}{" "}
                <span className="text-muted-foreground font-normal">
                  (sold $1 / bought)
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Total spent</dt>
              <dd className="tabular-nums font-medium">{money(s.spent)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Total earned</dt>
              <dd className="tabular-nums font-medium">{money(s.earned)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:border-0 sm:pb-0">
              <dt className="text-muted-foreground">Min. balance need</dt>
              <dd className="tabular-nums font-medium">
                {money(s.minBalance)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 sm:col-span-2 lg:col-span-3">
              <dt className="text-muted-foreground">Net profit</dt>
              <dd
                className={cn(
                  "tabular-nums font-semibold",
                  s.profit < 0 && "text-destructive",
                  s.profit > 0 && "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {money(s.profit)}
              </dd>
            </div>
          </dl>
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
                  <td className="py-2 px-3 font-mono text-xs break-all">
                    {result.meta.s3Key}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Date</td>
                  <td className="py-2 px-3 tabular-nums">{result.meta.date}</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Rows loaded</td>
                  <td className="py-2 px-3 tabular-nums">
                    {result.meta.rowCount} / {result.meta.totalRowsInTable}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Time (s)</td>
                  <td className="py-2 px-3 tabular-nums">
                    {result.meta.timeSeconds}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Amount</td>
                  <td className="py-2 px-3 tabular-nums">
                    {result.meta.amount}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">
                    Price to buy
                  </td>
                  <td className="py-2 px-3 tabular-nums">
                    {priceLevel(result.meta.priceToBuy)}
                  </td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-2 px-3 text-muted-foreground">Token</td>
                  <td className="py-2 px-3 font-mono text-xs">
                    {result.meta.token}
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td
                  className="py-8 px-3 text-muted-foreground text-center"
                  colSpan={2}
                >
                  Pick the date and filters, then Run. Simulation uses only that
                  day&apos;s Snowpoly SQLite file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
