# Sprint 5: Polish & Production Deployment

**Duration**: 2 weeks (Week 9-10)
**Team**: Full stack team (2-3 engineers)
**Prerequisites**: Sprints 1-4 completed (Feature-complete app)

## Overview

Final polish, optimization, security hardening, production deployment, and comprehensive testing. This sprint ensures the application is production-ready, performant, secure, and ready for real-world usage or SDK extraction.

## Goals

### Primary Goals
1. Performance optimization (code splitting, lazy loading, caching)
2. Security hardening (CSP, XSS prevention, rate limiting)
3. Production deployment (Docker, CI/CD, monitoring)
4. Comprehensive testing (unit, integration, E2E, load)
5. Documentation complete (API, user guides, developer docs)
6. Advanced features (optional: polls, reactions, spotlight)
7. Final UI/UX polish
8. Accessibility improvements

### Success Criteria
- [ ] Lighthouse score > 90
- [ ] Bundle size < 500KB gzipped
- [ ] API response time < 100ms (P95)
- [ ] WebSocket latency < 50ms (P95)
- [ ] Zero critical security vulnerabilities
- [ ] 100% uptime during 48-hour stress test
- [ ] 50+ concurrent users supported
- [ ] Accessibility score > 95 (a11y)
- [ ] Complete documentation
- [ ] Production deployed and accessible

## Tasks

### Week 1: Performance & Security

#### Day 1-2: Performance Optimization

**Frontend**:
- [ ] Code splitting by route
- [ ] Lazy loading components
- [ ] Image optimization (WebP, lazy loading)
- [ ] Service worker for caching
- [ ] Reduce bundle size
- [ ] Remove unused dependencies
- [ ] Optimize re-renders (React.memo, useMemo)
- [ ] Virtual scrolling for large lists
- [ ] Defer non-critical JavaScript

**Backend**:
- [ ] Query optimization (indexes, N+1 prevention)
- [ ] Response caching (Redis)
- [ ] Database connection pooling
- [ ] Worker pool optimization
- [ ] Reduce memory usage
- [ ] Compression (gzip, brotli)

**Metrics**:
```bash
# Target metrics
- Lighthouse Performance: > 90
- Bundle size: < 500KB gzipped
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
```

**Tools**:
```bash
# Frontend analysis
pnpm add -D webpack-bundle-analyzer
pnpm add -D @next/bundle-analyzer
pnpm add -D lighthouse

# Backend profiling
pnpm add -D clinic
pnpm add -D 0x
```

**Example Optimizations**:

```typescript
// Code splitting by route
const Call = lazy(() => import('./pages/Call'));
const Home = lazy(() => import('./pages/Home'));

// Memoization
const ParticipantTile = React.memo(({ participant }) => {
  // Component
});

// Virtual scrolling
import { FixedSizeList } from 'react-window';

function ParticipantGrid({ participants }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={participants.length}
      itemSize={200}
      layout="grid"
    >
      {ParticipantTile}
    </FixedSizeList>
  );
}

// Service worker caching
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      caches.open('api-cache').then(cache => {
        return fetch(event.request).then(response => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
    );
  }
});
```

#### Day 3: Security Hardening

**Frontend Security**:
- [ ] Content Security Policy (CSP)
- [ ] XSS prevention (DOMPurify)
- [ ] Secure token storage
- [ ] HTTPS only
- [ ] Sanitize user inputs
- [ ] Rate limiting on client
- [ ] Hide sensitive data in logs

**Backend Security**:
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (Prisma)
- [ ] Rate limiting per user/IP
- [ ] JWT token expiration
- [ ] CORS properly configured
- [ ] Helmet.js security headers
- [ ] Security audit (npm audit)
- [ ] Secrets management
- [ ] Request size limits

**Security Headers**:
```typescript
// Backend
import helmet from '@fastify/helmet';

await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Frontend CSP meta tag
<meta
  httpEquiv="Content-Security-Policy"
  content="default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline';"
/>
```

**Input Sanitization**:
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize chat messages
const sanitizeInput = (input: string) => {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
};
```

**Rate Limiting**:
```typescript
// Backend per-endpoint
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100, // requests
  timeWindow: '1 minute',
  skipOnError: false,
});
```

#### Day 4: Testing Infrastructure

**Unit Tests**:
- [ ] Services layer tests
- [ ] Utility functions tests
- [ ] Component tests
- [ ] Store tests
- [ ] Socket manager tests
- [ ] Media manager tests

**Integration Tests**:
- [ ] API endpoint tests
- [ ] Database operations tests
- [ ] Socket.io event tests
- [ ] Authentication flow tests
- [ ] Room management tests

**E2E Tests**:
- [ ] User registration flow
- [ ] Login flow
- [ ] Create room flow
- [ ] Join room flow
- [ ] Video call flow (2 users)
- [ ] Chat functionality
- [ ] Screen sharing
- [ ] Leave room flow

**Load Tests**:
- [ ] 10 concurrent users
- [ ] 25 concurrent users
- [ ] 50 concurrent users
- [ ] 100 concurrent users (if possible)
- [ ] Memory leak detection
- [ ] Connection stress test

**Setup**:

```bash
# Install testing tools
pnpm add -D vitest
pnpm add -D @testing-library/react @testing-library/jest-dom
pnpm add -D @testing-library/user-event
pnpm add -D playwright
pnpm add -D k6  # Load testing

# Backend testing
pnpm add -D supertest
pnpm add -D @vitest/ui
```

**Example Tests**:

```typescript
// Frontend unit test
import { render, screen, fireEvent } from '@testing-library/react';
import Login from './pages/Login';

describe('Login', () => {
  it('shows error on invalid credentials', async () => {
    render(<Login />);
    
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/login failed/i)).toBeInTheDocument();
    });
  });
});

// Backend integration test
import { test, expect } from 'vitest';
import { build } from '../api/server';

test('POST /api/auth/login returns token', async () => {
  const app = await build();
  
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: 'test@test.com',
      password: 'password123',
    },
  });
  
  expect(response.statusCode).toBe(200);
  expect(response.json()).toHaveProperty('token');
});

// E2E test
import { test, expect } from '@playwright/test';

test('user can create and join room', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@test.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  // Create room
  await expect(page).toHaveURL('/');
  await page.click('text=Create Room');
  await page.fill('[name="roomName"]', 'Test Room');
  await page.click('button:has-text("Create")');
  
  // Should be in call page
  await expect(page).toHaveURL(/\/call\/\w+/);
});
```

#### Day 5: Load Testing & Optimization

**Load Testing with K6**:
```javascript
// scripts/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  // Login
  let loginRes = http.post('http://localhost:3000/api/auth/login', JSON.stringify({
    email: `user${__VU}@test.com`,
    password: 'password123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'token received': (r) => r.json('token') !== undefined,
  });
  
  let token = loginRes.json('token');
  
  // Create room
  let roomRes = http.post('http://localhost:3000/api/rooms/create', JSON.stringify({
    name: `Room ${__VU}`,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  
  check(roomRes, {
    'room created': (r) => r.status === 200,
  });
  
  sleep(1);
}
```

**Run Load Tests**:
```bash
k6 run scripts/load-test.js
```

### Week 2: Deployment & Documentation

#### Day 6-7: Production Deployment

**Docker Setup**:

```dockerfile
# apps/backend/Dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Run
CMD ["pnpm", "start"]
```

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    build: ./apps/backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/connect
      - REDIS_HOST=redis
    depends_on:
      - db
      - redis
    restart: unless-stopped

  frontend:
    build: ./apps/frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=connect
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  postgres-data:
  redis-data:
```

**CI/CD with GitHub Actions**:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        run: |
          # SSH and deploy commands
```

**Environment Setup**:

```bash
# Production .env
NODE_ENV=production
PORT=3000
SIGNALING_PORT=4000

DATABASE_URL=postgresql://user:pass@db:5432/connect_prod
REDIS_HOST=redis
REDIS_PASSWORD=secure_password

JWT_SECRET=super_secure_random_secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

CORS_ORIGIN=https://yourdomain.com

MEDIASOUP_ANNOUNCED_IP=your_server_ip
MEDIASOUP_RTC_MIN_PORT=2000
MEDIASOUP_RTC_MAX_PORT=2420

RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW=15 minutes
```

**Deployment Steps**:
1. Set up server (Ubuntu/Debian)
2. Install Docker and Docker Compose
3. Clone repository
4. Configure environment variables
5. Build images
6. Start services
7. Set up Nginx reverse proxy
8. Configure SSL with Let's Encrypt
9. Set up monitoring
10. Test deployment

**Nginx Configuration**:

```nginx
# /etc/nginx/sites-available/connect
upstream backend {
    server localhost:3000;
}

upstream frontend {
    server localhost:5173;
}

server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # WebSocket signaling
    location /socket {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

**SSL Setup**:
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

#### Day 8: Monitoring & Logging

**Monitoring Stack**:
- Prometheus for metrics
- Grafana for dashboards
- Sentry for error tracking
- PM2 for process management

**Setup**:

```bash
# Backend monitoring
pnpm add prom-client
pnpm add @sentry/node

# Frontend monitoring
pnpm add @sentry/react
```

**Prometheus Metrics**:
```typescript
// Backend
import { Registry, Counter, Histogram } from 'prom-client';

const register = new Registry();

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
});

export const activeConnections = new Counter({
  name: 'active_connections_total',
  help: 'Total active WebSocket connections',
});

register.registerMetric(httpRequestDuration);
register.registerMetric(activeConnections);

// In Fastify
app.addHook('onResponse', (request, reply) => {
  httpRequestDuration.observe({ method: request.method, route: request.url }, reply.elapsedTime / 1000);
});
```

**Sentry Error Tracking**:
```typescript
// Backend
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Frontend
Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

**PM2 Process Management**:
```bash
npm install -g pm2

# Ecosystem file
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'connect-backend',
    script: './apps/backend/dist/index.js',
    instances: 4,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Day 9: Documentation

**Docs to Create**:
1. **API Documentation**: Already have Swagger, expand
2. **User Guide**: How to use the app
3. **Developer Guide**: How to set up development
4. **Deployment Guide**: Production deployment
5. **Architecture Docs**: System design, decisions
6. **Contributing Guide**: For future contributors
7. **README**: Quick start, links to other docs

**Example README**:

```markdown
# Connect SDK - Video Calling Platform

[![Build Status](https://github.com/yourusername/connect-sdk/workflows/CI/badge.svg)](https://github.com/yourusername/connect-sdk)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Connect SDK is a production-ready video calling platform built with modern web technologies.

## Features

- 🎥 High-quality video calling
- 🎤 Crystal-clear audio
- 🖥️ Screen sharing
- 💬 Text chat
- 👥 Multi-participant rooms
- 🔒 Secure and private
- ⚡ Low latency
- 📱 Responsive design

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 8+
- Docker Desktop

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/connect-sdk.git
cd connect-sdk

# Install dependencies
pnpm install

# Start development
pnpm dev
```

Visit http://localhost:5173

### Production Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Documentation

- [API Documentation](http://localhost:3000/docs)
- [Architecture Guide](docs/ARCHITECTURE.md)
- [User Guide](docs/USER_GUIDE.md)
- [Contributing](CONTRIBUTING.md)

## Tech Stack

**Frontend**: React 19, Vite, Tailwind CSS, Mediasoup-client
**Backend**: Node.js, Fastify, Mediasoup, Socket.io
**Database**: PostgreSQL, Redis
**DevOps**: Docker, GitHub Actions

## License

MIT
```

#### Day 10: Final Testing & Launch

**Final Checklist**:
- [ ] All tests passing
- [ ] Performance metrics met
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Production deployed
- [ ] Monitoring active
- [ ] Load tested successfully
- [ ] Cross-browser tested
- [ ] Mobile tested
- [ ] Accessibility checked
- [ ] SEO optimized (if applicable)
- [ ] Legal pages (Terms, Privacy)
- [ ] Backup strategy in place
- [ ] Rollback plan ready

**Launch Steps**:
1. Final smoke testing
2. Announce internally
3. Limited beta release
4. Monitor closely for 24 hours
5. Fix any critical issues
6. Full public release
7. Marketing/announcement

## Deliverables

### Code
- [x] Optimized performance
- [ ] Security hardened
- [ ] Fully tested
- [ ] Production deployed
- [ ] Monitored

### Documentation
- [ ] Complete API docs
- [ ] User guide
- [ ] Developer guide
- [ ] Deployment guide
- [ ] Architecture docs

### Testing
- [ ] Unit tests > 80% coverage
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Load tests successful
- [ ] Security audit passed

## Success Metrics

- ✅ Lighthouse score > 90
- ✅ Bundle size < 500KB
- ✅ API latency < 100ms
- ✅ Zero critical bugs
- ✅ 100% uptime
- ✅ 50+ concurrent users
- ✅ Production deployed

## Phase 1 Complete!

🎉 Congratulations! You now have a **production-ready video calling platform**.

**Next Phase**: SDK extraction - Convert this into distributable SDKs for React, Vue, Angular, and mobile platforms.

