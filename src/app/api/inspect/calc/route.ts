import { NextRequest, NextResponse } from 'next/server';
import { getS3Object } from '@/lib/get-s3-object';

const COIN_S3_KEYS = {
  btc_up: 'poly_history/btc_up.json',
  btc_down: 'poly_history/btc_down.json',
  eth_up: 'poly_history/eth_up.json',
  eth_down: 'poly_history/eth_down.json',
  sol_up: 'poly_history/sol_up.json',
  sol_down: 'poly_history/sol_down.json',
  xrp_up: 'poly_history/xrp_up.json',
  xrp_down: 'poly_history/xrp_down.json',
} as const;

type CoinKey = keyof typeof COIN_S3_KEYS;

type PriceHistory = Record<string, number[]>;

function normPrices(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => Number(p) / 100);
}

function parseHistory(raw: string): PriceHistory {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const out: PriceHistory = {};
  for (const [slug, prices] of Object.entries(data)) {
    out[slug] = normPrices(prices);
  }
  return out;
}

type RoundMetrics = {
  spent: number;
  earned: number;
  bought: number;
  sold: number;
  profit: number;
};

type CoinTotals = RoundMetrics & { minBalance: number };

function emptyRoundMetrics(): RoundMetrics {
  return { spent: 0, earned: 0, bought: 0, sold: 0, profit: 0 };
}

/**
 * Single market: own slugs, own cash pool. Buy when price < buyPrice, sell when price > sellPrice.
 */
function simulateCoin(
  history: PriceHistory,
  oncePerRound: boolean,
  buyPrice: number,
  sellPrice: number,
  usdPerBuy: number,
): {
  byRound: Record<string, RoundMetrics>;
  totals: CoinTotals;
} {
  const slugs = Object.keys(history).sort();
  const byRound: Record<string, RoundMetrics> = {};
  for (const slug of slugs) {
    byRound[slug] = emptyRoundMetrics();
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
      byRound[slug].profit = 0;
      continue;
    }

    let tokens = 0;
    let roundDone = false;

    for (const price of prices) {
      if (oncePerRound && roundDone) break;
      if (!Number.isFinite(price)) continue;

      if (tokens === 0 && price < buyPrice) {
        tokens = usdPerBuy / price;
        spent += usdPerBuy;
        bought += 1;
        cash -= usdPerBuy;
        byRound[slug].spent += usdPerBuy;
        byRound[slug].bought += 1;
        bumpMin();
      } else if (tokens > 0 && price > sellPrice) {
        const proceeds = tokens * price;
        earned += proceeds;
        sold += 1;
        cash += proceeds;
        byRound[slug].earned += proceeds;
        byRound[slug].sold += 1;
        tokens = 0;
        if (oncePerRound) roundDone = true;
        bumpMin();
      }
    }

    byRound[slug].profit = byRound[slug].earned - byRound[slug].spent;
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

type CoinSimResult = CoinTotals & {
  slugCount: number;
  byRound: Record<string, RoundMetrics>;
};

/**
 * Runs each selected market in isolation (separate slug list and cash per coin),
 * then sums metrics for grand totals.
 */
function simulateUnified(
  byCoin: Record<CoinKey, PriceHistory>,
  coins: CoinKey[],
  buyPrice: number,
  sellPrice: number,
  usdPerBuy: number,
  oncePerRound: boolean,
): {
  totals: CoinTotals;
  byCoin: Record<CoinKey, CoinSimResult>;
} {
  const ordered = [...coins].sort();
  const byCoinOut = {} as Record<CoinKey, CoinSimResult>;

  let spent = 0;
  let earned = 0;
  let bought = 0;
  let sold = 0;
  let minBalance = 0;

  for (const coin of ordered) {
    const { byRound, totals } = simulateCoin(
      byCoin[coin],
      oncePerRound,
      buyPrice,
      sellPrice,
      usdPerBuy,
    );
    const slugCount = Object.keys(byCoin[coin]).length;
    byCoinOut[coin] = {
      ...totals,
      slugCount,
      byRound,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const buyPrice = Number(body.buyPrice);
    const sellPrice = Number(body.sellPrice);
    const usdPerBuy = Number(body.usdPerBuy);
    const coins = body.coins as CoinKey[] | undefined;

    if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || !Number.isFinite(usdPerBuy)) {
      return NextResponse.json(
        { error: 'buyPrice, sellPrice, and usdPerBuy must be valid numbers' },
        { status: 400 },
      );
    }
    if (usdPerBuy <= 0) {
      return NextResponse.json({ error: 'usdPerBuy must be positive' }, { status: 400 });
    }

    const selected = (coins ?? []).filter((c): c is CoinKey =>
      Object.prototype.hasOwnProperty.call(COIN_S3_KEYS, c),
    );
    if (selected.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one coin (coins array)' },
        { status: 400 },
      );
    }

    const entries = await Promise.all(
      selected.map(async (key) => {
        const s3Key = COIN_S3_KEYS[key];
        const raw = await getS3Object(s3Key);
        return [key, parseHistory(raw)] as const;
      }),
    );

    const byCoin = Object.fromEntries(entries) as Record<CoinKey, PriceHistory>;
    const ordered = [...selected].sort();
    const roundsByCoin: Record<CoinKey, number> = {} as Record<CoinKey, number>;
    for (const c of ordered) {
      roundsByCoin[c] = Object.keys(byCoin[c]).length;
    }

    const once = simulateUnified(byCoin, selected, buyPrice, sellPrice, usdPerBuy, true);
    const multi = simulateUnified(byCoin, selected, buyPrice, sellPrice, usdPerBuy, false);

    return NextResponse.json({
      roundsByCoin,
      oncePerRound: once,
      multiWithinRound: multi,
    });
  } catch (error) {
    console.error('inspect/calc error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to run inspect calculation', detail: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST with buyPrice, sellPrice, usdPerBuy, coins[]' },
    { status: 405 },
  );
}
