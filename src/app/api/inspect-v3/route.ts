import { NextRequest, NextResponse } from 'next/server';

import { INSPECT_COIN_S3_KEYS, type InspectCoinKey } from '@/lib/inspect-simulate';
import { computeSnowpolyInspectV3Metrics } from '@/lib/snowpoly-inspect-v3-metrics';
import { querySnowpolyHistoryAllRows } from '@/lib/snowpoly-history-query';

export const runtime = 'nodejs';

function isInspectCoinKey(s: unknown): s is InspectCoinKey {
  return typeof s === 'string' && Object.prototype.hasOwnProperty.call(INSPECT_COIN_S3_KEYS, s);
}

const USD_LEVEL_MIN = 0.01;
const USD_LEVEL_MAX = 1;

function isUsdLevel(n: number): boolean {
  return Number.isFinite(n) && n >= USD_LEVEL_MIN && n <= USD_LEVEL_MAX;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const coin = body.coin ?? body.token;
    const dateRaw = body.date;
    const fileDate =
      dateRaw === '' || dateRaw === undefined || dateRaw === null || typeof dateRaw !== 'string'
        ? null
        : dateRaw.trim();

    const timeSeconds = Number(body.timeSeconds);
    const amount = Number(body.amount);
    const priceDiff = Number(body.priceDiff);
    const minimumPrice = Number(body.minimumPrice ?? body.minBuyX);
    const belowAndAbove = Boolean(body.belowAndAbove ?? body.multiMode);

    if (!isInspectCoinKey(coin)) {
      return NextResponse.json(
        { error: 'Invalid or missing coin (table) name.' },
        { status: 400 },
      );
    }
    if (!fileDate) {
      return NextResponse.json(
        { error: 'Date is required (loads snowpoly_history/prices_YYYY-MM-DD.db).' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > 300) {
      return NextResponse.json(
        { error: 'Time must be a number from 0 to 300 (seconds).' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 });
    }
    if (!isUsdLevel(priceDiff)) {
      return NextResponse.json(
        {
          error: `Price diff must be a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
        },
        { status: 400 },
      );
    }
    if (!isUsdLevel(minimumPrice)) {
      return NextResponse.json(
        {
          error: `Min buy X must be a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
        },
        { status: 400 },
      );
    }

    const { rows, total, s3Key } = await querySnowpolyHistoryAllRows(coin, fileDate);
    const metrics = computeSnowpolyInspectV3Metrics(rows, {
      timeSeconds,
      amount,
      priceDiff,
      minBuyX: minimumPrice,
      belowAndAbove,
    });

    return NextResponse.json({
      meta: {
        coin,
        date: fileDate,
        timeSeconds,
        amount,
        priceDiff,
        minimumPrice,
        belowAndAbove,
        rowCount: rows.length,
        totalRowsInTable: total,
        s3Key,
      },
      rows: metrics,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
