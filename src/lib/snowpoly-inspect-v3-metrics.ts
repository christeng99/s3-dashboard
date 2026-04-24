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
  priceDiff?: number;
  totalRounds: number;
  xAppearance: number;
  xDiffAppearance: number;
  spent: number;
  got: number;
  profit: number;
};

export type InspectV3AdaptiveMode = 'v1' | 'v2';

/** V1/V2 only: cent grid limits for buy X and price diff search. */
export type InspectV3AdaptiveRanges = {
  priceMin: number;
  priceMax: number;
  diffMin: number;
  diffMax: number;
};

export type InspectV3AdaptiveRoundRow = {
  roundIndex: number;
  roundKey: string;
  applied: boolean;
  buyX: number | null;
  priceDiff: number | null;
  spent: number;
  got: number;
  profit: number;
  xAppearance: number;
  xDiffAppearance: number;
};

export type InspectV3AdaptiveResult = {
  mode: InspectV3AdaptiveMode;
  bufferRounds: number;
  lookbackRounds: number;
  totalRounds: number;
  totalSpent: number;
  totalGot: number;
  totalProfit: number;
  rounds: InspectV3AdaptiveRoundRow[];
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
      const rawAsk = normPriceLike(r[askCol]);
      const rawBid = normPriceLike(r[bidCol]);
      const mid = midCol ? normPriceLike(r[midCol]) : null;
      const msecs = toMsecs(r[msecsCol]);
      if (msecs == null) continue;

      // Some rows can have one side missing (e.g. sparse/edge quotes).
      // Reuse the available side so the row remains usable.
      const ask = rawAsk ?? rawBid ?? mid;
      const bid = rawBid ?? rawAsk ?? mid;
      if (ask == null || bid == null) continue;
      parsed.push({ ask, bid, mid, msecs });
    }
    parsed.sort((a, b) => a.msecs - b.msecs);
    groups.push({ roundKey, rows: parsed });
  }
  groups.sort((a, b) => a.roundKey.localeCompare(b.roundKey));
  return groups;
}

export type SnowpolyRoundRow = RoundRow;
export type SnowpolyRoundGroup = RoundGroup;

/** Same grouping/columns as Inspect V3 (for Inspect V1 sweep, etc.). */
export function buildSnowpolyRoundGroupsFromHistory(rows: SnowpolyHistoryRow[]): RoundGroup[] {
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

  return buildRoundGroups(rows, askCol, bidCol, midCol, msecsCol, roundCol);
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

/** V1/V2: cent-level diffs in [diffMin, diffMax] (inclusive). */
function enumerateAdaptiveDiffsInRange(diffMin: number, diffMax: number): number[] {
  const out: number[] = [];
  for (let c = 0; c <= 100; c += 1) {
    const d = c / 100;
    if (d + 1e-9 < diffMin || d - 1e-9 > diffMax) continue;
    out.push(d);
  }
  return out;
}

/** V1/V2: only consider pairs where buy X + price diff (sell target level) lies in this band. */
const ADAPTIVE_X_PLUS_DIFF_MIN = 0.1;
const ADAPTIVE_X_PLUS_DIFF_MAX = 0.8;

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

type PairRoundOutcome = {
  xAppearance: number;
  xDiffAppearance: number;
  spent: number;
  got: number;
  profit: number;
};

type PairCandidate = {
  buyX: number;
  priceDiff: number;
};

function evaluatePairOnRound(
  g: RoundGroup,
  X: number,
  priceDiff: number,
  amount: number,
  earlyCutoff: number,
  belowAndAbove: boolean,
): PairRoundOutcome {
  const firstXRow = firstRowMatchingBuyXInEarlyWindow(g.rows, X, earlyCutoff, belowAndAbove);
  if (!firstXRow) {
    return { xAppearance: 0, xDiffAppearance: 0, spent: 0, got: 0, profit: 0 };
  }

  const targetBid = X + priceDiff;
  const firstSellRow = firstRowSellAfterDelay(g.rows, targetBid, firstXRow.msecs, belowAndAbove);
  const xDiffAppearance = firstSellRow ? 1 : 0;
  const spent = amount;
  const got = xDiffAppearance ? amount * ((priceDiff + X) / X - 0.03) : 0;
  const profit = got - spent;

  return { xAppearance: 1, xDiffAppearance, spent, got, profit };
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

export function computeSnowpolyInspectV3Adaptive(
  rows: SnowpolyHistoryRow[],
  params: InspectV3Params & {
    bufferRounds: number;
    mode: InspectV3AdaptiveMode;
    adaptiveRanges: InspectV3AdaptiveRanges;
  },
): InspectV3AdaptiveResult {
  if (rows.length === 0) {
    const bufferRoundsEmpty = Math.max(0, Math.floor(params.bufferRounds));
    return {
      mode: params.mode,
      bufferRounds: bufferRoundsEmpty,
      lookbackRounds: params.mode === 'v2' ? 8 : bufferRoundsEmpty,
      totalRounds: 0,
      totalSpent: 0,
      totalGot: 0,
      totalProfit: 0,
      rounds: [],
    };
  }

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
  const bufferRounds = Math.max(0, Math.floor(params.bufferRounds));
  /** V1: last `bufferRounds` prior rounds (indices i-buffer … i-1). V2: last 8 rounds. */
  const lookbackRounds = params.mode === 'v2' ? 8 : bufferRounds;
  const { priceMin, priceMax, diffMin, diffMax } = params.adaptiveRanges;
  const xLower = Math.max(params.minBuyX, priceMin);
  const pairCandidates: PairCandidate[] = [];
  for (const diff of enumerateAdaptiveDiffsInRange(diffMin, diffMax)) {
    const buyXCandidates = enumerateBuyX(xLower, diff).filter((X) => X <= priceMax);
    for (const X of buyXCandidates) {
      const sellLevel = X + diff;
      if (
        sellLevel < ADAPTIVE_X_PLUS_DIFF_MIN ||
        sellLevel > ADAPTIVE_X_PLUS_DIFF_MAX
      ) {
        continue;
      }
      pairCandidates.push({ buyX: X, priceDiff: diff });
    }
  }

  if (pairCandidates.length === 0) {
    return {
      mode: params.mode,
      bufferRounds,
      lookbackRounds,
      totalRounds,
      totalSpent: 0,
      totalGot: 0,
      totalProfit: 0,
      rounds: roundGroups.map((g, i) => ({
        roundIndex: i + 1,
        roundKey: g.roundKey,
        applied: false,
        buyX: null,
        priceDiff: null,
        spent: 0,
        got: 0,
        profit: 0,
        xAppearance: 0,
        xDiffAppearance: 0,
      })),
    };
  }

  const pairOutcomes = pairCandidates.map((p) => ({
    pair: p,
    outcomes: roundGroups.map((g) =>
      evaluatePairOnRound(
        g,
        p.buyX,
        p.priceDiff,
        params.amount,
        earlyCutoff,
        params.belowAndAbove,
      ),
    ),
  }));

  const rounds: InspectV3AdaptiveRoundRow[] = [];
  let totalSpent = 0;
  let totalGot = 0;

  for (let i = 0; i < totalRounds; i += 1) {
    if (i < bufferRounds) {
      rounds.push({
        roundIndex: i + 1,
        roundKey: roundGroups[i].roundKey,
        applied: false,
        buyX: null,
        priceDiff: null,
        spent: 0,
        got: 0,
        profit: 0,
        xAppearance: 0,
        xDiffAppearance: 0,
      });
      continue;
    }

    const historyStart = Math.max(0, i - lookbackRounds);
    let bestIdx = 0;
    let bestScore = -Infinity;
    let bestTieProfit = -Infinity;

    for (let pIdx = 0; pIdx < pairOutcomes.length; pIdx += 1) {
      let histProfit = 0;
      let histX = 0;
      let histSell = 0;
      for (let h = historyStart; h < i; h += 1) {
        const o = pairOutcomes[pIdx].outcomes[h];
        histProfit += o.profit;
        histX += o.xAppearance;
        histSell += o.xDiffAppearance;
      }
      const score = params.mode === 'v1' ? histProfit : histX > 0 ? histSell / histX : -1;
      if (score > bestScore || (score === bestScore && histProfit > bestTieProfit)) {
        bestScore = score;
        bestTieProfit = histProfit;
        bestIdx = pIdx;
      }
    }

    const chosen = pairOutcomes[bestIdx];
    const now = chosen.outcomes[i];
    totalSpent += now.spent;
    totalGot += now.got;
    rounds.push({
      roundIndex: i + 1,
      roundKey: roundGroups[i].roundKey,
      applied: true,
      buyX: chosen.pair.buyX,
      priceDiff: chosen.pair.priceDiff,
      spent: now.spent,
      got: now.got,
      profit: now.profit,
      xAppearance: now.xAppearance,
      xDiffAppearance: now.xDiffAppearance,
    });
  }

  return {
    mode: params.mode,
    bufferRounds,
    lookbackRounds,
    totalRounds,
    totalSpent,
    totalGot,
    totalProfit: totalGot - totalSpent,
    rounds,
  };
}

const MIN_V0_BUY_FILL = 1e-4;

export type InspectV0ResolutionTotals = {
  totalRounds: number;
  bought: number;
  soldAt1: number;
  soldAt0: number;
  successPct: number | null;
  spent: number;
  earned: number;
  profit: number;
  minBalance: number;
};

export type InspectV0ResolutionParams = {
  timeSeconds: number;
  amount: number;
  maxBuyPrice: number;
};

export type InspectV2ProbabilityRow = {
  buyPrice: number;
  totalRounds: number;
  boughtRounds: number;
  wonRounds: number;
  failedRounds: number;
  winProbabilityPct: number | null;
};

export type InspectV2AppearanceRoundRow = {
  roundTs: string;
  firstAppearanceSec: number | null;
  secondAppearanceSec: number | null;
};

export type InspectV2AppearanceMetrics = {
  totalRounds: number;
  firstAppearanceCount: number;
  secondAppearanceCount: number;
  firstVsSecondPct: number | null;
  firstVsTotalPct: number | null;
  rounds: InspectV2AppearanceRoundRow[];
};

/** Level used for “real price” buy filter: mid when present, else best ask. */
function buyRealPriceV0(r: RoundRow): number | null {
  if (r.mid != null && Number.isFinite(r.mid)) return r.mid;
  return Number.isFinite(r.ask) ? r.ask : null;
}

/** Settlement reference on last tick: mid, else mid of bid–ask, else ask. */
function settlePriceV0(r: RoundRow): number | null {
  if (r.mid != null && Number.isFinite(r.mid)) return r.mid;
  const mid = (r.ask + r.bid) / 2;
  if (Number.isFinite(mid)) return mid;
  return Number.isFinite(r.ask) ? r.ask : null;
}

/**
 * Inspect V0: same round/window semantics as JSON-era V0, but rows from Snowpoly SQLite
 * (`querySnowpolyHistoryAllRows`). Buy first early tick with real price ≤ maxBuyPrice;
 * settle at $1 if last tick settle price ≥ 0.5 else $0.
 */
export function computeSnowpolyInspectV0Resolution(
  rows: SnowpolyHistoryRow[],
  params: InspectV0ResolutionParams,
): InspectV0ResolutionTotals {
  const empty: InspectV0ResolutionTotals = {
    totalRounds: 0,
    bought: 0,
    soldAt1: 0,
    soldAt0: 0,
    successPct: null,
    spent: 0,
    earned: 0,
    profit: 0,
    minBalance: 0,
  };

  if (
    !Number.isFinite(params.amount) ||
    params.amount <= 0 ||
    !Number.isFinite(params.maxBuyPrice) ||
    params.maxBuyPrice < MIN_V0_BUY_FILL ||
    params.maxBuyPrice > 1 + 1e-9
  ) {
    return empty;
  }

  if (rows.length === 0) return empty;

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

  const earlyCutoffMs = earlyMsecsCutoff(params.timeSeconds);

  let totalRounds = 0;
  let bought = 0;
  let soldAt1 = 0;
  let soldAt0 = 0;
  let spent = 0;
  let earned = 0;
  let cash = 0;
  let minCash = 0;

  const bumpMin = () => {
    if (cash < minCash) minCash = cash;
  };

  for (const g of roundGroups) {
    if (g.rows.length === 0) continue;

    totalRounds += 1;

    let buyAt: number | null = null;
    for (const r of g.rows) {
      if (r.msecs > earlyCutoffMs) break;
      const p = buyRealPriceV0(r);
      if (
        p != null &&
        p >= MIN_V0_BUY_FILL &&
        p <= params.maxBuyPrice + 1e-12
      ) {
        buyAt = p;
        break;
      }
    }

    const last = g.rows[g.rows.length - 1];
    const settle = settlePriceV0(last);
    if (buyAt == null || settle == null) continue;

    const tokens = params.amount / buyAt;
    bought += 1;
    spent += params.amount;
    cash -= params.amount;
    bumpMin();

    const payout = settle >= 0.5 ? 1 : 0;
    const proceeds = tokens * payout;
    earned += proceeds;
    cash += proceeds;
    bumpMin();

    if (payout === 1) soldAt1 += 1;
    else soldAt0 += 1;
  }

  const successPct = bought > 0 ? (100 * soldAt1) / bought : null;

  return {
    totalRounds,
    bought,
    soldAt1,
    soldAt0,
    successPct,
    spent,
    earned,
    profit: earned - spent,
    minBalance: minCash < 0 ? -minCash : 0,
  };
}

/**
 * Inspect V2 dashboard rows:
 * - Sweep buy thresholds 0.01..0.99
 * - Buy once per round when any tick reaches/breaks threshold
 * - Evaluate by round last price: <0.15 fail, >0.85 win, else ignored
 * - Sort by highest win probability
 */
export function computeSnowpolyInspectV2ProbabilityRows(
  rows: SnowpolyHistoryRow[],
): InspectV2ProbabilityRow[] {
  if (rows.length === 0) return [];

  const roundGroups = buildSnowpolyRoundGroupsFromHistory(rows).filter((g) => g.rows.length > 0);
  const totalRounds = roundGroups.length;

  const roundSnapshots = roundGroups.map((g) => {
    const touchedCents = new Set<number>();
    for (const r of g.rows) {
      const p = buyRealPriceV0(r);
      if (p == null || !Number.isFinite(p)) continue;
      const cents = Math.round(p * 100);
      if (cents >= 1 && cents <= 99) touchedCents.add(cents);
    }
    const last = g.rows[g.rows.length - 1];
    const lastSettle = settlePriceV0(last);
    return { touchedCents, lastSettle };
  });

  const out: InspectV2ProbabilityRow[] = [];
  for (let cents = 1; cents <= 99; cents += 1) {
    const buyPrice = cents / 100;
    let boughtRounds = 0;
    let wonRounds = 0;
    let failedRounds = 0;

    for (const snap of roundSnapshots) {
      if (!snap.touchedCents.has(cents)) continue;
      boughtRounds += 1;
      if (snap.lastSettle == null || !Number.isFinite(snap.lastSettle)) continue;
      if (snap.lastSettle > 0.85) wonRounds += 1;
      else if (snap.lastSettle < 0.15) failedRounds += 1;
    }

    const resolved = wonRounds + failedRounds;
    out.push({
      buyPrice,
      totalRounds,
      boughtRounds,
      wonRounds,
      failedRounds,
      winProbabilityPct: resolved > 0 ? (100 * wonRounds) / resolved : null,
    });
  }

  out.sort((a, b) => {
    const pa = a.winProbabilityPct ?? -1;
    const pb = b.winProbabilityPct ?? -1;
    if (pb !== pa) return pb - pa;
    if (b.wonRounds !== a.wonRounds) return b.wonRounds - a.wonRounds;
    if (b.boughtRounds !== a.boughtRounds) return b.boughtRounds - a.boughtRounds;
    return a.buyPrice - b.buyPrice;
  });

  return out;
}

function toRoundedCents(n: number): number {
  return Math.round(n * 100);
}

function centEq(a: number, b: number): boolean {
  return toRoundedCents(a) === toRoundedCents(b);
}

function toSeconds2(msecs: number): number {
  return Math.round((msecs / 1000) * 100) / 100;
}

export function computeSnowpolyInspectV2AppearanceMetrics(
  rows: SnowpolyHistoryRow[],
  firstPrice: number,
  secondPrice: number,
  delaySeconds = 3,
): InspectV2AppearanceMetrics {
  if (rows.length === 0) {
    return {
      totalRounds: 0,
      firstAppearanceCount: 0,
      secondAppearanceCount: 0,
      firstVsSecondPct: null,
      firstVsTotalPct: null,
      rounds: [],
    };
  }

  const delayMs = Math.max(0, Math.round(delaySeconds * 1000));
  const groups = buildSnowpolyRoundGroupsFromHistory(rows).filter((g) => g.rows.length > 0);

  const roundRows: InspectV2AppearanceRoundRow[] = [];
  let firstAppearanceCount = 0;
  let secondAppearanceCount = 0;

  for (const g of groups) {
    let firstAtMs: number | null = null;
    for (const r of g.rows) {
      if (centEq(r.ask, firstPrice)) {
        firstAtMs = r.msecs;
        break;
      }
    }

    let secondAtMs: number | null = null;
    if (firstAtMs != null) {
      firstAppearanceCount += 1;
      const minSecondMs = firstAtMs + delayMs;
      for (const r of g.rows) {
        if (r.msecs < minSecondMs) continue;
        if (centEq(r.bid, secondPrice)) {
          secondAtMs = r.msecs;
          secondAppearanceCount += 1;
          break;
        }
      }
    }

    roundRows.push({
      roundTs: g.roundKey,
      firstAppearanceSec: firstAtMs == null ? null : toSeconds2(firstAtMs),
      secondAppearanceSec: secondAtMs == null ? null : toSeconds2(secondAtMs),
    });
  }

  const totalRounds = groups.length;
  return {
    totalRounds,
    firstAppearanceCount,
    secondAppearanceCount,
    firstVsSecondPct:
      firstAppearanceCount > 0 ? (100 * secondAppearanceCount) / firstAppearanceCount : null,
    firstVsTotalPct: totalRounds > 0 ? (100 * firstAppearanceCount) / totalRounds : null,
    rounds: roundRows,
  };
}
