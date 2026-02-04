# Theye ML Dashboard

A modern Next.js/TypeScript dashboard for exploring, viewing, and managing files in AWS S3 buckets.

## Features

✨ **Core Features:**

- ��� AWS S3 Integration with credential-based authentication
- ��� File Explorer interface to browse S3 bucket contents
- ���️ Preview file content directly in the dashboard
- ���️ Delete files from S3 buckets
- ��� Dark/Light theme toggle
- ��� Responsive mobile-friendly design
- ��� Built with shadcn/ui components

## Tech Stack

- **Framework:** Next.js 16 with TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **AWS SDK:** AWS SDK for JavaScript v3
- **Theme:** next-themes
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ installed
- AWS account with S3 access
- AWS Access Key ID and Secret Access Key

### Installation

1. Clone the repository:

```bash
cd theye-ml-dashboard
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Connecting to S3

1. **Get AWS Credentials:**
   - Navigate to AWS IAM console
   - Create an access key or use existing one
   - Copy Access Key ID and Secret Access Key

2. **Configure Connection:**
   - Enter your AWS credentials in the connection form:
     - AWS Access Key ID
     - AWS Secret Access Key
     - AWS Region (e.g., us-east-1)
     - S3 Bucket Name

3. **Connect:**
   - Click "Connect to S3"
   - The dashboard will display all objects in your bucket

### Explorer Actions

- **Browse Files:** View all files and folders in the bucket
- **View Content:** Click the eye icon to preview file content
- **Delete File:** Click the trash icon to delete a file (with confirmation)
- **Disconnect:** Switch to a different bucket or account

### Theme Toggle

- Click the theme toggle button (sun/moon icon) in the header
- Choose between Light, Dark, or System theme preference

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── s3/
│   │       ├── list/route.ts      # List S3 objects
│   │       ├── get/route.ts        # Get file content
│   │       └── delete/route.ts     # Delete file
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── layout/
│   │   ├── header.tsx             # Header with theme toggle
│   │   └── sidebar.tsx            # Navigation sidebar
│   ├── s3/
│   │   └── s3-explorer.tsx        # Main S3 explorer component
│   ├── ui/                         # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── dropdown-menu.tsx
│   │   └── theme-toggle.tsx
│   └── providers/
│       └── theme-provider.tsx     # Next-themes provider
└── lib/
    └── utils.ts                    # Utility functions
```

## API Routes

### POST /api/s3/list

Lists objects in an S3 bucket.

**Request:**

```json
{
  "bucket": "my-bucket",
  "prefix": "",
  "accessKeyId": "your-access-key",
  "secretAccessKey": "your-secret-key",
  "region": "us-east-1"
}
```

### POST /api/s3/get

Retrieves content of a file from S3.

**Request:**

```json
{
  "bucket": "my-bucket",
  "key": "path/to/file.txt",
  "accessKeyId": "your-access-key",
  "secretAccessKey": "your-secret-key",
  "region": "us-east-1"
}
```

### POST /api/s3/delete

Deletes a file from S3.

**Request:**

```json
{
  "bucket": "my-bucket",
  "key": "path/to/file.txt",
  "accessKeyId": "your-access-key",
  "secretAccessKey": "your-secret-key",
  "region": "us-east-1"
}
```

## Security Notes

⚠️ **Important:** Currently, AWS credentials are sent from the client to the server. For production use:

1. **Implement server-side authentication:**
   - Use AWS roles and temporary credentials
   - Use AWS SigV4 signing with Lambda
   - Implement IAM policy-based access control

2. **Use environment variables:**
   - Store AWS credentials server-side
   - Use `.env.local` for development

3. **Add authentication:**
   - Implement user authentication (NextAuth.js, Auth0, etc.)
   - Restrict access to authorized users only

## Building for Production

```bash
npm run build
npm run start
```

## Contributing

Additions and improvements are welcome! Future features could include:

- Upload files to S3
- Folder navigation
- Multiple bucket support
- File search and filtering
- Advanced file previews (images, JSON, etc.)
- User authentication and permissions
- File versioning display

## License

MIT

---

**Dashboard Ready for Expansion** ���

You can now add more views and features to the sidebar. Each new feature can be a separate sub-view component!
