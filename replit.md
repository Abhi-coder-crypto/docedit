# BG Remover Portal

## Overview

BG Remover Portal is a professional background removal service application that connects clients with editors. The platform allows users to upload images for background removal and receive edited results within a specified timeframe. The application features a dual-portal system with separate interfaces for users (to submit images and download results) and administrators (to manage requests and upload edited images).

**Key Features:**
- OTP-based passwordless authentication
- Image upload and management system
- Dual-portal architecture (user and admin)
- Status tracking for image processing requests
- File storage and delivery system

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework**: React with TypeScript
- **Build Tool**: Vite for development and production builds
- **UI Components**: Radix UI primitives with custom shadcn/ui components
- **Styling**: Tailwind CSS v4 with custom theming
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state
- **Forms**: React Hook Form with Zod validation
- **Animations**: Framer Motion for UI transitions

**Design Patterns:**
- Component-based architecture with shadcn/ui design system
- Protected routes with role-based access control (user vs admin)
- Context-based authentication state management
- Custom hooks for reusable logic (mobile detection, toast notifications)

**Route Structure:**
- `/auth` - Authentication page with OTP verification
- `/` - User dashboard (protected)
- `/admin` - Admin dashboard (protected, admin-only)

### Backend Architecture

**Technology Stack:**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Database**: MongoDB for data persistence
- **File Upload**: Multer for multipart form data handling
- **Session Management**: In-memory session storage
- **Build**: ESBuild for server bundling

**API Design:**
- RESTful endpoints for authentication, image uploads, and request management
- File uploads stored as base64 content in MongoDB (serverless-compatible, no filesystem dependency)
- Employee ID + common password authentication (password: "duolin")

**Data Models:**
- **User**: Stores user information (name, email, role)
- **OTPSession**: Temporary storage for OTP verification codes with expiration
- **ImageRequest**: Tracks image upload requests with status (pending/completed)

**Security Considerations:**
- OTP expiration for time-limited authentication
- Role-based authorization (user vs admin)
- File type validation for uploads (JPEG, PNG, WEBP only)
- File size limits (10MB maximum)

### External Dependencies

**Database:**
- **MongoDB**: NoSQL database for storing users, OTP sessions, and image requests
  - Connection managed via `mongodb` driver
  - Connection string via `MONGODB_URI` environment variable
  - Uses cached connection pattern for serverless optimization

**File Storage:**
- **MongoDB-based Storage**: Images stored as base64 strings directly in MongoDB documents
  - `originalFileContent` - Base64-encoded original image content
  - `editedFileContent` - Base64-encoded edited image content
  - Content types stored alongside for proper MIME type handling
  - Serverless-compatible: Works on Vercel and other read-only filesystem environments
  - Uses multer memory storage (no disk writes)

**Email Service:**
- **Resend**: Integrated for sending transactional emails
  - OTP emails sent to clients and admins during login
  - Notification emails sent to clients when admin uploads edited images
  - Configuration in `server/email.ts`
  - API key stored as `RESEND_API_KEY` secret
- OTP format: 6-digit code with 10-minute expiration
- Free tier: 100 emails/day

**Third-Party Libraries:**
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling framework
- **Drizzle Kit**: Database migration toolkit (configured but using raw MongoDB driver)
- **bcryptjs**: Password hashing utilities (included but not actively used due to OTP auth)
- **nanoid**: Unique ID generation for files

**Development Tools:**
- **Replit Plugins**: Development banner, cartographer, runtime error overlay
- **Vite Plugins**: Custom meta images plugin for OpenGraph tags

**Build Process:**
- Client: Vite builds React app to `dist/public`
- Server: ESBuild bundles server code to `dist/index.cjs`
- Production: Serves static files from `dist/public` with Express

**Configuration Notes:**
- Drizzle config present but application uses MongoDB driver directly (not PostgreSQL)
- Environment expects `DATABASE_URL` (PostgreSQL) but application uses `MONGODB_URI`
- Future migration to PostgreSQL with Drizzle ORM is architecturally supported

**Required Secrets (configured via Replit Secrets):**
- `MONGODB_URI` - MongoDB connection string
- `RESEND_API_KEY` - Resend API key for sending OTP emails

**Admin Configuration:**
- Current admin email: `abhijeet18012001@gmail.com` (hardcoded in server/routes.ts line 124 and netlify/functions/api.ts)
- To change admin email, update the email check in both files

## Vercel Deployment

**Setup Steps:**
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard (Project Settings > Environment Variables):
   - `MONGODB_URI` - Your MongoDB connection string
   - `GMAIL_USER` - Gmail address for sending emails
   - `GMAIL_APP_PASSWORD` - Gmail app password
3. Deploy the site

**Build Settings:**
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist/public`

**Project Structure for Vercel:**
- `api/index.ts` - Express serverless handler for API routes
- `vercel.json` - Vercel configuration with rewrites for API routing
- Frontend built with Vite to `dist/public`

**Important Notes:**
- File uploads are stored as base64 in MongoDB (Vercel doesn't support persistent file storage)
- WebSockets are not supported in Vercel serverless functions
- The API uses Express.js running as a serverless function
- All `/api/*` routes are handled by the serverless function

**API Endpoints:**
- `POST /api/auth/login` - User authentication
- `POST /api/images/upload` - Upload image for processing
- `GET /api/images/user/:userId` - Get user's image requests
- `GET /api/images/download/:requestId` - Download image
- `GET /api/admin/requests` - Get all requests (admin)
- `POST /api/admin/upload-edited/:requestId` - Upload edited image (admin)
- `GET /api/health` - Health check endpoint

## Netlify Deployment

**Setup Steps:**
1. Connect your GitHub repository to Netlify
2. Add environment variables in Netlify dashboard (Site settings > Environment variables):
   - `MONGODB_URI` - Your MongoDB connection string
   - `RESEND_API_KEY` - Your Resend API key
3. Deploy the site

**Build Settings:**
- Build command: `npm run build`
- Publish directory: `dist/public`
- Functions directory: `netlify/functions`

**Important Notes:**
- File uploads require external storage (Cloudinary, AWS S3, etc.) for Netlify deployment
- The current local file storage only works on Replit
- For production Netlify deployment, integrate cloud storage for image uploads