import { NextRequest, NextResponse } from "next/server";
import { getS3Object } from "@/lib/get-s3-object";

const VALID_TOKENS = new Set([
  "btc_up",
  "btc_down",
  "eth_up",
  "eth_down",
  "sol_up",
  "sol_down",
  "xrp_up",
  "xrp_down",
]);

/** e.g. btc_up -> history/BTC_UP.json */
function tokenIdToHistoryKey(tokenId: string): string {
  const upper = tokenId
    .split("_")
    .map((p) => p.toUpperCase())
    .join("_");
  return `history/${upper}.json`;
}

type PricePoint = { time: number; price: number };
type PriceRound = { ts: number; prices: PricePoint[] };

/**
 * Raw units: spend `amount * 100` per buy; earn `tokens * 0.94 * (X + pd)` (prices scaled ×100).
 * Returned fields are divided by 100 for display.
 */
function simulateBuySellAtX(
  X: number,
  priceHistory: PriceRound[],
  timeLimit: number,
  amount: number,
  priceDiff: number,
  multiMode: boolean,
): {
  spentRaw: number;
  earnedRaw: number;
  minBalanceRaw: number;
  bought: number;
  sold: number;
} {
  let spentRaw = 0;
  let earnedRaw = 0;
  let cashRaw = 0;
  let lowestCash = 0;
  let bought = 0;
  let sold = 0;

  const bump = () => {
    lowestCash = Math.min(lowestCash, cashRaw);
  };

  if (!(X > 0) || !Number.isFinite(amount)) {
    return { spentRaw: 0, earnedRaw: 0, minBalanceRaw: 0, bought: 0, sold: 0 };
  }

  const pd = priceDiff;
  const sellPrice = X + pd;

  for (const round of priceHistory) {
    const arr = round.prices;

    const occX: number[] = [];
    const occXPd: number[] = [];
    for (let idx = 0; idx < arr.length; idx++) {
      if (arr[idx].time > timeLimit) continue;
      if (arr[idx].price === X) occX.push(idx);
      if (arr[idx].price === sellPrice) occXPd.push(idx);
    }

    let holding = false;
    let tokens = 0;
    /** Single mode: no further buys after one completed sell in this round. */
    let roundDone = false;

    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.time > timeLimit) continue;

      if (e.price === sellPrice && holding) {
        const sellRaw = tokens * 0.94 * sellPrice;
        cashRaw += sellRaw;
        earnedRaw += sellRaw;
        sold += 1;
        holding = false;
        tokens = 0;
        bump();
        if (!multiMode) roundDone = true;
      }

      if (e.price === X) {
        if (!multiMode && roundDone) continue;
        if (holding) continue;

        const j = occX.indexOf(i);
        if (j < 0) continue;

        if (!multiMode && j > 0) continue;

        if (multiMode && j >= 1) {
          if (j - 1 >= occXPd.length || occX[j] <= occXPd[j - 1]) {
            continue;
          }
        }

        const buyCostRaw = amount * 100;
        cashRaw -= buyCostRaw;
        spentRaw += buyCostRaw;
        tokens = (amount * 100) / X;
        holding = true;
        bought += 1;
        bump();
      }
    }
  }

  const minBalanceRaw = lowestCash < 0 ? -lowestCash : 0;
  return { spentRaw, earnedRaw, minBalanceRaw, bought, sold };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const timeSeconds = Number(body.timeSeconds ?? body.time);
    const amount = Number(body.amount);
    const priceDiff = Number(body.priceDiff);
    const multiMode =
      body.multiMode === true ||
      body.multiMode === "true" ||
      body.multiMode === 1;
    const token = typeof body.token === "string" ? body.token : "";

    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > 300) {
      return NextResponse.json(
        { error: "timeSeconds must be a number between 0 and 300" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "amount must be a valid number" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(priceDiff)) {
      return NextResponse.json(
        { error: "priceDiff must be a valid number" },
        { status: 400 },
      );
    }
    if (!VALID_TOKENS.has(token)) {
      return NextResponse.json(
        { error: "token must be one of the 8 market options" },
        { status: 400 },
      );
    }

    const s3Key = tokenIdToHistoryKey(token);
    const raw = await getS3Object(s3Key);
    let priceData: Array<{ round_ts: number; prices: string }>;
    try {
      priceData = JSON.parse(raw) as Array<{
        round_ts: number;
        prices: string;
      }>;
    } catch {
      return NextResponse.json(
        { error: "Object is not valid JSON", s3Key },
        { status: 422 },
      );
    }

    const slugCount = Array.isArray(priceData) ? priceData.length : null;

    const priceHistory: PriceRound[] = priceData.map(({ round_ts, prices }) => {
      const realPrices: PricePoint[] = [];
      let index = 0;
      while (index < prices.length) {
        const piece = prices.slice(index, index + 8);
        const timeStr = piece.slice(0, 4);
        const priceStr = piece.slice(4);
        const time = parseInt(timeStr, 16);
        const price = parseInt(priceStr, 16);

        realPrices.push({ time, price: Math.round(price / 10) });

        index += 8;
      }
      return { ts: round_ts, prices: realPrices };
    });

    const allCandidatePrices = new Set<number>();
    for (const round of priceHistory) {
      for (const entry of round.prices) {
        allCandidatePrices.add(entry.price);
      }
    }

    const timeLimit = timeSeconds * 100;

    const topScores = [...allCandidatePrices]
      .filter((X) => X > 0)
      .map((price) => {
        const { spentRaw, earnedRaw, minBalanceRaw, bought, sold } =
          simulateBuySellAtX(
            price,
            priceHistory,
            timeLimit,
            amount,
            priceDiff,
            multiMode,
          );
        const profitRaw = earnedRaw - spentRaw;
        return {
          price,
          spent: spentRaw / 100,
          earned: earnedRaw / 100,
          profit: profitRaw / 100,
          minBalance: minBalanceRaw / 100,
          bought,
          sold,
        };
      })
      .sort((a, b) => {
        if (b.profit !== a.profit) return b.profit - a.profit;
        return a.minBalance - b.minBalance;
      })
      .slice(0, 20);

    return NextResponse.json({
      meta: {
        timeSeconds,
        amount,
        token,
        s3Key,
        priceDiff,
        multiMode,
      },
      slugCount,
      topScores,
      priceData,
    });
  } catch (error) {
    console.error("inspect-v2 error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load history", detail: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Use POST with timeSeconds (0–300), amount, token, priceDiff, multiMode",
    },
    { status: 405 },
  );
}
