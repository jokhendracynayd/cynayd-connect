# Backend Setup & Startup Guide

## Prerequisites

- ✅ pnpm installed globally
- ✅ Docker & Docker Compose installed
- ✅ All dependencies installed

## Quick Start

### Step 1: Configure Environment

```bash
# Copy environment template
copy env.example .env

# Edit .env with your settings (or use defaults for local dev)
```

Default `.env` values work for local development with Docker Compose.

### Step 2: Start Database Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify services are running
docker-compose ps

# Check logs if needed
docker-compose logs -f
```

### Step 3: Run Database Migrations

```bash
# Create database tables
pnpm db:migrate

# This will:
# 1. Create all tables (User, Room, Participant, CallMetrics)
# 2. Add indexes
# 3. Set up foreign keys
```

### Step 4: Start Backend Server

```bash
# Development mode with hot reload
pnpm dev

# Server will start on:
# - REST API: http://localhost:3000
# - API Docs: http://localhost:3000/docs
# - Health Check: http://localhost:3000/health
```

## Verify Installation

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-15T...",
  "uptime": 5.123
}
```

### 2. API Documentation

Open browser: http://localhost:3000/docs

You should see Swagger UI with all available endpoints.

### 3. Test Registration

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "password": "password123"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "test@example.com",
      "name": "Test User",
      "picture": null
    },
    "tokens": {
      "accessToken": "jwt-token-here",
      "refreshToken": "refresh-token-here"
    }
  },
  "message": "User registered successfully"
}
```

### 4. Test Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 5. Test Room Creation

```bash
# Use the accessToken from login response
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "My First Room"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "roomCode": "abcd-efgh-ijkl",
    "name": "My First Room",
    "adminId": "user-uuid",
    "isActive": true,
    "maxParticipants": 50,
    "admin": {
      "id": "user-uuid",
      "name": "Test User",
      "email": "test@example.com"
    }
  },
  "message": "Room created successfully"
}
```

## Development Commands

```bash
# Start dev server with hot reload
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Database
pnpm db:migrate    # Run migrations
pnpm db:generate   # Generate Prisma client
pnpm db:studio     # Open Prisma Studio (GUI)
```

## Troubleshooting

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

### Redis Connection Error

```bash
# Check if Redis is running
docker-compose ps redis

# Restart Redis
docker-compose restart redis

# Check logs
docker-compose logs redis
```

### Port Already in Use

```bash
# Check what's using port 3000
netstat -ano | findstr :3000

# Kill the process or change PORT in .env
```

### Prisma Client Not Generated

```bash
# Generate Prisma client
pnpm db:generate

# If migration failed
pnpm db:migrate reset
```

## Next Steps

After backend is running:

1. ✅ Test all API endpoints via Swagger UI
2. ✅ Verify authentication flow (register → login → create room)
3. ✅ Check database with Prisma Studio: `pnpm db:studio`
4. ✅ Ready to integrate with frontend (Sprint 3)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user  
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user (protected)

### Rooms
- `POST /api/rooms` - Create room (protected)
- `GET /api/rooms/:roomCode` - Get room details
- `POST /api/rooms/:roomCode/join` - Join room (protected)
- `POST /api/rooms/:roomCode/leave` - Leave room (protected)

### Health
- `GET /health` - Server health check
- `GET /docs` - API documentation

## File Structure

```
apps/backend/
├── src/
│   ├── api/
│   │   ├── routes/          ✅ Auth, Room routes
│   │   ├── controllers/     ✅ Auth, Room controllers
│   │   ├── middleware/      ✅ Auth middleware
│   │   ├── schemas/         ✅ Zod validation schemas
│   │   └── server.ts        ✅ Fastify server setup
│   ├── shared/
│   │   ├── config/          ✅ Environment config
│   │   ├── database/        ✅ Prisma, Redis
│   │   ├── services/        ✅ Auth, Room, Token services
│   │   └── utils/           ✅ Logger, Errors
│   └── index.ts             ✅ Main entry point
├── prisma/
│   └── schema.prisma        ✅ Database schema
├── package.json             ✅ Dependencies
├── tsconfig.json            ✅ TypeScript config
├── docker-compose.yml       ✅ Database services
└── env.example              ✅ Environment template
```

## Success! ✅

Your backend is now running and ready for development!

