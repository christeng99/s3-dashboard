import { NextResponse } from "next/server";

const MOCK_RESPONSE = {
  meta: {
    timeSeconds: 120,
    amount: 25,
    token: "btc_up",
    s3Key: "history/BTC_UP.json",
    priceDiff: 0.1,
    minimumPrice: 0.01,
    multiMode: false,
  },
  slugCount: 4,
  topScores: [
    {
      price: 0.52,
      spent: 48.5,
      earned: 62.25,
      profit: 13.75,
      minBalance: 2.1,
      bought: 8,
      sold: 7,
    },
    {
      price: 0.48,
      spent: 44.0,
      earned: 55.5,
      profit: 11.5,
      minBalance: 3.4,
      bought: 7,
      sold: 6,
    },
    {
      price: 0.55,
      spent: 51.2,
      earned: 58.0,
      profit: 6.8,
      minBalance: 5.0,
      bought: 6,
      sold: 5,
    },
  ],
  priceData: [
    { round_ts: 1775689200, prices: "00000abc00000def" },
    { round_ts: 1775692800, prices: "00000fed00000cba" },
  ],
};

export async function POST() {
  return NextResponse.json(MOCK_RESPONSE);
}

export async function GET() {
  return NextResponse.json({
    message: "SnowPoly Inspect - V0 mock: use POST.",
    sample: MOCK_RESPONSE,
  });
}
