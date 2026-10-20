# D1 metrics deployment checks

Run `pnpm deploy:check:d1-metrics` to check both production Workers without
building, deploying, querying D1 tables, or starting jobs. It uses the existing
Wrangler authentication and only reads account, deployment, version and binding
metadata. Deployment credentials need access to that metadata. The metrics
Secret is a runtime credential, not the credential for deploying or migrating D1.

Both `pnpm deploy` and `pnpm deploy:luvdia` perform the same check for their
selected site's generated artifact before remote D1 doctor and upload. A failure
stops deployment. Continue using these entry points in Workers Builds and manual
releases; direct `wrangler deploy` bypasses repository checks.

The check requires:

- `keep_vars: true` in the actual deployment config.
- `CLOUDFLARE_D1_TOKEN` as a remote `secret_text` binding.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` as nonempty plaintext or
  encrypted bindings on every active version and the latest uploaded version.
- Plaintext IDs and any configured ID vars matching the authenticated deployment
  account and the site's `otw_db` database. Empty config overrides and a plaintext
  token are rejected. The live D1 binding must match the artifact's database ID.

Encrypted values are intentionally unreadable: this verifies their presence and
type, not token validity, permissions or the contents of encrypted IDs. After an
authorized deployment, verify actual usage in each site's authenticated
`/admin/resources` screen. Check account usage before visiting business APIs or
admin screens, and keep Play automation paused and LuvDia AI disabled.

`--dry-run` verifies local preservation settings without contacting production.
Use the separate check command for remote verification. Do not create or rotate
Secrets, run remote migrations, or deploy merely to exercise this guard.

Cloudflare documents that
[keep-vars preserves dashboard variables and deployments preserve Secrets](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
The two sites currently use different valid layouts: OTW keeps its IDs in config
vars and its token as a Secret; LuvDia keeps all three as Secrets.
