---
description: Project Context & Technology Stack for OTW Schedule
alwaysApply: true
---

# Project Context: OTW Schedule

This file documents the technology stack and high-level architectural decisions for the `overthewall-schedule` project.

## 1. Technology Stack

### Frontend
- **Framework**: [React 19](https://react.dev)
- **Build Tool**: [Vite](https://vitejs.dev)
- **Routing**: [TanStack Router](https://tanstack.com/router) (File-based routing in `src/routes`)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (using standard utility classes)
- **UI Components**: `shadcn/ui` (Radix UI + Tailwind) in `src/components/ui`
- **Icons**: `lucide-react`

### Backend / Edge
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)

## 2. Key Directories
- `src/routes`: Application routes (TanStack Router)
- `src/components`: Reusable UI components
- `src/features`: Domain-specific components
- `src/lib/api`: API client functions (using `apiFetch`)
- `src/db`: Drizzle schema (`schema.ts`) and relations
- `worker`: Cloudflare Worker entry point and logic

## 3. Development Commands
- `npm run dev`: Start Vite dev server
- `npm run build`: Build frontend
- `npm run drizzle:generate:custom`: Generate empty migration file
- `npm run drizzle:migrate:local`: Apply migrations to local D1
