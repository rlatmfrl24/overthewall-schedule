# Drizzle Workflow

The canonical Drizzle and D1 migration workflow lives in:

```text
.agent/rules/drizzle-workflow.md
```

This file remains only as a compatibility pointer for older links. Update the
canonical `.agent` rule first, then run:

```bash
pnpm sync:agent-cursor
pnpm sync:agent-cursor:check
```
