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
  priceDiff?: number;
  totalRounds: number;
  xAppearance: number;
  xDiffAppearance: number;
  spent: number;
  got: number;
  profit: number;
};

type AdaptiveRoundRow = {
  roundIndex: number;
  roundKey: string;
  applied: boolean;
  buyX: number | null;
  priceDiff: number | null;
  spent: number;
  got: number;
  profit: number;
  xAppearance: number;
  xDiffAppearance: number;
};

type AdaptiveResult = {
  mode: "v1" | "v2";
  bufferRounds: number;
  lookbackRounds: number;
  totalRounds: number;
  totalSpent: number;
  totalGot: number;
  totalProfit: number;
  rounds: AdaptiveRoundRow[];
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
  adaptiveResult?: AdaptiveResult | null;
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

function isUsdLevelPriceDiff(n: number): boolean {
  return n === 0 || isUsdLevel(n);
}

function validateAdaptiveSearchRanges(
  priceMin: number,
  priceMax: number,
  diffMin: number,
  diffMax: number,
): string | null {
  if (
    !Number.isFinite(priceMin) ||
    !Number.isFinite(priceMax) ||
    !Number.isFinite(diffMin) ||
    !Number.isFinite(diffMax)
  ) {
    return "V1/V2: price and diff ranges must be valid numbers.";
  }
  if (
    priceMin < USD_LEVEL_MIN ||
    priceMax > USD_LEVEL_MAX ||
    priceMin > priceMax
  ) {
    return `V1/V2: price range must be ${USD_LEVEL_MIN}–${USD_LEVEL_MAX} with min ≤ max.`;
  }
  if (diffMin < 0 || diffMax > USD_LEVEL_MAX || diffMin > diffMax) {
    return `V1/V2: diff range must be 0–${USD_LEVEL_MAX} with min ≤ max.`;
  }
  return null;
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
  const [bufferRounds, setBufferRounds] = useState("0");
  const [adaptivePriceMin, setAdaptivePriceMin] = useState("0.01");
  const [adaptivePriceMax, setAdaptivePriceMax] = useState("0.99");
  const [adaptiveDiffMin, setAdaptiveDiffMin] = useState("0");
  const [adaptiveDiffMax, setAdaptiveDiffMax] = useState("1");
  const [token, setToken] = useState<CoinId | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectV3Response | null>(null);

  const find = useCallback(async (strategyMode?: "v1" | "v2") => {
    setError(null);
    setResult(null);
    const t = Number(timeSeconds);
    const a = Number(amount);
    const pd = Number(priceDiff);
    const mp = Number(minimumPrice);
    const br = Number(bufferRounds);
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
    if (!isUsdLevelPriceDiff(pd)) {
      setError(
        `Price diff must be 0 or a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
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
    if (!Number.isFinite(br) || br < 0) {
      setError("Buffer rounds must be a non-negative number.");
      return;
    }
    if (strategyMode) {
      const apMin = Number(adaptivePriceMin);
      const apMax = Number(adaptivePriceMax);
      const adMin = Number(adaptiveDiffMin);
      const adMax = Number(adaptiveDiffMax);
      const rangeErr = validateAdaptiveSearchRanges(apMin, apMax, adMin, adMax);
      if (rangeErr) {
        setError(rangeErr);
        return;
      }
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
          bufferRounds: br,
          strategyMode,
          adaptivePriceMin: Number(adaptivePriceMin),
          adaptivePriceMax: Number(adaptivePriceMax),
          adaptiveDiffMin: Number(adaptiveDiffMin),
          adaptiveDiffMax: Number(adaptiveDiffMax),
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
  }, [
    timeSeconds,
    amount,
    priceDiff,
    minimumPrice,
    belowAndAbove,
    token,
    date,
    bufferRounds,
    adaptivePriceMin,
    adaptivePriceMax,
    adaptiveDiffMin,
    adaptiveDiffMax,
  ]);

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
            min={0}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder="0 or 0.01–1"
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
          onClick={() => find()}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? "…" : "Find"}
        </Button>
        <Button
          type="button"
          onClick={() => find("v1")}
          disabled={loading}
          className="shrink-0"
          variant="secondary"
        >
          {loading ? "…" : "V1"}
        </Button>
        <Button
          type="button"
          onClick={() => find("v2")}
          disabled={loading}
          className="shrink-0"
          variant="secondary"
        >
          {loading ? "…" : "V2"}
        </Button>
        <div className="space-y-1.5 min-w-[8rem] flex-1 sm:flex-initial sm:max-w-[10rem]">
          <label htmlFor="inspect-v3-buffer-rounds" className="text-sm font-medium">
            Buffer rounds
          </label>
          <Input
            id="inspect-v3-buffer-rounds"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="0"
            value={bufferRounds}
            onChange={(e) => setBufferRounds(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[7.5rem] flex-1 sm:flex-initial sm:max-w-[9rem]">
          <label
            htmlFor="inspect-v3-adaptive-price-min"
            className="text-sm font-medium"
          >
            Price min (X)
          </label>
          <Input
            id="inspect-v3-adaptive-price-min"
            type="number"
            inputMode="decimal"
            min={USD_LEVEL_MIN}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder="0.01"
            value={adaptivePriceMin}
            onChange={(e) => setAdaptivePriceMin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[7.5rem] flex-1 sm:flex-initial sm:max-w-[9rem]">
          <label
            htmlFor="inspect-v3-adaptive-price-max"
            className="text-sm font-medium"
          >
            Price max (X)
          </label>
          <Input
            id="inspect-v3-adaptive-price-max"
            type="number"
            inputMode="decimal"
            min={USD_LEVEL_MIN}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder="0.99"
            value={adaptivePriceMax}
            onChange={(e) => setAdaptivePriceMax(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[7rem] flex-1 sm:flex-initial sm:max-w-[8.5rem]">
          <label
            htmlFor="inspect-v3-adaptive-diff-min"
            className="text-sm font-medium"
          >
            Diff min
          </label>
          <Input
            id="inspect-v3-adaptive-diff-min"
            type="number"
            inputMode="decimal"
            min={0}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder="0"
            value={adaptiveDiffMin}
            onChange={(e) => setAdaptiveDiffMin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-[7rem] flex-1 sm:flex-initial sm:max-w-[8.5rem]">
          <label
            htmlFor="inspect-v3-adaptive-diff-max"
            className="text-sm font-medium"
          >
            Diff max
          </label>
          <Input
            id="inspect-v3-adaptive-diff-max"
            type="number"
            inputMode="decimal"
            min={0}
            max={USD_LEVEL_MAX}
            step={0.01}
            placeholder="1"
            value={adaptiveDiffMax}
            onChange={(e) => setAdaptiveDiffMax(e.target.value)}
          />
        </div>
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
        <div className="space-y-4">
          {!result.adaptiveResult ? (
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

          {result.adaptiveResult ? (
            <div className="rounded-md border border-border overflow-x-auto">
              <p className="text-sm text-muted-foreground px-3 pt-3">
                IT {result.adaptiveResult.mode.toUpperCase()} · Buffer rounds:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {result.adaptiveResult.bufferRounds}
                </span>{" "}
                · Lookback:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {result.adaptiveResult.lookbackRounds}
                </span>{" "}
                rounds{" "}
                · Spent:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {money(result.adaptiveResult.totalSpent)}
                </span>{" "}
                · Got:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {money(result.adaptiveResult.totalGot)}
                </span>{" "}
                · Profit:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    result.adaptiveResult.totalProfit < 0 &&
                      "text-destructive",
                    result.adaptiveResult.totalProfit > 0 &&
                      "text-emerald-600 dark:text-emerald-400",
                    result.adaptiveResult.totalProfit === 0 && "text-foreground",
                  )}
                >
                  {money(result.adaptiveResult.totalProfit)}
                </span>
              </p>
              <table className="w-full text-sm border-collapse min-w-[1020px] mt-2 mb-3">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <th className="py-2 px-3 font-medium tabular-nums">Round</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Round key</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Applied</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Buy X</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Diff</th>
                    <th className="py-2 px-3 font-medium tabular-nums">X</th>
                    <th className="py-2 px-3 font-medium tabular-nums">X+Diff</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Spent</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Got</th>
                    <th className="py-2 px-3 font-medium tabular-nums">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {result.adaptiveResult.rounds.map((round) => (
                    <tr
                      key={`${round.roundIndex}-${round.roundKey}`}
                      className={cn(
                        "border-b border-border/60",
                        round.profit > 0 && "bg-emerald-500/12 dark:bg-emerald-500/15",
                      )}
                    >
                      <td className="py-2 px-3 tabular-nums">{round.roundIndex}</td>
                      <td className="py-2 px-3 tabular-nums">{round.roundKey}</td>
                      <td className="py-2 px-3 tabular-nums">
                        {round.applied ? "Yes" : "No"}
                      </td>
                      <td className="py-2 px-3 tabular-nums">
                        {round.buyX == null ? "-" : priceLevel(round.buyX)}
                      </td>
                      <td className="py-2 px-3 tabular-nums">
                        {round.priceDiff == null ? "-" : priceLevel(round.priceDiff)}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{round.xAppearance}</td>
                      <td className="py-2 px-3 tabular-nums">
                        {round.xDiffAppearance}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{money(round.spent)}</td>
                      <td className="py-2 px-3 tabular-nums">{money(round.got)}</td>
                      <td
                        className={cn(
                          "py-2 px-3 tabular-nums font-medium",
                          round.profit < 0 && "text-destructive",
                          round.profit > 0 &&
                            "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {money(round.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
