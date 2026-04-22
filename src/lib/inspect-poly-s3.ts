import { getS3Object, isS3ObjectMissingError } from '@/lib/get-s3-object';
import { resolveInspectCoinS3Key, type InspectCoinKey } from '@/lib/inspect-simulate';

export class InspectPolyNotFoundError extends Error {
  readonly s3Key: string;

  constructor(s3Key: string) {
    super(`Poly history not found at S3 key: ${s3Key}`);
    this.name = 'InspectPolyNotFoundError';
    this.s3Key = s3Key;
  }
}

export function isInspectPolyNotFoundError(err: unknown): err is InspectPolyNotFoundError {
  return err instanceof InspectPolyNotFoundError;
}

export async function fetchInspectPolyHistoryJson(
  coin: InspectCoinKey,
): Promise<{ raw: string; s3Key: string }> {
  const s3Key = resolveInspectCoinS3Key(coin);
  try {
    const raw = await getS3Object(s3Key);
    return { raw, s3Key };
  } catch (e) {
    if (isS3ObjectMissingError(e)) throw new InspectPolyNotFoundError(s3Key);
    throw e;
  }
}
