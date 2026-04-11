# Crowwws — Anonymous Video + Text Chat Platform

An Omegle-style anonymous chat platform where users are matched with strangers based on shared keywords.

## Tech Stack

- **Frontend**: React (Vite) + Tailwind CSS
- **Admin Panel**: React (Vite) + Tailwind CSS + Recharts
- **Backend**: Node.js + Express + Socket.io
- **Database**: PostgreSQL (Prisma ORM)
- **Cache/Queue**: Redis (ioredis)
- **Video**: Agora RTC SDK
- **Auth**: JWT + bcrypt + Nodemailer OTP
- **Moderation**: Hive API (video) + Perspective API (text)

## Project Structure

```
/client    → User-facing React app (port 5173)
/admin     → Admin panel React app (port 5174)
/server    → Node.js backend (port 5000)
.env       → Environment variables
```

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Redis server

### 1. Configure Environment
Copy `.env` and fill in your credentials:
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
AGORA_APP_ID=...
SMTP_USER=...
```

### 2. Install Dependencies
```bash
cd server && npm install
cd ../client && npm install
cd ../admin && npm install
```

### 3. Database Setup
```bash
cd server
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run Development
```bash
# Terminal 1 — Server
cd server && npm run dev

# Terminal 2 — Client
cd client && npm run dev

# Terminal 3 — Admin
cd admin && npm run dev
```

### Ports
- Client: http://localhost:5173
- Admin: http://localhost:5174
- Server API: http://localhost:5000

## Features

- 🔐 Email/OTP authentication
- 🎯 Keyword-based matchmaking
- 🎥 Video + text chat (Agora RTC)
- 💬 Text-only mode
- ⏭️ Skip / disconnect / report
- 🛡️ AI moderation (text + video frames)
- 👮 Admin panel (dashboard, reports, flags, users, analytics)
- 📊 Analytics with charts
