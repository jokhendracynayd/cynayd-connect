# Connect SDK

Production-grade WebRTC SDK similar to Agora and Google Meet.

## 🎉 Current Status

**Phase 1 - Sprint 1: COMPLETE** ✅

- ✅ Backend API fully implemented and tested
- ✅ PostgreSQL database with all tables
- ✅ Authentication system working
- ✅ Room management functional
- ✅ Swagger documentation active
- ✅ Ready for Mediasoup integration (Sprint 2)

**API Server**: http://localhost:3000  
**Documentation**: http://localhost:3000/docs

---

## Project Overview

Building a scalable, robust WebRTC SDK that supports:
- **Web**: React/Vue/Angular applications
- **Android**: Native Kotlin SDK
- **iOS**: Native Swift SDK
- **Self-hosted**: Docker/Kubernetes deployment
- **Cloud**: SaaS option (future)

## Architecture

```
connect-sdk/
├── apps/
│   ├── backend/          # REST API + WebSocket + Mediasoup SFU
│   └── web/              # React frontend (coming Sprint 3)
├── packages/             # SDK packages (coming Phase 2)
├── docs/                 # Comprehensive documentation
└── infrastructure/       # Docker, K8s, Terraform
```

## Technology Stack

### Backend (✅ Implemented)
- Node.js 22.11.0 LTS
- Fastify 5.1.0
- TypeScript 5.6.3
- PostgreSQL 17.2
- Redis 7.4.1
- Prisma 6.18.0

### Media (⏳ Coming Sprint 2)
- Mediasoup 3.14.15
- Socket.io 4.8.1

### Frontend (⏳ Coming Sprint 3)
- React 19.0
- Vite 6.0
- TypeScript 5.6

---

## Quick Start

### Prerequisites
- Node.js 22.11.0+
- pnpm 9.x+
- Docker Desktop
- PostgreSQL & Redis containers

### Setup

```bash
# Clone repository
git clone <repo-url>
cd connect-sdk

# Install dependencies
pnpm install

# Setup database
cd apps/backend
cp env.example .env

# Start existing Docker containers
docker start my-postgres my-redis

# Run migrations
pnpm db:migrate

# Start backend
pnpm dev

# Test API
# Open: http://localhost:3000/docs
```

### Verify Installation

1. Health check: `curl http://localhost:3000/health`
2. Swagger docs: http://localhost:3000/docs
3. Test registration endpoint via Swagger UI

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Rooms
- `POST /api/rooms` - Create room (protected)
- `GET /api/rooms/:roomCode` - Get room details
- `POST /api/rooms/:roomCode/join` - Join room (protected)
- `POST /api/rooms/:roomCode/leave` - Leave room (protected)

---

## Development

```bash
cd apps/backend

# Development
pnpm dev

# Build
pnpm build

# Test
pnpm test

# Database
pnpm db:migrate    # Run migrations
pnpm db:generate   # Generate Prisma client
pnpm db:studio     # Open Prisma Studio
```

---

## Project Roadmap

### Phase 1: Monolithic Web App (10 weeks)
- [x] Sprint 1: Backend Foundation (✅ Complete)
- [ ] Sprint 2: Mediasoup Integration (Week 3-4)
- [ ] Sprint 3: Frontend Foundation (Week 5-6)
- [ ] Sprint 4: Core Features (Week 7-8)
- [ ] Sprint 5: Polish & Production (Week 9-10)

### Phase 2: SDK Extraction (5 weeks)
- Extract packages from working app
- Publish npm packages
- React SDK with hooks
- Backend Docker image

### Phase 3: Multi-Platform (16 weeks)
- Android SDK (8 weeks)
- iOS SDK (8 weeks)

### Phase 4: Advanced Features (10 weeks)
- Recording & Storage
- Analytics Dashboard
- AI Features

### Phase 5: Scaling (8 weeks)
- Multi-region deployment
- Performance optimization

**Total Timeline**: ~12 months to production-ready SDK

---

## Documentation

- [Phase 1 Overview](docs/phase1-plan/00-overview.md)
- [Sprint 1 Plan](docs/phase1-plan/01-sprint1-backend-foundation.md)
- [Sprint 2 Plan](docs/phase1-plan/02-sprint2-mediasoup-signaling.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)
- [Sprint 1 Complete](SPRINT1_COMPLETE.md)

---

## Testing

All endpoints tested and working:
- ✅ Health check
- ✅ User registration
- ✅ User login
- ✅ Room creation
- ✅ Room details
- ✅ JWT authentication
- ✅ Protected routes

---

## License

MIT

---

## Support

- **Documentation**: See `/docs` folder
- **API Docs**: http://localhost:3000/docs (when running)
- **Issues**: GitHub Issues
- **Status**: In active development

---

**Last Updated**: November 2025  
**Version**: 0.1.0 (MVP in development)
