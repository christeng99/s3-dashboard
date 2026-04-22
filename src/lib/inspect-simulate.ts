export const INSPECT_COIN_S3_KEYS = {
  btc_up: 'poly_history/btc_up.json',
  btc_down: 'poly_history/btc_down.json',
  eth_up: 'poly_history/eth_up.json',
  eth_down: 'poly_history/eth_down.json',
  sol_up: 'poly_history/sol_up.json',
  sol_down: 'poly_history/sol_down.json',
  xrp_up: 'poly_history/xrp_up.json',
  xrp_down: 'poly_history/xrp_down.json',
} as const;

export type InspectCoinKey = keyof typeof INSPECT_COIN_S3_KEYS;

/**
 * Full S3 object key for poly JSON. Set `INSPECT_POLY_S3_PREFIX` (no leading/trailing slashes)
 * when files live under a parent folder, e.g. `theye` → `theye/poly_history/btc_up.json`.
 */
export function resolveInspectCoinS3Key(coin: InspectCoinKey): string {
  const relative = INSPECT_COIN_S3_KEYS[coin];
  const prefix = process.env.INSPECT_POLY_S3_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix) return relative;
  return `${prefix}/${relative}`;
}

export type PriceHistory = Record<string, number[]>;

export type RoundMetrics = {
  spent: number;
  earned: number;
  bought: number;
  sold: number;
  profit: number;
};

export type CoinTotals = RoundMetrics & { minBalance: number };

function normPrices(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => Number(p) / 100);
}

export function parseInspectHistory(raw: string): PriceHistory {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const out: PriceHistory = {};
  for (const [slug, prices] of Object.entries(data)) {
    out[slug] = normPrices(prices);
  }
  return out;
}

function emptyRoundMetrics(): RoundMetrics {
  return { spent: 0, earned: 0, bought: 0, sold: 0, profit: 0 };
}

export type SimulateCoinOptions = { recordRounds?: boolean };

/** Max buy fills and max sell fills per slug in multi-trades mode (once-per-round already ≤1 each). */
export const INSPECT_MAX_TRADES_PER_SLUG = 5;

/**
 * Single market: own slugs, own cash pool. Buy when price < buyPrice, sell when price > sellPrice.
 * Requires sellPrice > buyPrice or there are no trades (avoids “same number” threshold arbitrage).
 */
export function simulateInspectCoin(
  history: PriceHistory,
  oncePerRound: boolean,
  buyPrice: number,
  sellPrice: number,
  usdPerBuy: number,
  options: SimulateCoinOptions = {},
): {
  byRound: Record<string, RoundMetrics> | null;
  totals: CoinTotals;
} {
  const recordRounds = options.recordRounds !== false;
  const slugs = Object.keys(history).sort();
  const byRound: Record<string, RoundMetrics> | null = recordRounds ? {} : null;
  if (recordRounds) {
    for (const slug of slugs) {
      byRound![slug] = emptyRoundMetrics();
    }
  }

  const emptyTotals = (): CoinTotals => ({
    spent: 0,
    earned: 0,
    bought: 0,
    sold: 0,
    profit: 0,
    minBalance: 0,
  });

  if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || !(sellPrice > buyPrice)) {
    if (recordRounds) {
      for (const slug of slugs) {
        byRound![slug].profit = 0;
      }
    }
    return { byRound, totals: emptyTotals() };
  }

  let spent = 0;
  let earned = 0;
  let bought = 0;
  let sold = 0;
  let cash = 0;
  let minCash = 0;

  const bumpMin = () => {
    if (cash < minCash) minCash = cash;
  };

  for (const slug of slugs) {
    const prices = history[slug];
    if (!prices?.length) {
      if (recordRounds) byRound![slug].profit = 0;
      continue;
    }

    let tokens = 0;
    let roundDone = false;
    let buysInSlug = 0;
    let sellsInSlug = 0;

    for (const price of prices) {
      if (oncePerRound && roundDone) break;
      if (!Number.isFinite(price)) continue;

      const allowBuy = oncePerRound || buysInSlug < INSPECT_MAX_TRADES_PER_SLUG;
      const allowSell = oncePerRound || sellsInSlug < INSPECT_MAX_TRADES_PER_SLUG;

      if (tokens === 0 && price < buyPrice && allowBuy) {
        tokens = usdPerBuy / price;
        spent += usdPerBuy;
        bought += 1;
        cash -= usdPerBuy;
        if (!oncePerRound) buysInSlug += 1;
        if (recordRounds) {
          byRound![slug].spent += usdPerBuy;
          byRound![slug].bought += 1;
        }
        bumpMin();
      } else if (tokens > 0 && price > sellPrice && allowSell) {
        const proceeds = tokens * price;
        earned += proceeds;
        sold += 1;
        cash += proceeds;
        if (!oncePerRound) sellsInSlug += 1;
        if (recordRounds) {
          byRound![slug].earned += proceeds;
          byRound![slug].sold += 1;
        }
        tokens = 0;
        if (oncePerRound) roundDone = true;
        bumpMin();
      }
    }

    if (recordRounds) byRound![slug].profit = byRound![slug].earned - byRound![slug].spent;
  }

  return {
    byRound,
    totals: {
      spent,
      earned,
      bought,
      sold,
      profit: earned - spent,
      minBalance: minCash < 0 ? -minCash : 0,
    },
  };
}

export type CoinSimResult = CoinTotals & {
  slugCount: number;
  byRound: Record<string, RoundMetrics>;
};

/**
 * Each selected market isolated; grand totals summed.
 */
export function simulateInspectUnified(
  byCoin: Record<InspectCoinKey, PriceHistory>,
  coins: InspectCoinKey[],
  buyPrice: number,
  sellPrice: number,
  usdPerBuy: number,
  oncePerRound: boolean,
  options: SimulateCoinOptions = {},
): {
  totals: CoinTotals;
  byCoin: Record<InspectCoinKey, CoinSimResult>;
} {
  const ordered = [...coins].sort();
  const byCoinOut = {} as Record<InspectCoinKey, CoinSimResult>;

  let spent = 0;
  let earned = 0;
  let bought = 0;
  let sold = 0;
  let minBalance = 0;

  for (const coin of ordered) {
    const { byRound, totals } = simulateInspectCoin(
      byCoin[coin],
      oncePerRound,
      buyPrice,
      sellPrice,
      usdPerBuy,
      options,
    );
    const slugCount = Object.keys(byCoin[coin]).length;
    byCoinOut[coin] = {
      ...totals,
      slugCount,
      byRound: (byRound ?? {}) as Record<string, RoundMetrics>,
    };
    spent += totals.spent;
    earned += totals.earned;
    bought += totals.bought;
    sold += totals.sold;
    minBalance += totals.minBalance;
  }

  return {
    totals: {
      spent,
      earned,
      bought,
      sold,
      profit: earned - spent,
      minBalance,
    },
    byCoin: byCoinOut,
  };
}

/** Backtest totals only (no per-round maps) — for scanning many (buy,sell) pairs. */
export function simulateInspectProfitOnly(
  byCoin: Record<InspectCoinKey, PriceHistory>,
  coins: InspectCoinKey[],
  buyPrice: number,
  sellPrice: number,
  usdPerBuy: number,
  oncePerRound: boolean,
): CoinTotals {
  const ordered = [...coins].sort();
  let spent = 0;
  let earned = 0;
  let bought = 0;
  let sold = 0;
  let minBalance = 0;
  for (const coin of ordered) {
    const { totals } = simulateInspectCoin(
      byCoin[coin],
      oncePerRound,
      buyPrice,
      sellPrice,
      usdPerBuy,
      { recordRounds: false },
    );
    spent += totals.spent;
    earned += totals.earned;
    bought += totals.bought;
    sold += totals.sold;
    minBalance += totals.minBalance;
  }
  return {
    spent,
    earned,
    bought,
    sold,
    profit: earned - spent,
    minBalance,
  };
}

export type BestCaseRow = {
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

const ROUND = (n: number) => Math.round(n * 100) / 100;

/**
 * Two-phase search: coarse 0.05 buy grid + data-rounded prices, then ±0.06 refinement at 0.01
 * around top coarse hits. Evaluates only (buy,sell) with sell - buy <= maxSpread and sell > buy.
 * @param minBuyPrice — only pairs with buy threshold >= this (default 0).
 */
export function findBestPricePairs(
  byCoin: Record<InspectCoinKey, PriceHistory>,
  coins: InspectCoinKey[],
  usdPerBuy: number,
  maxSpread: number,
  oncePerRound: boolean,
  topN: number,
  minBuyPrice = 0,
): BestCaseRow[] {
  const MIN_GAP = 0.02;
  if (maxSpread < MIN_GAP) return [];

  const minB = ROUND(
    Math.max(0, Math.min(0.98, Number.isFinite(minBuyPrice) ? minBuyPrice : 0)),
  );

  let lo = Infinity;
  let hi = -Infinity;
  const priceTicks = new Set<number>();

  for (const c of coins) {
    for (const arr of Object.values(byCoin[c])) {
      for (const p of arr) {
        if (!Number.isFinite(p)) continue;
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
        priceTicks.add(ROUND(p));
      }
    }
  }

  if (!Number.isFinite(lo)) lo = 0.01;
  if (!Number.isFinite(hi)) hi = 0.99;
  lo = Math.max(0.01, ROUND(Math.floor(lo * 100) / 100));
  hi = Math.min(0.99, ROUND(Math.ceil(hi * 100) / 100));

  const searchLo = Math.max(lo, minB);

  for (let x = searchLo; x <= hi + 1e-9; x += 0.05) {
    priceTicks.add(ROUND(x));
  }

  let buyCandidates = [...priceTicks]
    .filter((b) => b >= searchLo - 1e-9 && b <= hi - MIN_GAP)
    .sort((a, b) => a - b);

  const MAX_BUY_CANDIDATES = 160;
  if (buyCandidates.length > MAX_BUY_CANDIDATES) {
    const step = Math.ceil(buyCandidates.length / MAX_BUY_CANDIDATES);
    const sampled = buyCandidates.filter((_, i) => i % step === 0);
    buyCandidates = [...new Set([sampled[0], ...sampled, sampled[sampled.length - 1]])].sort(
      (a, b) => a - b,
    );
  }

  const seen = new Set<string>();
  const score = (
    buy: number,
    sell: number,
  ): BestCaseRow | null => {
    if (!(sell > buy && sell - buy <= maxSpread + 1e-9)) return null;
    const b = ROUND(buy);
    const s = ROUND(sell);
    if (!(s > b)) return null;
    if (b + 1e-9 < minB) return null;
    const key = `${b}\0${s}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const t = simulateInspectProfitOnly(byCoin, coins, b, s, usdPerBuy, oncePerRound);
    return {
      buy: b,
      sell: s,
      spread: ROUND(s - b),
      profit: t.profit,
      spent: t.spent,
      earned: t.earned,
      bought: t.bought,
      sold: t.sold,
      minBalance: t.minBalance,
    };
  };

  type Scored = BestCaseRow;
  const topBuffer: Scored[] = [];
  const pushTop = (row: Scored | null) => {
    if (!row) return;
    topBuffer.push(row);
  };

  const COARSE_SPREAD_STEP = 0.03;
  for (const buy of buyCandidates) {
    for (let sp = MIN_GAP; sp <= maxSpread + 1e-9; sp += COARSE_SPREAD_STEP) {
      const sell = buy + sp;
      if (sell > hi + 0.02) break;
      pushTop(score(buy, sell));
    }
  }

  topBuffer.sort((a, b) => b.profit - a.profit);
  const coarseTop = topBuffer.slice(0, Math.max(topN * 3, 24));

  seen.clear();
  const refined: Scored[] = [...coarseTop];
  const REFINE_DELTA = 0.06;
  const FINE = 0.01;

  for (const row of coarseTop) {
    for (let db = -REFINE_DELTA; db <= REFINE_DELTA + 1e-9; db += FINE) {
      for (let ds = -REFINE_DELTA; ds <= REFINE_DELTA + 1e-9; ds += FINE) {
        const buy = row.buy + db;
        const sell = row.sell + ds;
        if (
          buy < lo - 1e-9 ||
          buy < minB - 1e-9 ||
          sell > hi + 1e-9 ||
          buy < 0.01 ||
          sell > 0.99
        )
          continue;
        const r = score(buy, sell);
        if (r) refined.push(r);
      }
    }
  }

  refined.sort((a, b) => b.profit - a.profit);
  const out: Scored[] = [];
  const seenRank = new Set<string>();
  for (const r of refined) {
    const k = `${r.buy}\0${r.sell}`;
    if (seenRank.has(k)) continue;
    seenRank.add(k);
    out.push(r);
    if (out.length >= topN) break;
  }

  return out;
}
