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

/** Real price levels are cent-sized steps; compare on cent ticks. */
function priceTick(p: number): number {
  return Math.round(p * 100 + Number.EPSILON);
}

function samePrice(a: number, b: number): boolean {
  return priceTick(a) === priceTick(b);
}

/** Cents (dashboard 1–100) → real price level for the engine. */
const CENTS_TO_LEVEL = 100;

/**
 * All prices are real levels (0–1 typical). `X` from history; `priceDiff` already ÷100 from cent input.
 * Cash: spend `amount*100` ¢ per buy; earn `tokens * 0.94 * sellPrice * 100` ¢. Dollar fields ÷100 for response.
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

  const sellPrice = X + priceDiff;

  for (const round of priceHistory) {
    const arr = round.prices;

    const occX: number[] = [];
    const occXPd: number[] = [];
    for (let idx = 0; idx < arr.length; idx++) {
      if (arr[idx].time > timeLimit) continue;
      if (samePrice(arr[idx].price, X)) occX.push(idx);
      if (samePrice(arr[idx].price, sellPrice)) occXPd.push(idx);
    }

    let holding = false;
    let tokens = 0;
    /** Single mode: no further buys after one completed sell in this round. */
    let roundDone = false;

    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.time > timeLimit) continue;

      if (samePrice(e.price, sellPrice) && holding) {
        const sellRaw = tokens * 0.94 * sellPrice * 100;
        cashRaw += sellRaw;
        earnedRaw += sellRaw;
        sold += 1;
        holding = false;
        tokens = 0;
        bump();
        if (!multiMode) roundDone = true;
      }

      if (samePrice(e.price, X)) {
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
        tokens = amount / X;
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
    const priceDiffCents = Number(body.priceDiff);
    const minBuyXCents = Math.floor(Number(body.minimumPrice));
    const minBuyXLevel = minBuyXCents / CENTS_TO_LEVEL;
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
    if (!Number.isFinite(priceDiffCents)) {
      return NextResponse.json(
        { error: "priceDiff must be a valid number (cents, ÷100 in engine)" },
        { status: 400 },
      );
    }
    if (
      !Number.isFinite(minBuyXCents) ||
      minBuyXCents < 1 ||
      minBuyXCents > 100
    ) {
      return NextResponse.json(
        {
          error:
            "minimumPrice must be integer cents 1–100 (÷100 → real buy price level vs history)",
        },
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

        if (time <= 29800) {
          // packed → cent tick → real price level (same ÷100 as min buy / diff)
          const level = Math.round(price / 10) / CENTS_TO_LEVEL;
          realPrices.push({ time, price: level });
        }

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
    const priceDiffLevel = priceDiffCents / CENTS_TO_LEVEL;

    const topScores = [...allCandidatePrices]
      .filter((X) => X > 0 && X + 1e-9 >= minBuyXLevel)
      .map((price) => {
        const { spentRaw, earnedRaw, minBalanceRaw, bought, sold } =
          simulateBuySellAtX(
            price,
            priceHistory,
            timeLimit,
            amount,
            priceDiffLevel,
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
        /** Real price delta (request cents ÷100). */
        priceDiff: priceDiffLevel,
        /** Real min buy price level (request cents ÷100). */
        minimumPrice: minBuyXLevel,
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
        "Use POST with timeSeconds (0–300), amount, token, priceDiff (cents, ÷100 for engine), minimumPrice (cents 1–100, ÷100 for engine), multiMode",
    },
    { status: 405 },
  );
}
