import { NextRequest, NextResponse } from 'next/server';
import { fetchInspectPolyHistoryJson, isInspectPolyNotFoundError } from '@/lib/inspect-poly-s3';
import {
  INSPECT_COIN_S3_KEYS,
  parseInspectHistory,
  simulateInspectUnified,
  type InspectCoinKey,
  type PriceHistory,
} from '@/lib/inspect-simulate';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const buyPrice = Number(body.buyPrice);
    const sellPrice = Number(body.sellPrice);
    const usdPerBuy = Number(body.usdPerBuy);
    const coins = body.coins as InspectCoinKey[] | undefined;

    if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || !Number.isFinite(usdPerBuy)) {
      return NextResponse.json(
        { error: 'buyPrice, sellPrice, and usdPerBuy must be valid numbers' },
        { status: 400 },
      );
    }
    if (usdPerBuy <= 0) {
      return NextResponse.json({ error: 'usdPerBuy must be positive' }, { status: 400 });
    }
    if (!(sellPrice > buyPrice)) {
      return NextResponse.json(
        { error: 'Sell price must be greater than buy price (equal values are not allowed).' },
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
        const { raw } = await fetchInspectPolyHistoryJson(key);
        return [key, parseInspectHistory(raw)] as const;
      }),
    );

    const byCoin = Object.fromEntries(entries) as Record<InspectCoinKey, PriceHistory>;
    const ordered = [...selected].sort();
    const roundsByCoin: Record<InspectCoinKey, number> = {} as Record<InspectCoinKey, number>;
    for (const c of ordered) {
      roundsByCoin[c] = Object.keys(byCoin[c]).length;
    }

    const once = simulateInspectUnified(byCoin, selected, buyPrice, sellPrice, usdPerBuy, true);
    const multi = simulateInspectUnified(byCoin, selected, buyPrice, sellPrice, usdPerBuy, false);

    return NextResponse.json({
      roundsByCoin,
      oncePerRound: once,
      multiWithinRound: multi,
    });
  } catch (error) {
    console.error('inspect/calc error:', error);
    if (isInspectPolyNotFoundError(error)) {
      return NextResponse.json(
        {
          error: 'Poly history file not found in S3.',
          detail: `No object at key "${error.s3Key}". Upload poly_history JSON or set INSPECT_POLY_S3_PREFIX if it lives under a parent folder.`,
        },
        { status: 404 },
      );
    }
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
