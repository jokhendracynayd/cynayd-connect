# Phase 1: Separated Backend + Frontend Application

## Overview

Phase 1 builds a fully functional video calling web application with **complete separation** between backend and frontend. This architectural decision ensures the backend is SDK-ready from day 1, making the transition to a distributable SDK seamless.

## Timeline

**Duration**: 10 weeks (5 sprints × 2 weeks each)

- **Sprint 1-2** (Weeks 1-4): Backend Development
- **Sprint 3-4** (Weeks 5-8): Frontend Development
- **Sprint 5** (Weeks 9-10): Integration, Testing & Polish

## Goals

### Primary Goals
1. ✅ Build production-ready backend with REST API + WebSocket signaling
2. ✅ Build React frontend that consumes backend as external service
3. ✅ Enable 2+ users to video call with audio/video/screen share
4. ✅ Ensure backend APIs are SDK-ready (documented, authenticated, scalable)

### Success Criteria
- [ ] 10+ users can join same room without quality degradation
- [ ] Video latency < 500ms end-to-end
- [ ] API response time < 100ms (P95)
- [ ] WebSocket latency < 50ms (P95)
- [ ] 100% uptime during 48-hour stress test
- [ ] Zero critical security vulnerabilities
- [ ] Complete API documentation (OpenAPI/Swagger)
- [ ] Docker deployable with single command

## Architecture

### Separation Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│                  Port: 5173 (Vite)                      │
│                                                          │
│  - User Interface (Pages, Components)                   │
│  - SDK-like logic (lib/ folder)                        │
│  - Will be extracted to npm package in Phase 2         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ (Completely Separate)
                   │
┌──────────────────┴──────────────────────────────────────┐
│                    BACKEND (Node.js)                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  REST API (Fastify) - Port 3000                │   │
│  │  - /api/auth/login, /api/auth/register         │   │
│  │  - /api/rooms/create, /api/rooms/:id           │   │
│  │  - /api/users/me, /api/users/:id               │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  Signaling (Socket.io) - Port 4000             │   │
│  │  - WebSocket events for WebRTC negotiation     │   │
│  │  - joinRoom, leaveRoom, produce, consume       │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  Media Server (Mediasoup) - Ports 2000-2420    │   │
│  │  - SFU for video/audio forwarding              │   │
│  │  - Worker pool management                       │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │  Database (PostgreSQL + Redis)                  │   │
│  │  - Users, Rooms, Participants, Metrics         │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

#### 1. Backend = 3 Services in 1 Codebase
- **API Server** (Fastify on port 3000)
- **Signaling Server** (Socket.io on port 4000)
- **Media Server** (Mediasoup workers)

All run in same Node.js process initially, but designed to be split into microservices later.

#### 2. Frontend = Standalone React App
- Deployed separately (CDN/Vercel)
- Treats backend as external API
- Contains SDK-like code in `lib/` folder
- Will become example app when SDK is extracted

#### 3. Communication Protocol
- **HTTP REST**: Authentication, room management, user data
- **WebSocket**: Real-time signaling (Socket.io)
- **WebRTC**: Direct peer-to-media-server communication (UDP)

## Technology Stack (Phase 1)

### Backend
```json
{
  "runtime": "Node.js 22.11.0 LTS",
  "framework": "Fastify 5.1.0",
  "media": "mediasoup 3.14.15",
  "signaling": "socket.io 4.8.1",
  "language": "TypeScript 5.6.3",
  "database": "PostgreSQL 17.2",
  "cache": "Redis 7.4.1",
  "orm": "Prisma 6.0.0",
  "validation": "Zod 3.24.1",
  "auth": "jsonwebtoken 9.0.2",
  "logging": "winston 3.17.0",
  "testing": "vitest 2.1.8"
}
```

### Frontend
```json
{
  "framework": "React 19.0.0",
  "buildTool": "Vite 6.0.1",
  "language": "TypeScript 5.6.3",
  "state": "Zustand 5.0.1",
  "routing": "react-router-dom 7.0.0",
  "webrtc": "mediasoup-client 3.7.16",
  "socket": "socket.io-client 4.8.1",
  "ui": "Tailwind CSS 4.0.0",
  "testing": "vitest 2.1.8 + Playwright 1.48.0"
}
```

### DevOps
```json
{
  "container": "Docker 27.4.1",
  "orchestration": "docker-compose 2.31.0",
  "reverseProxy": "nginx 1.27.3",
  "ssl": "Let's Encrypt (certbot)"
}
```

## Project Structure

```
connect-sdk/
├── apps/
│   ├── backend/                     # Backend application
│   │   ├── src/
│   │   │   ├── api/                 # REST API layer
│   │   │   ├── signaling/           # WebSocket signaling
│   │   │   ├── media/               # Mediasoup SFU
│   │   │   ├── shared/              # Shared code
│   │   │   └── index.ts             # Main entry
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── web/                         # Frontend application
│       ├── src/
│       │   ├── lib/                 # SDK-like code (Phase 2)
│       │   ├── pages/               # React pages
│       │   ├── components/          # React components
│       │   ├── hooks/               # Custom hooks
│       │   ├── store/               # State management
│       │   └── App.tsx
│       ├── public/
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
├── docs/
│   └── phase1-plan/                 # This documentation
│
├── docker-compose.yml               # Local development
├── .env.example
└── package.json                     # Root workspace
```

## Development Environment Setup

### Prerequisites
- Node.js 22.11.0 LTS
- pnpm 9.x
- Docker 27.4.1
- PostgreSQL 17.2 (via Docker)
- Redis 7.4.1 (via Docker)

### Quick Start

```bash
# Clone repository
git clone <repo-url>
cd connect-sdk

# Install dependencies
pnpm install

# Copy environment files
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env

# Start with Docker Compose (recommended)
docker-compose up

# OR start manually
# Terminal 1: Start database services
docker-compose up postgres redis

# Terminal 2: Start backend
cd apps/backend
pnpm dev

# Terminal 3: Start frontend
cd apps/web
pnpm dev
```

## Sprint Breakdown

### Sprint 1: Backend Foundation (Weeks 1-2)
**Focus**: REST API, Database, Authentication

**Deliverables**:
- Fastify server running on port 3000
- PostgreSQL with Prisma ORM
- Redis for caching
- User authentication (register, login, JWT)
- API documentation (Swagger)

**Details**: See [01-sprint1-backend-foundation.md](./01-sprint1-backend-foundation.md)

### Sprint 2: Mediasoup + Signaling (Weeks 3-4)
**Focus**: WebRTC signaling and media server

**Deliverables**:
- Socket.io server on port 4000
- Mediasoup worker pool
- Room management logic
- WebRTC transport creation
- Producer/Consumer handling

**Details**: See [02-sprint2-mediasoup-signaling.md](./02-sprint2-mediasoup-signaling.md)

### Sprint 3: Frontend Foundation (Weeks 5-6)
**Focus**: React UI and basic video calling

**Deliverables**:
- React app with Vite
- Authentication pages
- Room join/create UI
- Basic video player
- Socket.io client integration

**Details**: See [03-sprint3-frontend-foundation.md](./03-sprint3-frontend-foundation.md)

### Sprint 4: Core Features (Weeks 7-8)
**Focus**: Screen sharing, chat, participant management

**Deliverables**:
- Screen sharing
- Text chat
- Participant list
- Device selection
- Network quality indicators
- Active speaker detection

**Details**: See [04-sprint4-core-features.md](./04-sprint4-core-features.md)

### Sprint 5: Polish & Production (Weeks 9-10)
**Focus**: Testing, optimization, deployment

**Deliverables**:
- Comprehensive testing
- Performance optimization
- Security hardening
- Docker deployment
- Documentation
- Production deployment guide

**Details**: See [05-sprint5-polish-production.md](./05-sprint5-polish-production.md)

## Quality Standards

### Code Quality
- TypeScript strict mode enabled
- ESLint + Prettier configured
- 80%+ test coverage
- All PRs require code review
- Git commit conventions (Conventional Commits)

### Performance Targets
- API latency: < 100ms (P95)
- WebSocket latency: < 50ms (P95)
- Video latency: < 500ms end-to-end
- Time to interactive: < 3s
- Lighthouse score: > 90

### Security Standards
- OWASP Top 10 compliance
- Input validation on all endpoints
- Rate limiting on authentication endpoints
- CORS properly configured
- SQL injection prevention (Prisma)
- XSS prevention (React escaping)
- CSRF tokens for state-changing operations
- Helmet.js for HTTP headers

## Testing Strategy

### Backend Testing
- **Unit tests**: Services, utilities (Vitest)
- **Integration tests**: API endpoints, database operations
- **E2E tests**: Complete user flows (Playwright)
- **Load tests**: 100+ concurrent users (Artillery/k6)

### Frontend Testing
- **Unit tests**: Components, hooks (Vitest + Testing Library)
- **Integration tests**: User interactions
- **E2E tests**: Complete flows (Playwright)
- **Visual regression**: Chromatic/Percy

## Deployment Strategy

### Development
- Local: `docker-compose up`
- Hot reload enabled
- Debug logging enabled

### Staging
- Docker containers on cloud (DigitalOcean/AWS)
- PostgreSQL managed instance
- Redis managed instance
- Continuous deployment from `develop` branch

### Production (End of Phase 1)
- Kubernetes cluster (single region)
- PostgreSQL with read replicas
- Redis cluster
- CDN for frontend (Cloudflare)
- Monitoring (Prometheus + Grafana)
- Logging (Winston + Loki)

## Risk Management

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mediasoup crashes under load | High | Worker pool with auto-restart, health checks |
| WebRTC connection failures | High | ICE fallback (TURN servers), retry logic |
| Database performance | Medium | Query optimization, read replicas, connection pooling |
| CORS issues | Low | Proper configuration from day 1 |

### Timeline Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Feature creep | High | Strict sprint scope, backlog management |
| Key developer unavailable | Medium | Knowledge sharing, documentation |
| Third-party API issues | Low | Minimal external dependencies |

## Success Metrics

### Week 2 (Sprint 1 Complete)
- [ ] REST API functional with 10+ endpoints
- [ ] User can register and login
- [ ] JWT authentication working
- [ ] API documented with Swagger

### Week 4 (Sprint 2 Complete)
- [ ] WebSocket signaling working
- [ ] Mediasoup creating transports
- [ ] Backend can handle 2 users connecting

### Week 6 (Sprint 3 Complete)
- [ ] React frontend deployed
- [ ] User can login via UI
- [ ] Video call works between 2 browsers
- [ ] Audio/video streaming functional

### Week 8 (Sprint 4 Complete)
- [ ] Screen sharing implemented
- [ ] Chat messages working
- [ ] 5+ users can join same room
- [ ] All core features functional

### Week 10 (Sprint 5 Complete)
- [ ] All tests passing (80%+ coverage)
- [ ] Production deployment successful
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation complete

## Next Phase Preview

After Phase 1 completion, Phase 2 will:
1. Extract `lib/` folder from frontend into `@connect-sdk/client-browser`
2. Publish backend as Docker image `@connect-sdk/server`
3. Create React SDK with hooks `@connect-sdk/client-react`
4. Refactor demo app to use published packages

The separated architecture in Phase 1 makes this transition seamless.

## Questions & Decisions Log

### Decision 1: Fastify vs Express
**Decision**: Fastify
**Reason**: 2.4x faster, native TypeScript, built-in validation, lower latency for WebRTC signaling

### Decision 2: Prisma vs TypeORM
**Decision**: Prisma
**Reason**: Better TypeScript support, auto-generated types, modern DX, migration tools

### Decision 3: Zustand vs Redux
**Decision**: Zustand
**Reason**: Simpler API, less boilerplate, sufficient for Phase 1 scope

### Decision 4: Monorepo tool
**Decision**: Turborepo (Phase 2+)
**Reason**: Faster than Nx for TypeScript, better caching, simpler config. Not needed in Phase 1 (only 2 apps).

## Resources

- [Mediasoup Documentation](https://mediasoup.org/documentation/v3/)
- [Fastify Documentation](https://fastify.dev/)
- [React 19 Documentation](https://react.dev/)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [WebRTC Specification](https://www.w3.org/TR/webrtc/)

---

**Last Updated**: November 2025
**Status**: Planning Complete, Ready for Sprint 1

