---
description: Deploy Cloudflare Worker to production
---

1. Run linting to check for errors.
   // turbo
   pnpm lint
2. Perform type checking.
   // turbo
   pnpm tsc --noEmit
3. Deploy the worker to Cloudflare (Production).
   // turbo
   pnpm run deploy
