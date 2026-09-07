# Simplo

Project management tool untuk konstruksi — progress tracking berbasis drawing & marker.

## Stack

- Next.js 14 (App Router)
- PostgreSQL + Prisma
- NextAuth.js (credentials)
- Tailwind CSS

## Setup

```bash
# 1. Start database
docker compose up -d

# 2. Install & seed
npm install
npm run db:setup

# 3. Run
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

### Akun seed

| Email | Password | Role |
|---|---|---|
| admin@simplo.id | Password1 | ADMIN |
| pm@simplo.id | Password1 | PM |
| sm@simplo.id | Password1 | SM |
| leader@simplo.id | Password1 | LEADER |

## Fase 1 (aktif)

- Auth + role
- Project CRUD
- Floor + upload drawing
- Plot marker di drawing
- Breakdown item + bobot
- Centang progress (SM/Leader)
- Dashboard chart overview

## Scripts

- `npm run dev` — development server
- `npm run db:setup` — push schema + seed
- `npm run db:seed` — seed ulang user
