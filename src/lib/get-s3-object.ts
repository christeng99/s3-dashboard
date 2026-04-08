import * as Minio from 'minio';

export async function getS3Object(key: string): Promise<string> {
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing S3 configuration in environment variables');
  }

  const url = new URL(endpoint);
  const host = url.hostname;
  const port = url.port
    ? parseInt(url.port, 10)
    : url.protocol === 'https:'
      ? 443
      : 9000;
  const useSSL = url.protocol === 'https:';

  const client = new Minio.Client({
    endPoint: host,
    port,
    useSSL,
    accessKey: accessKeyId,
    secretKey: secretAccessKey,
    region: process.env.NEXT_PUBLIC_S3_REGION,
  });

  const dataStream = await client.getObject(bucket, key);
  let data = '';
  for await (const chunk of dataStream) {
    data += chunk.toString();
  }
  return data;
}

/** Load object bytes from S3 (e.g. SQLite files). */
export async function getS3ObjectBuffer(key: string): Promise<Uint8Array> {
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing S3 configuration in environment variables');
  }

  const url = new URL(endpoint);
  const host = url.hostname;
  const port = url.port
    ? parseInt(url.port, 10)
    : url.protocol === 'https:'
      ? 443
      : 9000;
  const useSSL = url.protocol === 'https:';

  const client = new Minio.Client({
    endPoint: host,
    port,
    useSSL,
    accessKey: accessKeyId,
    secretKey: secretAccessKey,
    region: process.env.NEXT_PUBLIC_S3_REGION,
  });

  const dataStream = await client.getObject(bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of dataStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}
