# Wrangler local D1 transport

`wrangler@4.129.1.patch` selects an available loopback port outside the
[Fetch blocked-port list](https://fetch.spec.whatwg.org/#port-blocking) for native
local D1. OS-assigned ports can overlap this list on Windows hosts whose TCP
dynamic range starts at 1024. Remote D1 is unaffected.

The patch uses Wrangler's existing OS port allocator and Undici's blocked-port
list, with at most 32 attempts before starting D1. It avoids a shared preferred
port for parallel CLI processes and preserves migration transactions and errors.
`pnpm install --frozen-lockfile` applies it; `.gitattributes` keeps its bytes
stable on Windows. When upgrading Wrangler, check the upstream implementation
and rerun `scripts/d1-local-transport.test.ts` and both sites' validate-only CLI
before updating or removing the patch.
