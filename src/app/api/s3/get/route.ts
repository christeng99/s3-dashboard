import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';

async function getS3Object(key: string): Promise<string> {
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('Missing S3 configuration in environment variables');
  }

  try {
    // Parse endpoint URL to get host and port
    const url = new URL(endpoint);
    const host = url.hostname;
    const port = url.port
      ? parseInt(url.port)
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

    console.log(`Retrieving object: ${key}`);

    const dataStream = await client.getObject(bucket, key);

    // Convert stream to string
    let data = '';
    for await (const chunk of dataStream) {
      data += chunk.toString();
    }

    return data;
  } catch (error) {
    console.error('Error at MinIO get:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json(
        { error: 'Missing key parameter' },
        { status: 400 },
      );
    }

    const content = await getS3Object(key);

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error retrieving S3 object:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve S3 object' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST method with key in body' },
    { status: 405 },
  );
}
