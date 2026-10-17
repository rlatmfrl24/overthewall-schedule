# Temporary OTW maintenance route

This independent Worker answers OTW document and API requests without bindings,
origin requests, scripts, or database access. It does not replace the application's
deployed version or change its background operations. It never routes LuvDia.

Verify and deploy from the repository root:

```powershell
node --test scripts/maintenance/worker.test.mjs
node node_modules/wrangler/bin/wrangler.js deploy --config scripts/maintenance/wrangler.jsonc --dry-run
node node_modules/wrangler/bin/wrangler.js deploy --config scripts/maintenance/wrangler.jsonc
```

Use the repository-supported Node version. This standalone deployment intentionally
has no application build or D1 migration dependency. Do not deploy the mixed
application WIP to activate this page.

To restore service after checking readiness, remove only the zone Worker route
`otw-schedule.info/*` whose script is `otw-schedule-maintenance`. Read back the route
before removal. Keep the existing Custom Domain pointing at
`overthewall-schedule`; it continues serving as the original origin. Do not remove
the domain, change DNS, or deploy a guessed old application artifact.

Cloudflare documents this route-before-Custom-Domain behavior at:
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#interaction-with-routes
