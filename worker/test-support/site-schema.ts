import { env, type D1Migration } from "cloudflare:test";

// Transport the exact 24 MB historical SQL without saturating the test RPC bridge.
export async function readSiteSchemaMigrations(): Promise<D1Migration[]> {
  const encoded = (env as unknown as { SITE_SCHEMA_MIGRATIONS_GZIP: string }).SITE_SCHEMA_MIGRATIONS_GZIP;
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json<D1Migration[]>();
}
