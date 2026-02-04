# Theye ML Dashboard - Setup Guide

## Environment Configuration

The dashboard now loads S3 credentials and endpoint configuration from environment variables. No credentials are needed in the UI.

### Step 1: Create `.env.local` file

Copy `.env.example` to `.env.local` and fill in your S3 details:

```bash
cp .env.example .env.local
```

### Step 2: Configure Your S3 Connection

Edit `.env.local` with your specific S3 configuration:

```env
# Custom S3 Endpoint (supports AWS S3, RunPod, MinIO, Wasabi, etc.)
NEXT_PUBLIC_S3_ENDPOINT=https://s3api-eu-ro-1.runpod.io

# Your S3 bucket name
NEXT_PUBLIC_S3_BUCKET=my-bucket-name

# AWS Region
NEXT_PUBLIC_S3_REGION=us-east-1

# S3 Access Credentials (kept private on server)
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
```

### Step 3: Update Your Credentials

Replace the placeholder values with:

- `your-bucket-name` → Your actual S3 bucket name
- `your-access-key-id` → Your S3 access key ID
- `your-secret-access-key` → Your S3 secret access key
- `https://s3api-eu-ro-1.runpod.io` → Your custom S3 endpoint (already set for RunPod EU-RO-1)

### Step 4: Start the Dashboard

```bash
npm run dev
```

The dashboard will automatically load your bucket contents without requiring any credential input in the UI.

## Security Notes

✅ **What's secure:**

- Credentials are stored server-side only in `.env.local`
- Never exposed to the client/browser
- Only endpoint and bucket name are available to frontend
- All S3 operations go through Next.js API routes

⚠️ **Best practices:**

1. **NEVER commit `.env.local` to git** - It contains sensitive credentials
2. Add `.env.local` to your `.gitignore` (it's already there by default)
3. For production, use environment variables set in your hosting platform
4. Consider rotating credentials periodically

## Supported S3 Providers

This dashboard works with any S3-compatible service:

- ✅ AWS S3
- ✅ RunPod S3 API
- ✅ MinIO
- ✅ Wasabi
- ✅ DigitalOcean Spaces
- ✅ Linode Object Storage
- ✅ Backblaze B2
- ✅ Any S3-compatible endpoint

## Features

- **Browse:** Navigate folders in your S3 bucket
- **View:** Preview text file contents
- **Delete:** Remove files with confirmation
- **Refresh:** Manually refresh the file list
- **Back Navigation:** Easy folder navigation with back button
- **Theme Toggle:** Dark/Light mode support

## Troubleshooting

**Error: Missing S3 configuration**

- Make sure `.env.local` file exists with all required variables
- Restart the dev server after changing `.env.local`
- Check that variable names are spelled correctly

**Error: Failed to list files**

- Verify your S3 credentials are correct
- Check that the bucket name is correct
- Ensure your credentials have ListBucket permissions
- Verify the endpoint URL is correct

**Error: Failed to get/delete file**

- Ensure your credentials have GetObject/DeleteObject permissions
- Check that the file key/path is correct
- Verify your IAM policy allows the operation

## Running in Production

1. Build the project:

```bash
npm run build
```

2. Set environment variables in your hosting platform:
   - Vercel: Environment Variables in project settings
   - Heroku: Config Vars
   - Docker: `docker run -e NEXT_PUBLIC_S3_ENDPOINT=...`
   - Custom Server: `.env` file or system environment variables

3. Start the production server:

```bash
npm run start
```

## Advanced Configuration

### Using RunPod S3 API

For RunPod users, use your RunPod pod's S3 API endpoint:

```env
# Example RunPod S3 endpoint
NEXT_PUBLIC_S3_ENDPOINT=https://s3api-eu-ro-1.runpod.io
NEXT_PUBLIC_S3_BUCKET=your-bucket-name
NEXT_PUBLIC_S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-runpod-access-key
S3_SECRET_ACCESS_KEY=your-runpod-secret-key
```

### Using MinIO

For self-hosted MinIO servers:

```env
NEXT_PUBLIC_S3_ENDPOINT=http://minio.example.com:9000
NEXT_PUBLIC_S3_BUCKET=mybucket
NEXT_PUBLIC_S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

## Environment Variables Reference

| Variable                  | Required | Public | Description                     |
| ------------------------- | -------- | ------ | ------------------------------- |
| `NEXT_PUBLIC_S3_ENDPOINT` | Yes      | Yes    | S3 endpoint URL                 |
| `NEXT_PUBLIC_S3_BUCKET`   | Yes      | Yes    | S3 bucket name                  |
| `NEXT_PUBLIC_S3_REGION`   | No       | Yes    | AWS region (default: us-east-1) |
| `S3_ACCESS_KEY_ID`        | Yes      | No     | S3 access key (server-only)     |
| `S3_SECRET_ACCESS_KEY`    | Yes      | No     | S3 secret key (server-only)     |

**Public** variables are visible in the browser and can be prefixed with `NEXT_PUBLIC_`.
**Private** variables are server-only and never exposed to the client.
