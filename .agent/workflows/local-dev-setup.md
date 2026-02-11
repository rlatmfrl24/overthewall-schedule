---
description: Setup local development environment
---

1. Install project dependencies.
   // turbo
   pnpm install
2. Generate Cloudflare Worker types.
   // turbo
   pnpm run cf-typegen
3. Apply migrations to the local D1 database.
   // turbo
   pnpm drizzle:migrate:local
4. Start the development server.
   pnpm dev
