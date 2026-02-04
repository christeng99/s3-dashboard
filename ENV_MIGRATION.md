# Environment Variable Migration

## What Changed

Your Theye ML Dashboard has been updated to use environment variables for credentials instead of requiring manual input in the UI.

### Before

- Users had to manually enter AWS credentials in the dashboard
- Credentials were passed from client to server
- Less secure for production use

### After ✅

- Credentials are loaded from `.env.local` file
- Never exposed to the browser or client
- All S3 operations handled server-side
- More secure and production-ready

## Quick Setup

1. **Edit `.env.local`** with your RunPod S3 credentials:

```env
NEXT_PUBLIC_S3_ENDPOINT=https://s3api-eu-ro-1.runpod.io
NEXT_PUBLIC_S3_BUCKET=your-bucket-name
NEXT_PUBLIC_S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

2. **Restart the dev server**:

```bash
npm run dev
```

3. **Dashboard loads automatically** - No credential input needed!

## Files Changed

### Updated Components

- `src/components/s3/s3-explorer.tsx` - Removed credential form, auto-loads files
- `src/app/api/s3/list/route.ts` - Reads creds from env variables
- `src/app/api/s3/get/route.ts` - Reads creds from env variables
- `src/app/api/s3/delete/route.ts` - Reads creds from env variables

### New Files

- `.env.local` - Your local configuration (DO NOT COMMIT!)
- `.env.example` - Template for environment variables
- `SETUP_GUIDE.md` - Detailed setup instructions

## Security Checklist

- ✅ Credentials stored server-side only
- ✅ Browser can't access `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY`
- ✅ `.env.local` is in `.gitignore` by default
- ✅ Custom S3 endpoint support (RunPod, MinIO, etc.)
- ✅ All API calls go through Next.js (no direct S3 calls from browser)

## Next Steps

1. Update your `.env.local` with your actual credentials
2. Restart the development server
3. The dashboard will automatically load your S3 bucket contents
4. You're ready to browse, view, and delete files!

For detailed setup instructions, see [SETUP_GUIDE.md](./SETUP_GUIDE.md)
