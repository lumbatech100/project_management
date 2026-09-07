# Simplo — Project Management Tool

## Stack
- **Frontend + API:** Next.js 14 (App Router)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Auth:** NextAuth.js
- **Styling:** Tailwind CSS
- **Deploy:** VPS + PM2 + Nginx

---

## Struktur Folder

```
project_management/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← sidebar + navbar
│   │   ├── dashboard/
│   │   │   └── page.tsx            ← chart overview
│   │   │
│   │   ├── project/
│   │   │   ├── page.tsx            ← project list
│   │   │   └── [id]/
│   │   │       ├── layout.tsx      ← project detail wrapper
│   │   │       ├── timeline/
│   │   │       │   └── page.tsx    ← jadwal / gantt
│   │   │       ├── progress/
│   │   │       │   └── page.tsx    ← drawing / marker
│   │   │       ├── cost/
│   │   │       │   └── page.tsx
│   │   │       ├── inventory/
│   │   │       │   └── page.tsx
│   │   │       ├── absen/
│   │   │       │   └── page.tsx
│   │   │       └── pekerja/
│   │   │           └── page.tsx
│   │   │
│   │   ├── user/
│   │   │   └── page.tsx
│   │   │
│   │   └── setting/
│   │       └── page.tsx
│   │
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts
│       ├── project/
│       │   ├── route.ts            ← GET list, POST create
│       │   └── [id]/
│       │       └── route.ts        ← GET, PUT, DELETE
│       └── user/
│           └── route.ts
│
├── components/
│   ├── ui/                         ← button, input, modal, dll
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Navbar.tsx
│   ├── dashboard/
│   │   └── ChartOverview.tsx
│   └── project/
│       ├── ProjectCard.tsx
│       ├── ProjectList.tsx
│       ├── timeline/
│       │   └── TimelineView.tsx
│       └── progress/
│           └── FloorView.tsx
│
├── lib/
│   ├── prisma.ts                   ← prisma client singleton
│   ├── auth.ts                     ← nextauth config
│   └── utils.ts
│
├── prisma/
│   └── schema.prisma
│
├── public/
├── .cursorrules
├── .env
├── .env.example
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Database Schema (Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  password  String
  role      Role     @default(LEADER)
  createdAt DateTime @default(now())

  projects  ProjectMember[]
}

enum Role {
  ADMIN
  PM
  SM
  LEADER
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  status      String   @default("active")
  createdAt   DateTime @default(now())

  members     ProjectMember[]
  floors      Floor[]
}

model ProjectMember {
  id        String  @id @default(cuid())
  projectId String
  userId    String
  role      Role

  project   Project @relation(fields: [projectId], references: [id])
  user      User    @relation(fields: [userId], references: [id])
}

model Floor {
  id        String   @id @default(cuid())
  projectId String
  name      String
  drawingUrl String?
  createdAt DateTime @default(now())

  project   Project  @relation(fields: [projectId], references: [id])
  markers   Marker[]
}

model Marker {
  id        String   @id @default(cuid())
  floorId   String
  label     String
  x         Float    ← posisi di drawing (0-1)
  y         Float    ← posisi di drawing (0-1)
  createdAt DateTime @default(now())

  floor     Floor    @relation(fields: [floorId], references: [id])
  items     BreakdownItem[]
}

model BreakdownItem {
  id        String   @id @default(cuid())
  markerId  String
  name      String
  bobot     Float    ← dalam persen (0-100)
  done      Boolean  @default(false)
  doneAt    DateTime?
  doneBy    String?

  marker    Marker   @relation(fields: [markerId], references: [id])
}
```

---

## Navigation

```
Login
  └── Dashboard (chart overview)
        Sidebar:
        ├── Project List
        │     └── Project Detail
        │           ├── Timeline   ← jadwal, gantt, planned vs actual
        │           ├── Progress   ← drawing, marker, breakdown, checklist
        │           ├── Cost
        │           ├── Inventory  ← coming soon
        │           ├── Absen      ← coming soon
        │           └── Data Pekerja
        ├── User Management
        └── Setting
```

---

## Role & Akses

| Fitur | Admin | PM | SM | Leader |
|---|---|---|---|---|
| Buat project | ✅ | ✅ | ❌ | ❌ |
| Upload drawing | ✅ | ✅ | ❌ | ❌ |
| Plot marker | ✅ | ✅ | ❌ | ❌ |
| Isi breakdown | ✅ | ✅ | ❌ | ❌ |
| Centang progress | ❌ | ❌ | ✅ | ✅ |
| Lihat progress | ✅ | ✅ | ✅ | ✅ |
| Kelola user | ✅ | ❌ | ❌ | ❌ |

---

## Fase Development

### Fase 1 — PM Core (sekarang)
- [x] Auth (login, session, role)
- [x] Project CRUD
- [x] Floor + drawing upload
- [x] Marker plot di drawing
- [x] Breakdown item + bobot
- [x] Centang progress (Leader/SM)
- [x] Progress summary per lantai & project
- [x] Dashboard chart overview

### Fase 2 — Operations (nanti)
- [x] Cost tracking
- [ ] Inventory & Surat Jalan
- [ ] Absensi
- [ ] Data pekerja
- [ ] Notifikasi
- [ ] Blocker
