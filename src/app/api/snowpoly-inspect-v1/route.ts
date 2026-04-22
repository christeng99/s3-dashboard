import { NextRequest, NextResponse } from 'next/server';

import { isS3ObjectMissingError } from '@/lib/get-s3-object';
import { INSPECT_COIN_S3_KEYS, type InspectCoinKey } from '@/lib/inspect-simulate';
import { computeSnowpolyInspectV1ProfitRateSweep } from '@/lib/snowpoly-inspect-v1-metrics';
import { querySnowpolyHistoryAllRows, snowpolyPricesDbS3Key } from '@/lib/snowpoly-history-query';

export const runtime = 'nodejs';

function isInspectCoinKey(s: unknown): s is InspectCoinKey {
  return typeof s === 'string' && Object.prototype.hasOwnProperty.call(INSPECT_COIN_S3_KEYS, s);
}

export async function POST(request: NextRequest) {
  let fileDateForError = '';
  try {
    const body = await request.json();
    const dateRaw = body.date;
    const fileDate =
      dateRaw === '' || dateRaw === undefined || dateRaw === null || typeof dateRaw !== 'string'
        ? null
        : dateRaw.trim();
    fileDateForError = fileDate ?? '';

    const usdPerBuy = Number(body.usdPerBuy);
    const buyTimeSec = Number(body.buyTimeSec ?? 8);
    const coin = body.coin ?? body.token;

    if (!fileDate) {
      return NextResponse.json(
        { error: 'Date is required (loads snowpoly_history/prices_YYYY-MM-DD.db).' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(usdPerBuy) || usdPerBuy <= 0) {
      return NextResponse.json(
        { error: 'usdPerBuy must be a positive number.' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(buyTimeSec) || buyTimeSec < 0 || buyTimeSec > 300) {
      return NextResponse.json(
        { error: 'buyTimeSec must be between 0 and 300 (seconds from round start).' },
        { status: 400 },
      );
    }
    if (!isInspectCoinKey(coin)) {
      return NextResponse.json(
        { error: 'Invalid or missing coin (table) name.' },
        { status: 400 },
      );
    }

    const { rows, total, s3Key } = await querySnowpolyHistoryAllRows(coin, fileDate);
    const { rows: table, avgBuyPrice } = computeSnowpolyInspectV1ProfitRateSweep(rows, {
      usdPerBuy,
      buyTimeSec,
    });

    return NextResponse.json({
      meta: {
        coin,
        date: fileDate,
        usdPerBuy,
        buyTimeSec,
        avgBuyPrice,
        rowCount: rows.length,
        totalRowsInTable: total,
        s3Key,
      },
      table,
    });
  } catch (error) {
    console.error('snowpoly-inspect-v1 error:', error);
    if (isS3ObjectMissingError(error)) {
      const key =
        fileDateForError && /^\d{4}-\d{2}-\d{2}$/.test(fileDateForError)
          ? snowpolyPricesDbS3Key(fileDateForError)
          : 'snowpoly_history/prices_YYYY-MM-DD.db';
      return NextResponse.json(
        {
          error: 'Snowpoly history database not found in S3.',
          detail: `No object at key "${key}".`,
        },
        { status: 404 },
      );
    }
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
