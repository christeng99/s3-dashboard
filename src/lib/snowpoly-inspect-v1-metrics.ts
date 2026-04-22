import type { SnowpolyHistoryRow } from '@/lib/snowpoly-history-query';
import {
  buildSnowpolyRoundGroupsFromHistory,
  type SnowpolyRoundRow,
} from '@/lib/snowpoly-inspect-v3-metrics';

const MIN_BUY = 1e-4;

/** Inclusive sweep: 0.1, 0.2, … 10.0 (100 steps). */
export const INSPECT_V1_PROFIT_RATE_TENTHS_MIN = 1;
export const INSPECT_V1_PROFIT_RATE_TENTHS_MAX = 100;

export type InspectV1SweepRow = {
  profitRate: number;
  /** Rounds where we had a buy (snapshot at or before fixed B). */
  totalRounds: number;
  totalSold: number;
  sellSuccessPct: number;
  spent: number;
  earned: number;
  profit: number;
  minBalance: number;
};

export type InspectV1ProfitRateSweepResult = {
  rows: InspectV1SweepRow[];
  /** Mean buy level at fixed B across rounds that had a tick by B; null if none. */
  avgBuyPrice: number | null;
};

function buyPriceAtOrBefore(
  rows: SnowpolyRoundRow[],
  Bsec: number,
): { row: SnowpolyRoundRow; price: number } | null {
  const cutoffMs = Bsec * 1000;
  let last: SnowpolyRoundRow | null = null;
  for (const r of rows) {
    if (r.msecs <= cutoffMs) last = r;
  }
  if (!last) return null;
  const price =
    last.mid != null && Number.isFinite(last.mid) ? last.mid : last.ask;
  if (!Number.isFinite(price) || price < MIN_BUY) return null;
  return { row: last, price };
}

function firstBidAtOrAboveAfter(
  rows: SnowpolyRoundRow[],
  afterMsecs: number,
  target: number,
): SnowpolyRoundRow | null {
  for (const r of rows) {
    if (r.msecs <= afterMsecs) continue;
    if (r.bid + 1e-12 >= target) return r;
  }
  return null;
}

/**
 * Fixed buy time B (seconds from round start): last tick at or before B is the buy.
 * Sweeps profitRate from 0.1 to 10.0 in steps of 0.1; for each, find first later tick with
 * best_bid ≥ buyPrice × (1 + profitRate) (capped at 0.999).
 * Rows sorted by sellSuccessPct DESC, profit DESC, minBalance DESC.
 */
export function computeSnowpolyInspectV1ProfitRateSweep(
  rows: SnowpolyHistoryRow[],
  params: { usdPerBuy: number; buyTimeSec: number },
): InspectV1ProfitRateSweepResult {
  const { usdPerBuy, buyTimeSec: B } = params;
  if (!Number.isFinite(usdPerBuy) || usdPerBuy <= 0 || !Number.isFinite(B)) {
    return { rows: [], avgBuyPrice: null };
  }

  const groups = buildSnowpolyRoundGroupsFromHistory(rows);

  let sumBuy = 0;
  let nBuy = 0;
  for (const g of groups) {
    if (g.rows.length === 0) continue;
    const snap = buyPriceAtOrBefore(g.rows, B);
    if (!snap) continue;
    sumBuy += snap.price;
    nBuy += 1;
  }
  const avgBuyPrice = nBuy > 0 ? sumBuy / nBuy : null;

  const out: InspectV1SweepRow[] = [];

  for (let t = INSPECT_V1_PROFIT_RATE_TENTHS_MIN; t <= INSPECT_V1_PROFIT_RATE_TENTHS_MAX; t += 1) {
    const profitRate = t / 10;

    let totalRounds = 0;
    let totalSold = 0;
    let spent = 0;
    let earned = 0;
    let cash = 0;
    let minCash = 0;

    const bumpMin = () => {
      if (cash < minCash) minCash = cash;
    };

    for (const g of groups) {
      if (g.rows.length === 0) continue;

      const snap = buyPriceAtOrBefore(g.rows, B);
      if (!snap) continue;

      totalRounds += 1;
      const buyPrice = snap.price;
      const tBuy = snap.row.msecs;
      let sellTarget = buyPrice * (1 + profitRate);
      if (sellTarget > 0.999) sellTarget = 0.999;

      const sellRow = firstBidAtOrAboveAfter(g.rows, tBuy, sellTarget);

      spent += usdPerBuy;
      cash -= usdPerBuy;
      bumpMin();

      if (sellRow) {
        const tokens = usdPerBuy / buyPrice;
        const proceeds = tokens * sellRow.bid;
        earned += proceeds;
        cash += proceeds;
        bumpMin();
        totalSold += 1;
      }
    }

    const profit = earned - spent;
    const sellSuccessPct = totalRounds > 0 ? (100 * totalSold) / totalRounds : 0;

    out.push({
      profitRate,
      totalRounds,
      totalSold,
      sellSuccessPct,
      spent,
      earned,
      profit,
      minBalance: minCash < 0 ? -minCash : 0,
    });
  }

  out.sort((a, b) => {
    if (b.sellSuccessPct !== a.sellSuccessPct) return b.sellSuccessPct - a.sellSuccessPct;
    if (b.profit !== a.profit) return b.profit - a.profit;
    return b.minBalance - a.minBalance;
  });

  return { rows: out, avgBuyPrice };
}
