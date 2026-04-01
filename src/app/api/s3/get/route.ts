import { NextRequest, NextResponse } from 'next/server';
import { getS3Object } from '@/lib/get-s3-object';

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
