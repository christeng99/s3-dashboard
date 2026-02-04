import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';

interface S3File {
  key: string;
  isFolder: boolean;
  size?: number;
  lastModified?: Date;
}

async function listS3Objects(prefix: string): Promise<S3File[]> {
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

    console.log('MinIO client created, listing objects...');

    const files: S3File[] = [];
    const objectsList = client.listObjects(bucket, prefix || '', true);

    for await (const obj of objectsList) {
      if (obj.name) {
        // Check if it's a folder (ends with /)
        const isFolder = obj.name.endsWith('/');
        files.push({
          key: obj.name,
          isFolder,
          size: obj.size,
          lastModified: obj.lastModified,
        });
      }
    }

    console.log(`Found ${files.length} objects`);
    return files;
  } catch (error) {
    console.error('Error at MinIO list:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prefix } = body;

    const files = await listS3Objects(prefix || '');

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error listing S3 objects:', error);
    return NextResponse.json(
      { error: 'Failed to list S3 objects' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST method with prefix in body' },
    { status: 405 },
  );
}
