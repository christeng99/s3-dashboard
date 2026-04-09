import type { SnowpolyHistoryRow } from '@/lib/snowpoly-history-query';

export type InspectV3Params = {
  timeSeconds: number;
  amount: number;
  priceDiff: number;
  minBuyX: number;
  /**
   * When true: X uses best_ask band [0.7·X, X]; sell uses best_bid ≥ X + priceDiff (still after sell delay).
   * When false: cent-level match on ask/mid and bid/mid.
   */
  belowAndAbove: boolean;
};

export type InspectV3MetricRow = {
  buyX: number;
  totalRounds: number;
  xAppearance: number;
  xDiffAppearance: number;
  spent: number;
  got: number;
  profit: number;
};

/** After first X at t0, selling may start from t0 + this delay; first matching tick through end of round counts (same units as `msecs`). */
const SELL_DELAY_AFTER_X_MS = 2000;

/** USD levels compared at 0.01 (cent) precision. */
function approxEq(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function normPriceLike(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 1 + 1e-6) return n / 100;
  return n;
}

function toMsecs(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function resolveColName(columns: string[], want: string): string | null {
  const w = want.toLowerCase();
  const hit = columns.find((c) => c.toLowerCase() === w);
  return hit ?? null;
}

/** First present column (case-insensitive), in preference order. */
function resolveFirstColumn(columns: string[], candidates: string[]): string | null {
  const lower = columns.map((c) => c.toLowerCase());
  for (const cand of candidates) {
    const i = lower.indexOf(cand.toLowerCase());
    if (i >= 0) return columns[i];
  }
  return null;
}

type RoundRow = { ask: number; bid: number; mid: number | null; msecs: number };

type RoundGroup = {
  roundKey: string;
  rows: RoundRow[];
};

function buildRoundGroups(
  rows: SnowpolyHistoryRow[],
  askCol: string,
  bidCol: string,
  midCol: string | null,
  msecsCol: string,
  roundCol: string,
): RoundGroup[] {
  const byRound = new Map<string, SnowpolyHistoryRow[]>();
  for (const r of rows) {
    const rt = r[roundCol];
    const key =
      rt === null || rt === undefined
        ? ''
        : typeof rt === 'bigint'
          ? String(rt)
          : String(rt);
    if (!byRound.has(key)) byRound.set(key, []);
    byRound.get(key)!.push(r);
  }

  const groups: RoundGroup[] = [];
  for (const [roundKey, list] of byRound) {
    const parsed: RoundRow[] = [];
    for (const r of list) {
      const ask = normPriceLike(r[askCol]);
      const bid = normPriceLike(r[bidCol]);
      const mid = midCol ? normPriceLike(r[midCol]) : null;
      const msecs = toMsecs(r[msecsCol]);
      if (ask == null || bid == null || msecs == null) continue;
      parsed.push({ ask, bid, mid, msecs });
    }
    parsed.sort((a, b) => a.msecs - b.msecs);
    groups.push({ roundKey, rows: parsed });
  }
  groups.sort((a, b) => a.roundKey.localeCompare(b.roundKey));
  return groups;
}

/** Within the first `timeSeconds` of the round (`msecs` treated as milliseconds from round start). */
function earlyMsecsCutoff(timeSeconds: number): number {
  return timeSeconds * 1000;
}

function enumerateBuyX(minX: number, priceDiff: number): number[] {
  const maxX = 0.99 - priceDiff;
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX < minX - 1e-9) return [];
  const out: number[] = [];
  const start = Math.round(minX * 100);
  const end = Math.round(maxX * 100);
  for (let c = start; c <= end; c += 1) {
    out.push(c / 100);
  }
  return out;
}

function matchesBuyX(r: RoundRow, X: number): boolean {
  if (approxEq(r.ask, X)) return true;
  return r.mid != null && approxEq(r.mid, X);
}

function matchesSellLevel(r: RoundRow, target: number): boolean {
  if (approxEq(r.bid, target)) return true;
  return r.mid != null && approxEq(r.mid, target);
}

function matchesBuyBelowAndAbove(r: RoundRow, X: number): boolean {
  return r.ask <= X && r.ask >= X * 0.7;
}

function firstRowMatchingBuyXInEarlyWindow(
  rows: RoundRow[],
  X: number,
  earlyCutoff: number,
  belowAndAbove: boolean,
): RoundRow | null {
  for (const r of rows) {
    if (r.msecs > earlyCutoff) break;
    const ok = belowAndAbove ? matchesBuyBelowAndAbove(r, X) : matchesBuyX(r, X);
    if (ok) return r;
  }
  return null;
}

function firstRowSellAfterDelay(
  rows: RoundRow[],
  targetBid: number,
  tX: number,
  belowAndAbove: boolean,
): RoundRow | null {
  const earliestSellMsecs = tX + SELL_DELAY_AFTER_X_MS;
  for (const r of rows) {
    if (r.msecs < earliestSellMsecs) continue;
    const ok = belowAndAbove ? r.bid >= targetBid : matchesSellLevel(r, targetBid);
    if (ok) return r;
  }
  return null;
}

/** Ratio (xDiff/x) desc, then buyX asc — used server-side and for client grouping. */
export function compareInspectV3MetricRows(a: InspectV3MetricRow, b: InspectV3MetricRow): number {
  const ratio = (r: InspectV3MetricRow) =>
    r.xAppearance > 0 ? r.xDiffAppearance / r.xAppearance : -1;
  const rb = ratio(b);
  const ra = ratio(a);
  if (rb !== ra) return rb - ra;
  return a.buyX - b.buyX;
}

export function computeSnowpolyInspectV3Metrics(
  rows: SnowpolyHistoryRow[],
  params: InspectV3Params,
): InspectV3MetricRow[] {
  if (rows.length === 0) return [];

  const columns = Object.keys(rows[0]);
  const askCol = resolveFirstColumn(columns, ['best_ask', 'ask']);
  const bidCol = resolveFirstColumn(columns, ['best_bid', 'bid']);
  const midCol = resolveColName(columns, 'mid');
  const msecsCol = resolveColName(columns, 'msecs');
  const roundCol = resolveColName(columns, 'round_ts');

  if (!askCol || !bidCol || !msecsCol || !roundCol) {
    throw new Error(
      'History rows must include best_ask (or ask), best_bid (or bid), msecs, and round_ts columns (any case).',
    );
  }

  const roundGroups = buildRoundGroups(rows, askCol, bidCol, midCol, msecsCol, roundCol);
  const totalRounds = roundGroups.length;
  const earlyCutoff = earlyMsecsCutoff(params.timeSeconds);
  const buyXs = enumerateBuyX(params.minBuyX, params.priceDiff);

  const result: InspectV3MetricRow[] = [];

  for (const X of buyXs) {
    const targetBid = X + params.priceDiff;
    let xAppearance = 0;
    let xDiffAppearance = 0;

    for (const g of roundGroups) {
      const firstXRow = firstRowMatchingBuyXInEarlyWindow(
        g.rows,
        X,
        earlyCutoff,
        params.belowAndAbove,
      );
      if (!firstXRow) continue;

      xAppearance += 1;

      const firstSellRow = firstRowSellAfterDelay(
        g.rows,
        targetBid,
        firstXRow.msecs,
        params.belowAndAbove,
      );
      if (firstSellRow) {
        xDiffAppearance += 1;
      }
    }

    const spent = params.amount * xAppearance;
    const got =
      params.amount *
      xDiffAppearance *
      ((params.priceDiff + X) / X - 0.03);
    const profit = got - spent;

    result.push({
      buyX: X,
      totalRounds,
      xAppearance,
      xDiffAppearance,
      spent,
      got,
      profit,
    });
  }

  result.sort(compareInspectV3MetricRows);
  return result;
}
