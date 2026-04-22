import { NextRequest, NextResponse } from "next/server";

import { isS3ObjectMissingError } from "@/lib/get-s3-object";
import { INSPECT_COIN_S3_KEYS, type InspectCoinKey } from "@/lib/inspect-simulate";
import { computeSnowpolyInspectV0Resolution } from "@/lib/snowpoly-inspect-v3-metrics";
import {
  querySnowpolyHistoryAllRows,
  snowpolyPricesDbS3Key,
} from "@/lib/snowpoly-history-query";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let fileDateForError = "";
  try {
    const body = await request.json();
    const dateRaw = body.date;
    const fileDate =
      dateRaw === "" || dateRaw === undefined || dateRaw === null || typeof dateRaw !== "string"
        ? null
        : dateRaw.trim();
    fileDateForError = fileDate ?? "";

    const timeSeconds = Number(body.timeSeconds);
    const amount = Number(body.amount);
    const priceToBuy = Number(body.priceToBuy);
    const token = body.token as string | undefined;

    if (!fileDate) {
      return NextResponse.json(
        { error: "Date is required (loads snowpoly_history/prices_YYYY-MM-DD.db for that day only)." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > 300) {
      return NextResponse.json(
        { error: "timeSeconds must be between 0 and 300." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount (USD per buy) must be a positive number." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(priceToBuy) || priceToBuy < 0.01 || priceToBuy > 1) {
      return NextResponse.json(
        { error: "priceToBuy must be between 0.01 and 1 (USD level)." },
        { status: 400 },
      );
    }
    if (!token || !Object.prototype.hasOwnProperty.call(INSPECT_COIN_S3_KEYS, token)) {
      return NextResponse.json(
        { error: "token must be a valid market id (e.g. btc_up)." },
        { status: 400 },
      );
    }

    const coin = token as InspectCoinKey;

    const { rows, total, s3Key } = await querySnowpolyHistoryAllRows(coin, fileDate);

    const summary = computeSnowpolyInspectV0Resolution(rows, {
      timeSeconds,
      amount,
      maxBuyPrice: priceToBuy,
    });

    return NextResponse.json({
      meta: {
        date: fileDate,
        timeSeconds,
        amount,
        priceToBuy,
        token: coin,
        s3Key,
        rowCount: rows.length,
        totalRowsInTable: total,
      },
      summary,
    });
  } catch (error) {
    console.error("inspect-v2 error:", error);
    if (isS3ObjectMissingError(error)) {
      const key =
        fileDateForError && /^\d{4}-\d{2}-\d{2}$/.test(fileDateForError)
          ? snowpolyPricesDbS3Key(fileDateForError)
          : "snowpoly_history/prices_YYYY-MM-DD.db";
      return NextResponse.json(
        {
          error: "Snowpoly history database not found in S3.",
          detail: `No object at key "${key}". Pick a date that exists in the bucket.`,
        },
        { status: 404 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to run Inspect V0 simulation.", detail: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message:
      "Inspect V0: POST JSON { date, timeSeconds, amount, priceToBuy, token }. Loads snowpoly_history/prices_YYYY-MM-DD.db — metrics use that calendar day only.",
  });
}
