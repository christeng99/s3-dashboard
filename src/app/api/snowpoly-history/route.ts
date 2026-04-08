import { NextRequest, NextResponse } from 'next/server';

import { INSPECT_COIN_S3_KEYS, type InspectCoinKey } from '@/lib/inspect-simulate';
import { querySnowpolyHistoryTable } from '@/lib/snowpoly-history-query';

export const runtime = 'nodejs';

function isInspectCoinKey(s: unknown): s is InspectCoinKey {
  return typeof s === 'string' && Object.prototype.hasOwnProperty.call(INSPECT_COIN_S3_KEYS, s);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const coin = body.coin;
    const dateRaw = body.date;
    const fileDate =
      dateRaw === '' || dateRaw === undefined || dateRaw === null || typeof dateRaw !== 'string'
        ? null
        : dateRaw.trim();
    const page = Number(body.page ?? 1);
    const pageSize = Number(body.pageSize ?? 50);

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

    const result = await querySnowpolyHistoryTable(coin, {
      fileDate,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
