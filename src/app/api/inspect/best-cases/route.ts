import { NextRequest, NextResponse } from 'next/server';
import { getS3Object } from '@/lib/get-s3-object';
import {
  findBestPricePairs,
  INSPECT_COIN_S3_KEYS,
  parseInspectHistory,
  type InspectCoinKey,
} from '@/lib/inspect-simulate';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const usdPerBuy = Number(body.usdPerBuy);
    const coins = body.coins as InspectCoinKey[] | undefined;
    const maxSpread = Number(body.maxSpread ?? 0.4);
    const topN = Math.min(50, Math.max(1, Math.floor(Number(body.topN ?? 10))));
    const minBuyRaw = body.minBuyPrice;
    const minBuyPrice =
      minBuyRaw === '' || minBuyRaw === undefined || minBuyRaw === null
        ? 0
        : Number(minBuyRaw);
    const minBuy = Number.isFinite(minBuyPrice) && minBuyPrice >= 0 ? minBuyPrice : 0;

    if (!Number.isFinite(usdPerBuy) || usdPerBuy <= 0) {
      return NextResponse.json({ error: 'usdPerBuy must be a positive number' }, { status: 400 });
    }
    if (!Number.isFinite(maxSpread) || maxSpread < 0.02) {
      return NextResponse.json(
        { error: 'maxSpread must be at least 0.02 (sell − buy cap)' },
        { status: 400 },
      );
    }

    const selected = (coins ?? []).filter((c): c is InspectCoinKey =>
      Object.prototype.hasOwnProperty.call(INSPECT_COIN_S3_KEYS, c),
    );
    if (selected.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one coin (coins array)' },
        { status: 400 },
      );
    }

    const entries = await Promise.all(
      selected.map(async (key) => {
        const s3Key = INSPECT_COIN_S3_KEYS[key];
        const raw = await getS3Object(s3Key);
        return [key, parseInspectHistory(raw)] as const;
      }),
    );

    const byCoin = Object.fromEntries(entries) as Record<
      InspectCoinKey,
      ReturnType<typeof parseInspectHistory>
    >;

    const oncePerRound = findBestPricePairs(
      byCoin,
      selected,
      usdPerBuy,
      maxSpread,
      true,
      topN,
      minBuy,
    );
    const multiWithinRound = findBestPricePairs(
      byCoin,
      selected,
      usdPerBuy,
      maxSpread,
      false,
      topN,
      minBuy,
    );

    return NextResponse.json({
      maxSpread,
      topN,
      minBuyPrice: minBuy,
      oncePerRound,
      multiWithinRound,
    });
  } catch (error) {
    console.error('inspect/best-cases error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to find best cases', detail: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error:
        'Use POST with usdPerBuy, coins[], optional maxSpread (default 0.4), topN (default 10), minBuyPrice (default 0)',
    },
    { status: 405 },
  );
}
