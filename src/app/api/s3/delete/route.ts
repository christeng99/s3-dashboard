import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';

async function deleteS3Object(key: string): Promise<void> {
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

    console.log(`Deleting object: ${key}`);

    // Check if it's a folder (ends with /)
    const isFolder = key.endsWith('/');

    if (isFolder) {
      // For folders, delete all objects with this prefix
      const objectsList = client.listObjects(bucket, key);
      for await (const obj of objectsList) {
        if (obj.name) {
          await client.removeObject(bucket, obj.name);
          console.log(`Deleted nested object: ${obj.name}`);
        }
      }
      console.log(`Successfully deleted folder: ${key}`);
    } else {
      // For files, delete directly
      await client.removeObject(bucket, key);
      console.log(`Successfully deleted file: ${key}`);
    }
  } catch (error) {
    console.error('Error at MinIO delete:', error);
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

    await deleteS3Object(key);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting S3 object:', error);
    return NextResponse.json(
      { error: 'Failed to delete S3 object' },
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
