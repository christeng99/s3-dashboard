import { NextRequest, NextResponse } from 'next/server';

import { INSPECT_COIN_S3_KEYS, type InspectCoinKey } from '@/lib/inspect-simulate';
import {
  computeSnowpolyInspectV3Adaptive,
  computeSnowpolyInspectV3Metrics,
  type InspectV3AdaptiveMode,
  type InspectV3AdaptiveRanges,
} from '@/lib/snowpoly-inspect-v3-metrics';
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

/** Price diff may be 0 (sell at same level as buy) or a cent USD level up to 1. */
function isUsdLevelPriceDiff(n: number): boolean {
  return n === 0 || isUsdLevel(n);
}

function isAdaptiveMode(v: unknown): v is InspectV3AdaptiveMode {
  return v === 'v1' || v === 'v2';
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
    const modeRaw = body.strategyMode;
    const mode = isAdaptiveMode(modeRaw) ? modeRaw : null;
    const bufferRounds = Number(body.bufferRounds ?? 0);
    const adaptivePriceMin = Number(body.adaptivePriceMin ?? body.priceRangeMin ?? 0.01);
    const adaptivePriceMax = Number(body.adaptivePriceMax ?? body.priceRangeMax ?? 0.99);
    const adaptiveDiffMin = Number(body.adaptiveDiffMin ?? body.diffRangeMin ?? 0);
    const adaptiveDiffMax = Number(body.adaptiveDiffMax ?? body.diffRangeMax ?? 1);

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
    if (!isUsdLevelPriceDiff(priceDiff)) {
      return NextResponse.json(
        {
          error: `Price diff must be 0 or a USD level from ${USD_LEVEL_MIN} to ${USD_LEVEL_MAX}.`,
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
    if (!Number.isFinite(bufferRounds) || bufferRounds < 0) {
      return NextResponse.json(
        { error: 'Buffer rounds must be a non-negative number.' },
        { status: 400 },
      );
    }

    let adaptiveRanges: InspectV3AdaptiveRanges | null = null;
    if (mode != null) {
      if (
        !Number.isFinite(adaptivePriceMin) ||
        !Number.isFinite(adaptivePriceMax) ||
        adaptivePriceMin > adaptivePriceMax ||
        adaptivePriceMin < USD_LEVEL_MIN ||
        adaptivePriceMax > USD_LEVEL_MAX
      ) {
        return NextResponse.json(
          {
            error: `V1/V2: price range must be ${USD_LEVEL_MIN}–${USD_LEVEL_MAX} with min ≤ max.`,
          },
          { status: 400 },
        );
      }
      if (
        !Number.isFinite(adaptiveDiffMin) ||
        !Number.isFinite(adaptiveDiffMax) ||
        adaptiveDiffMin > adaptiveDiffMax ||
        adaptiveDiffMin < 0 ||
        adaptiveDiffMax > USD_LEVEL_MAX
      ) {
        return NextResponse.json(
          {
            error: `V1/V2: diff range must be 0–${USD_LEVEL_MAX} with min ≤ max.`,
          },
          { status: 400 },
        );
      }
      adaptiveRanges = {
        priceMin: adaptivePriceMin,
        priceMax: adaptivePriceMax,
        diffMin: adaptiveDiffMin,
        diffMax: adaptiveDiffMax,
      };
    }

    const { rows, total, s3Key } = await querySnowpolyHistoryAllRows(coin, fileDate);
    const baseParams = {
      timeSeconds,
      amount,
      priceDiff,
      minBuyX: minimumPrice,
      belowAndAbove,
    };

    const adaptiveResult =
      mode == null || adaptiveRanges == null
        ? null
        : computeSnowpolyInspectV3Adaptive(rows, {
            ...baseParams,
            mode,
            bufferRounds,
            adaptiveRanges,
          });
    const metrics = computeSnowpolyInspectV3Metrics(rows, baseParams);

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
      adaptiveResult,
      rows: metrics,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
