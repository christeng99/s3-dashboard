import { join } from 'path';
import type { Database, SqlJsStatic } from 'sql.js';

import { getS3ObjectBuffer } from '@/lib/get-s3-object';
import type { InspectCoinKey } from '@/lib/inspect-simulate';

/** S3 object key for the SQLite DB that covers one calendar day. */
export function snowpolyPricesDbS3Key(dayYYYYMMDD: string): string {
  return `snowpoly_history/prices_${dayYYYYMMDD}.db`;
}

function assertCalendarDate(s: string): string {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    throw new Error('Date must be YYYY-MM-DD (loads prices_YYYY-MM-DD.db from S3).');
  }
  const [y, m, d] = t.split('-').map((n) => Number(n));
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(check.getTime()) ||
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error('Invalid calendar date.');
  }
  return t;
}

export type SnowpolyHistoryRow = Record<string, unknown>;

function sanitizeCell(v: unknown): unknown {
  if (v instanceof Uint8Array) {
    return `[binary ${v.byteLength} bytes]`;
  }
  return v;
}

function sanitizeRow(obj: SnowpolyHistoryRow): SnowpolyHistoryRow {
  const out: SnowpolyHistoryRow = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sanitizeCell(v);
  }
  return out;
}

export type SnowpolyHistoryQueryResult = {
  columns: string[];
  rows: SnowpolyHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  s3Key: string;
};

let bufferCache: { key: string; bytes: Uint8Array; at: number } | null = null;
const BUFFER_CACHE_MS = 45_000;

let sqlStaticPromise: Promise<SqlJsStatic> | null = null;

async function getSqlStatic(): Promise<SqlJsStatic> {
  if (!sqlStaticPromise) {
    const init = (await import('sql.js')).default;
    sqlStaticPromise = init({
      locateFile: (file) => join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
  }
  return sqlStaticPromise;
}

async function getPricesDbBytes(dayKey: string): Promise<{ bytes: Uint8Array; s3Key: string }> {
  const calendarDay = assertCalendarDate(dayKey);
  const s3Key = snowpolyPricesDbS3Key(calendarDay);
  const now = Date.now();
  if (
    bufferCache &&
    bufferCache.key === s3Key &&
    now - bufferCache.at < BUFFER_CACHE_MS
  ) {
    return { bytes: bufferCache.bytes, s3Key };
  }
  const raw = await getS3ObjectBuffer(s3Key);
  const copy = new Uint8Array(raw);
  bufferCache = { key: s3Key, bytes: copy, at: now };
  return { bytes: copy, s3Key };
}

function pragmaColumns(db: Database, table: InspectCoinKey): { name: string; type: string }[] {
  const res = db.exec(`PRAGMA table_info(${table})`);
  if (!res.length) return [];
  const { columns, values } = res[0];
  const nameI = columns.indexOf('name');
  const typeI = columns.indexOf('type');
  if (nameI < 0) return [];
  return values.map((row) => ({
    name: String(row[nameI]),
    type: typeI >= 0 ? String(row[typeI] ?? '').toUpperCase() : '',
  }));
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Column name whose lowercase form is `msecs`, if present. */
function resolveMsecsColumn(meta: { name: string }[]): string | null {
  const hit = meta.find((c) => c.name.toLowerCase() === 'msecs');
  return hit ? hit.name : null;
}

function resolveRoundTsColumn(meta: { name: string }[]): string | null {
  const hit = meta.find((c) => c.name.toLowerCase() === 'round_ts');
  return hit ? hit.name : null;
}

function buildOrderByClause(meta: { name: string }[]): string {
  const roundTs = resolveRoundTsColumn(meta);
  const msecs = resolveMsecsColumn(meta);
  if (roundTs && msecs) {
    return `${quoteIdent(roundTs)} ASC, ${quoteIdent(msecs)} ASC`;
  }
  if (roundTs) {
    return `${quoteIdent(roundTs)} ASC`;
  }
  if (msecs) {
    return `${quoteIdent(msecs)} ASC`;
  }
  return 'rowid ASC';
}

export async function querySnowpolyHistoryTable(
  table: InspectCoinKey,
  opts: { fileDate: string; page: number; pageSize: number },
): Promise<SnowpolyHistoryQueryResult> {
  const page = Math.max(1, Math.floor(opts.page));
  const pageSize = Math.min(450, Math.max(1, Math.floor(opts.pageSize)));
  const offset = (page - 1) * pageSize;

  const { bytes, s3Key } = await getPricesDbBytes(opts.fileDate);
  const SQL = await getSqlStatic();
  const db = new SQL.Database(bytes);

  try {
    const meta = pragmaColumns(db, table);
    if (meta.length === 0) {
      throw new Error(`Table "${table}" was not found or has no columns.`);
    }

    const countStmt = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`);
    countStmt.step();
    const total = Number(countStmt.getAsObject().c ?? 0);
    countStmt.free();

    const orderBy = buildOrderByClause(meta);

    const dataStmt = db.prepare(
      `SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    );
    dataStmt.bind([pageSize, offset]);

    const columns = dataStmt.getColumnNames();
    const rows: SnowpolyHistoryRow[] = [];
    while (dataStmt.step()) {
      rows.push(sanitizeRow(dataStmt.getAsObject() as SnowpolyHistoryRow));
    }
    dataStmt.free();

    return {
      columns,
      rows,
      total,
      page,
      pageSize,
      s3Key,
    };
  } finally {
    db.close();
  }
}
