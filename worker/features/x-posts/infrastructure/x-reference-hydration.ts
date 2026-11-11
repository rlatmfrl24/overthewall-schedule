import type {
  XLinkedPostPreviewDto,
  XReferenceHydrationResultDto,
} from "@contracts/x-posts";
import type { SiteId } from "@contracts/site-definition";
import type { XApiGatewayReceiptRequest } from "@contracts/x-activity";
import { publicationHiddenSql } from "../../content-access";
import {
  invalidateXPostMemoryCache,
  normalizeLinkedXPost,
  requestXApi,
  XApiError,
  type XApiUsageTracker,
  type XApiUser,
  type XTweetLookupResponse,
} from "./x-api";
import {
  readXReferenceBudget,
  XReferenceBudgetError,
} from "./x-reference-budget";
import {
  isXReferenceHidden,
  linkedPostKey,
  linkedUserKey,
  readStoredXPreviews,
  REFERENCE_CACHE_TTL,
} from "./x-reference-store";
import { hasXCollectionD1Room } from "./rss-d1-budget";

type Reference = {
  source_post_id: string;
  relation_type: "reply" | "quote";
  referenced_post_id: string;
  attempt_count: number;
  author_attempt_count: number;
  author_id: string | null;
  resolution_state: string;
  author_state: string;
  next_attempt_at: number | null;
  author_next_attempt_at: number | null;
  lookup: string | null;
  cached_author?: string | null;
};
type LookupOperation = "tweet_lookup" | "user_lookup";
type QuoteLookup = Pick<XApiGatewayReceiptRequest, "id" | "path"> & { operation: LookupOperation; startedAt: number };
type Options = {
  db: D1Database;
  siteId: SiteId;
  handles: string[];
  bearerToken: string;
  mode: "cached_author" | "post_only" | "link_only";
  tracker: XApiUsageTracker;
  maxRows?: number;
};
type ReferenceAuthority = { siteId: SiteId; scope: string; token: string };
const eligibleSourceSql = (siteId: SiteId, reference: string) =>
  `EXISTS(SELECT 1 FROM x_posts p WHERE p.id=${reference}.source_post_id
    AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
    AND NOT (${publicationHiddenSql("x_posts","p",siteId)}))`;
const LEASE_MS = 5 * 60_000;
const POST_RESERVATION = 25_000; // Post + up to four media resources, at conservative internal rates.
const USER_RESERVATION = 10_000;
const quoteLookupKey = (id: string) => `x:quote-lookup:v1:${id}`;
const authorLookupKey = (site: SiteId, id: string) => `x:quote-author-lookup:v1:${site}:${id}`;
const keepLookup = (code: string) => ["shared_budget_unavailable", "x_gateway_request_in_progress", "x_gateway_result_unknown", "x_gateway_identity_conflict", "preview_disabled"].includes(code);

function readQuoteLookup(value: string | null, site: SiteId): QuoteLookup | undefined {
  if (!value) return;
  const lookup = JSON.parse(value) as QuoteLookup;
  if (!lookup || typeof lookup.id !== "string" || !lookup.id.startsWith(`${site}:quote:`) || !Number.isSafeInteger(lookup.startedAt) || typeof lookup.path !== "string" ||
    !(lookup.operation === "tweet_lookup" && lookup.path?.startsWith("/tweets?ids=") ||
      lookup.operation === "user_lookup" && lookup.path?.startsWith("/users?ids="))) throw new Error("invalid_x_quote_lookup");
  return lookup;
}

function lookupIncludes(request: QuoteLookup | undefined, operation: LookupOperation, id: string) {
  return request?.operation === operation && new URLSearchParams(request.path.split("?", 2)[1]).get("ids")?.split(",").includes(id);
}

function readCachedAuthor(value: string | null | undefined, authorId: string | null) {
  if (!value || !authorId) return null;
  try {
    const { user } = JSON.parse(value) as { user?: XApiUser };
    return user?.id === authorId && typeof user.username === "string" && user.username ? user : null;
  } catch { return null; }
}
const emptyResult = (): XReferenceHydrationResultDto => ({
  scope: "quotes",
  status: "complete",
  scanned: 0,
  hydrated: 0,
  authorsResolved: 0,
  deferred: 0,
  failed: 0,
  terminal: 0,
  coalesced: 0,
  retryAt: null,
  errorCode: null,
});

export async function claimXReferenceTarget(
  db: D1Database,
  id: string,
  token: string,
  siteId: SiteId,
  timestamp = Date.now(),
  scope?: string,
) {
  const result = await db
    .prepare(
      `WITH free AS MATERIALIZED (
    SELECT NOT EXISTS(SELECT 1 FROM x_post_references WHERE referenced_post_id=? AND lease_until>?) AS available
  ) UPDATE x_post_references SET lease_token=?,lease_until=?
    WHERE referenced_post_id=? AND relation_type='quote' AND (SELECT available FROM free)=1
      AND (? IS NULL OR (source_post_id||':'||relation_type) IN (SELECT value FROM json_each(?)))
      AND ${eligibleSourceSql(siteId,"x_post_references")} RETURNING source_post_id`,
    )
    .bind(id, timestamp, token, timestamp + LEASE_MS, id, scope ?? null, scope ?? null)
    .all<{ source_post_id: string }>();
  return result.results.length > 0;
}

function prepareCacheWrite(
  db: D1Database,
  key: string,
  type: string,
  value: unknown,
  authority: ReferenceAuthority,
  targets: string[],
  lookupClaim?: { replaceId?: string },
) {
  const timestamp = Date.now();
  const postId = type === "linked_post" ? targets[0] : null;
  return db
    .prepare(
      `INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) SELECT ?,?,?,?,?
    WHERE (? IS NULL OR (NOT EXISTS(SELECT 1 FROM x_posts WHERE id=?
      AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM x_post_references WHERE referenced_post_id=? AND resolution_state='terminal')))
    AND EXISTS(SELECT 1 FROM x_post_references r WHERE r.lease_token=? AND r.lease_until>?
      AND r.referenced_post_id IN (SELECT value FROM json_each(?))
      AND (r.source_post_id||':'||r.relation_type) IN (SELECT value FROM json_each(?))
      AND ${eligibleSourceSql(authority.siteId,"r")})
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at
    ${lookupClaim ? "WHERE x_api_cache.expires_at<=? OR CASE WHEN json_valid(x_api_cache.value) THEN json_extract(x_api_cache.value,'$.id') END=?" : ""}`,
    )
    .bind(
      key,
      type,
      JSON.stringify(value),
      timestamp,
      timestamp + REFERENCE_CACHE_TTL,
      postId,
      postId,
      postId,
      authority.token,
      timestamp,
      JSON.stringify(targets),
      authority.scope,
      ...(lookupClaim ? [timestamp, lookupClaim.replaceId ?? null] : []),
    );
}

const writeCache = (...args: Parameters<typeof prepareCacheWrite>) => prepareCacheWrite(...args).run();

async function ownsTarget(db: D1Database, id: string, authority: ReferenceAuthority) {
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM x_post_references r
    WHERE referenced_post_id=? AND lease_token=? AND lease_until>?
      AND (r.source_post_id||':'||r.relation_type) IN (SELECT value FROM json_each(?))
      AND ${eligibleSourceSql(authority.siteId,"r")} LIMIT 1`,
      )
      .bind(id, authority.token, Date.now(),authority.scope)
      .first(),
  );
}

const createPreviewAttacher = (scope: string, siteId: SiteId) =>
  async function attachPreview(
    db: D1Database,
    id: string,
    token: string,
    post: XLinkedPostPreviewDto | null,
    state: "local" | "hydrated" | "terminal",
    authorId: string | null,
    authorPending: boolean,
    onlyMissingBody = false,
  ) {
    const timestamp = Date.now();
    const rows = await db
      .prepare(
        `SELECT r.source_post_id,r.relation_type,p.handle FROM x_post_references r
    JOIN x_posts p ON p.id=r.source_post_id WHERE r.referenced_post_id=? AND r.lease_token=?
    AND r.relation_type='quote' AND r.lease_until>? AND p.hidden_at IS NULL AND p.content_removed_at IS NULL AND json_valid(p.value)
    AND NOT (${publicationHiddenSql("x_posts","p",siteId)})
    AND (r.source_post_id||':'||r.relation_type) IN (SELECT value FROM json_each(?))
    AND (?=0 OR COALESCE(json_extract(p.value,'$.'||r.relation_type||'.post.id'),'')<>r.referenced_post_id)`,
      )
      .bind(id, token, timestamp, scope, onlyMissingBody ? 1 : 0)
      .all<{ source_post_id: string; relation_type: string; handle: string }>();
    if (!rows.results.length) return 0;
    const value = JSON.stringify(post);
    const statements: D1PreparedStatement[] = rows.results.map((row) => {
      const path = `$.${row.relation_type}.post`;
      return db
        .prepare(
          `UPDATE x_posts SET value=json_set(value,?,json(?)) WHERE id=?
      AND hidden_at IS NULL AND content_removed_at IS NULL AND json_valid(value)
      AND NOT (${publicationHiddenSql("x_posts","x_posts",siteId)})
      AND json_extract(value,?)=? AND COALESCE(json_extract(value,?),'null')<>?
      AND EXISTS(SELECT 1 FROM x_post_references WHERE source_post_id=x_posts.id
        AND relation_type=? AND referenced_post_id=? AND lease_token=? AND lease_until>?)
      AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM x_posts WHERE id=?
        AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL)))`,
        )
        .bind(
          path,
          value,
          row.source_post_id,
          `$.${row.relation_type}.postId`,
          id,
          path,
          value,
          row.relation_type,
          id,
          token,
          timestamp,
          post ? id : null,
          id,
        );
    });
    statements.push(
      db
        .prepare(
          `UPDATE x_post_references SET resolution_state=?,hydrated_at=?,
    next_attempt_at=NULL,last_error_code=?,author_id=?,author_state=?,author_next_attempt_at=?,
    author_last_error_code=NULL,updated_at=? WHERE referenced_post_id=? AND lease_token=? AND lease_until>?
    AND (source_post_id||':'||relation_type) IN (SELECT value FROM json_each(?))
    AND ${eligibleSourceSql(siteId,"x_post_references")}
    AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM x_posts WHERE id=? AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL)))
    RETURNING source_post_id`,
        )
        .bind(
          state,
          post ? timestamp : null,
          state === "terminal" ? "not_found_or_unavailable" : null,
          authorId,
          authorPending
            ? "pending"
            : state === "terminal"
              ? "terminal"
              : "resolved",
          authorPending ? timestamp : null,
          timestamp,
          id,
          token,
          timestamp,
          JSON.stringify(
            rows.results.map(
              (row) => `${row.source_post_id}:${row.relation_type}`,
            ),
          ),
          post ? id : null,
          id,
        ),
    );
    for (const handle of new Set(rows.results.map((row) => row.handle))) {
      statements.push(
        db
          .prepare(
            `DELETE FROM x_api_cache WHERE type='posts' AND instr(key,?)>0`,
          )
          .bind(`:${handle}:`),
      );
    }
    const committed=await db.batch(statements);
    invalidateXPostMemoryCache();
    return committed[rows.results.length].results.length;
  };

function retryAt(code: string, attempts: number, backoff: number) {
  const timestamp = Date.now();
  if (code === "budget_exceeded" || code === "preview_budget_exceeded") {
    return (
      Date.parse(
        `${new Date(timestamp).toISOString().slice(0, 10)}T00:00:00Z`,
      ) +
      86_400_000 +
      30_000 +
      Math.floor(Math.random() * 60_000)
    );
  }
  if (code === "rate_limited") return Math.max(timestamp + 60_000, backoff);
  if (code === "x_api_401" || code === "x_api_403" || code === "x_api_400")
    return timestamp + 6 * 3_600_000;
  return (
    timestamp +
    Math.min(6 * 3_600_000, 30 * 60_000 * 2 ** Math.min(attempts, 4))
  );
}

function providerCode(error: unknown): string {
  if (error instanceof XReferenceBudgetError) {
    if (error.code === "budget_unavailable") throw error;
    return error.code;
  }
  if (error instanceof XApiError) {
    if (error.code === "budget_unavailable") throw error;
    return error.code ?? `x_api_${error.status}`;
  }
  // fetch/JSON failures only; database failures are never passed through here.
  return "upstream_unavailable";
}

export async function hydrateXReferences(
  options: Options,
): Promise<XReferenceHydrationResultDto & { remainingDue?: boolean; retrySelection?: boolean }> {
  const { db, siteId, handles, bearerToken, mode, tracker } = options;
  const result = emptyResult();
  if (!handles.length) return result;
  const timestamp = Date.now();
  const gateway = tracker.gateway;
  const durableLookup = Boolean(gateway?.readReceipt);
  const canPair = options.maxRows === 1 && mode === "cached_author";
  const scanLimit = options.maxRows === undefined ? 100 : canPair ? 3 : options.maxRows + 1;
  const dueBranches = [
    ["x_quote_body_work work INDEXED BY idx_x_quote_body_work_due CROSS JOIN x_post_references r ON r.source_post_id=work.source_post_id AND r.relation_type='quote'", "work.due_at<=?", true],
    ["x_post_references r INDEXED BY idx_x_post_references_author_due", "r.author_state='pending' AND r.author_next_attempt_at IS NULL", false],
    ["x_post_references r INDEXED BY idx_x_post_references_author_due", "r.author_state='pending' AND r.author_next_attempt_at<=?", true],
  ] as const;
  // Separate NULL/range searches keep future retries and completed history out of the read set.
  const rows = await db
    .prepare(
      `WITH ${dueBranches.map(([from, condition], i) => `due_${i} AS (
        SELECT r.source_post_id,r.relation_type FROM ${from}
        CROSS JOIN x_posts p ON p.id=r.source_post_id
        WHERE r.relation_type='quote' AND p.handle IN (${handles.map(() => "?").join(",")})
          AND p.hidden_at IS NULL AND p.content_removed_at IS NULL AND json_valid(p.value)
          AND NOT (${publicationHiddenSql("x_posts","p",siteId)})
          AND ${condition}
        ORDER BY COALESCE(r.next_attempt_at,r.author_next_attempt_at,0),r.created_at,r.source_post_id LIMIT ${scanLimit}
      )`).join(",")}, due AS (
        ${dueBranches.map((_, i) => `SELECT * FROM due_${i}`).join(" UNION ")}
      ) SELECT r.*,${durableLookup ? "lookup.value" : "NULL"} AS lookup ${canPair ? ",u.value AS cached_author" : ""}
      FROM due CROSS JOIN x_post_references r USING(source_post_id,relation_type)
      ${durableLookup ? "LEFT JOIN x_api_cache lookup ON lookup.key='x:quote-lookup:v1:'||r.referenced_post_id AND lookup.expires_at>?" : ""}
      ${canPair ? "LEFT JOIN x_api_cache u ON u.key='x:linked-user:v1:'||r.author_id AND u.expires_at>?" : ""}
      ORDER BY COALESCE(r.next_attempt_at,r.author_next_attempt_at,0),r.created_at,r.source_post_id LIMIT ${scanLimit}`,
    )
    .bind(...dueBranches.flatMap(([, , timed]) => [...handles, ...(timed ? [timestamp] : [])]),
      ...(durableLookup ? [timestamp] : []), ...(canPair ? [timestamp] : []))
    .all<Reference>();
  const pair = rows.results.slice(0, 2);
  const cachedOnly = canPair && pair.length === 2 && pair.every(row => row.resolution_state === "hydrated" &&
    row.author_state === "pending" && readCachedAuthor(row.cached_author, row.author_id));
  const selected = rows.results.slice(0, cachedOnly ? 2 : options.maxRows ?? 100);
  let remainingDue = rows.results.length > selected.length;
  let retrySelection = false;
  result.scanned = selected.length;
  if (!result.scanned) return options.maxRows === undefined ? result : { ...result, remainingDue };
  // Bound content writes to the selected 100 relations. Other shards resolve
  // from the shared cache on their next run, without repurchasing the Post.
  const scope=JSON.stringify(selected.map(row=>`${row.source_post_id}:${row.relation_type}`));
  const attachPreview = createPreviewAttacher(scope,siteId);
  const targets = new Map<string, Reference[]>();
  for (const row of selected) {
    const group = targets.get(row.referenced_post_id) ?? [];
    group.push(row);
    targets.set(row.referenced_post_id, group);
  }
  const token = crypto.randomUUID();
  const authority={siteId,scope,token};
  const lookupByKey = new Map(selected.map(row => [quoteLookupKey(row.referenced_post_id), readQuoteLookup(row.lookup, siteId)]));
  const claimed = new Map<string, Reference>();
  const pendingPosts: string[] = [];
  const authorPosts = new Map<
    string,
    { post: XLinkedPostPreviewDto; authorId: string }
  >();
  const previewTracker: XApiUsageTracker = {
    ...tracker,
    purpose: "reference_preview",
  };
  const beforeCalls = tracker.apiCalls;
  const beforeCost = tracker.estimatedCostMicros;
  const beforeUnique = tracker.uniqueResources;
  const beforeHits = tracker.authorCacheHits;
  const beforeMisses = tracker.authorCacheMisses;

  const lookup = async <T>(operation: LookupOperation, path: string, targets: Array<{ key: string; posts: string[] }>, saved?: QuoteLookup, estimate?: number): Promise<T> => {
    let requestId: string | undefined;
    if (saved) {
      const receipt = await gateway!.readReceipt!({ id: saved.id, operation, path: saved.path, includeReferenceResult: true })
        .catch(() => { throw new XApiError("X quote receipt unavailable", 503, { code: "shared_budget_unavailable" }); });
      if (receipt.found) {
        const stored = receipt.referenceResult;
        if (stored?.ok) return stored.body as T;
        if (stored) throw new XApiError("X quote lookup failed", stored.status, { code: stored.error });
        if (receipt.status === "redacted") throw new XApiError("X quote receipt redacted", 410, { code: "x_gateway_result_redacted" });
        if (receipt.status === "complete") throw new XApiError("X quote receipt unavailable", 503, { code: "x_gateway_result_unknown" });
        if (receipt.status === "blocked") throw new XApiError("X quote budget exceeded", 429, { code: "budget_exceeded" });
        throw new XApiError("X quote result pending", 503, { code: "x_gateway_request_in_progress" });
      }
      // The shared ledger retains at least the current and previous UTC days.
      const oldestReceiptDay = new Date(timestamp - 86_400_000).toISOString().slice(0, 10);
      if (new Date(saved.startedAt).toISOString().slice(0, 10) < oldestReceiptDay) {
        throw new XApiError("X quote result unavailable", 503, { code: "x_gateway_result_unknown" });
      }
      if (path === saved.path) requestId = saved.id;
    }
    if (durableLookup && !requestId) {
      const pending = { id: `${siteId}:quote:${crypto.randomUUID()}`, operation, path, startedAt: timestamp };
      const writes = await db.batch(targets.map(({ key, posts }) => prepareCacheWrite(db, key, "quote_lookup", pending, authority, posts,
        operation === "user_lookup" ? { replaceId: saved?.id } : undefined)))
        .catch(() => { throw new XApiError("X quote request checkpoint unavailable", 503, { code: "budget_unavailable" }); });
      for (const [index, write] of writes.entries()) if (write.meta.changes) lookupByKey.set(targets[index].key, pending);
      if (writes.some(write => !write.meta.changes)) throw new XApiError("X quote lookup claim unavailable", 503, { code: "x_gateway_request_in_progress" });
      requestId = pending.id;
    }
    return requestXApi<T>(path, bearerToken, { cacheDb: db, operation, usageTracker: previewTracker, requestId, estimatedCostMicros: estimate });
  };

  const defer = async (
    id: string,
    code: string,
    author = false,
    attempted = false,
  ) => {
    const row = claimed.get(id)!;
    const backoffRow =
      code === "rate_limited"
        ? await db
            .prepare(
              "SELECT value FROM settings WHERE key='x_api_backoff_until'",
            )
            .first<{ value: string }>()
        : null;
    const next =
      mode === "link_only" && code === "preview_disabled"
        ? timestamp + 2 * 3_600_000
        : retryAt(
            code,
            author ? row.author_attempt_count : row.attempt_count,
            Number(backoffRow?.value ?? 0),
          );
    const column = author ? "author_" : "";
    const update = db
      .prepare(
        `UPDATE x_post_references SET ${column}next_attempt_at=?,${column}last_error_code=?,
      ${column}attempt_count=${column}attempt_count+?,updated_at=? WHERE relation_type='quote' AND referenced_post_id=? AND lease_token=? AND lease_until>?
        AND ${eligibleSourceSql(siteId,"x_post_references")} RETURNING source_post_id`,
      )
      .bind(next, code, attempted ? 1 : 0, Date.now(), id, token, Date.now());
    const authorId = author ? authorPosts.get(id)?.authorId ?? row.author_id : null;
    const sharedKey = authorId ? authorLookupKey(siteId, authorId) : undefined;
    const key = sharedKey && lookupByKey.get(sharedKey) ? sharedKey : quoteLookupKey(id);
    const saved = lookupByKey.get(key);
    const updated = saved?.operation === (author ? "user_lookup" : "tweet_lookup") && !keepLookup(code)
      ? (await db.batch([update, db.prepare("DELETE FROM x_api_cache WHERE key=? AND changes()>0 AND json_extract(value,'$.id')=?")
        .bind(key, saved.id)]))[0]
      : await update.all();
    const changed = updated.results.length;
    if (!changed) return;
    result.deferred += changed;
    result.retryAt = Math.min(result.retryAt ?? next, next);
    if (
      ![
        "budget_exceeded",
        "preview_budget_exceeded",
        "preview_disabled",
      ].includes(code)
    ) {
      result.failed += changed;
      result.errorCode = code;
    } else result.errorCode ??= code;
  };

  try {
    for (const [id, references] of targets) {
      // Resource fetches are shared, but the body/author state belongs to each relation.
      const row =
        references.find((reference) => reference.author_state === "pending") ??
        references[0];
      if (!(await claimXReferenceTarget(db, id, token,siteId, Date.now(), scope))) {
        result.coalesced++;
        continue;
      }
      claimed.set(id, row);
    }
    const storedPreviews = await readStoredXPreviews(db, [...claimed.keys()], Date.now(), siteId);
    for (const [id, row] of claimed) {
      const stored = storedPreviews.get(id);
      if (stored === "hidden") {
        if(await attachPreview(db, id, token, null, "terminal", null, false)) result.terminal++;
        continue;
      }
      if (stored) {
        const authorPending =
          !stored.local &&
          stored.post.username === "i" &&
          Boolean(stored.authorId ?? row.author_id);
        // Attach cached bodies only where missing while preserving author retry state
        // on relations that already have their body. Never let one author's state
        // suppress a cost-free repair of a different quote of the same original.
        result.hydrated += await attachPreview(
          db,
          id,
          token,
          stored.post,
          stored.local ? "local" : "hydrated",
          stored.authorId ?? null,
          authorPending,
          authorPending,
        );
        if (authorPending)
          authorPosts.set(id, {
            post: stored.post,
            authorId: (stored.authorId ?? row.author_id)!,
          });
      } else if (row.author_state === "pending") {
        // An expired cache must not cause a second Post purchase for author-only work.
        const source = await db
          .prepare(
            `SELECT value FROM x_posts p WHERE id=? AND hidden_at IS NULL AND content_removed_at IS NULL
              AND NOT (${publicationHiddenSql("x_posts","p",siteId)})`,
          )
          .bind(row.source_post_id)
          .first<{ value: string }>();
        if (source) {
          let parsed: {
            reply?: { post?: XLinkedPostPreviewDto };
            quote?: { post?: XLinkedPostPreviewDto };
          } = {};
          try {
            parsed = JSON.parse(source.value);
          } catch {
            /* Report invalid stored content below. */
          }
          const post = parsed[row.relation_type]?.post;
          if (post?.id === id && row.author_id) {
            result.hydrated += await attachPreview(
              db,
              id,
              token,
              post,
              "hydrated",
              row.author_id,
              true,
              true,
            );
            authorPosts.set(id, { post, authorId: row.author_id });
          } else pendingPosts.push(id);
        }
      } else pendingPosts.push(id);
    }

    if (cachedOnly && pendingPosts.length) remainingDue = true;
    while (!cachedOnly && pendingPosts.length) {
      if (mode === "link_only") {
        for (const id of pendingPosts.splice(0))
          await defer(id, "preview_disabled");
        break;
      }
      const saved = pendingPosts.map(id => lookupByKey.get(quoteLookupKey(id))).find((request, index) => lookupIncludes(request, "tweet_lookup", pendingPosts[index]));
      const count = saved ? pendingPosts.length : Math.min(100, pendingPosts.length,
        Math.floor((await readXReferenceBudget(db)).remaining / POST_RESERVATION));
      if (count === 0) {
        for (const id of pendingPosts.splice(0))
          await defer(id, "preview_budget_exceeded");
        break;
      }
      const ids = saved ? pendingPosts.filter(id => lookupByKey.get(quoteLookupKey(id))?.id === saved.id) : pendingPosts.slice(0, count);
      for (const id of ids) pendingPosts.splice(pendingPosts.indexOf(id), 1);
      const eligible: string[] = [];
      for (const id of ids)
        if (await ownsTarget(db, id, authority)) eligible.push(id);
      if (!eligible.length) continue;
      const params = new URLSearchParams({
        ids: eligible.join(","),
        "tweet.fields": "author_id,created_at,public_metrics,attachments",
        expansions: "attachments.media_keys",
        "media.fields": "url,preview_image_url,type,width,height,alt_text",
      });
      let response: XTweetLookupResponse;
      const callsBefore = previewTracker.apiCalls;
      try {
        response = await lookup<XTweetLookupResponse>("tweet_lookup", `/tweets?${params}`,
          eligible.map(id => ({ key: quoteLookupKey(id), posts: [id] })), saved, eligible.length * POST_RESERVATION);
      } catch (error) {
        const code = providerCode(error);
        for (const id of eligible)
          await defer(id, code, false, previewTracker.apiCalls > callsBefore);
        continue;
      }
      const data = new Map(
        (Array.isArray(response?.data) ? response.data : []).map((post) => [
          post.id,
          post,
        ]),
      );
      const media = new Map(
        (Array.isArray(response?.includes?.media)
          ? response.includes.media
          : []
        ).map((item) => [item.media_key, item]),
      );
      for (const id of eligible) {
        if (!(await ownsTarget(db, id, authority))) continue;
        const raw = data.get(id);
        if (!raw || typeof raw.text !== "string") {
          const unavailable =
            Array.isArray(response?.errors) &&
            response.errors.some(
              (error) =>
                (error.resource_id ?? error.value) === id &&
                /\/(resource-not-found|not-authorized-for-resource)$/.test(
                  error.type ?? "",
                ),
            );
          if (unavailable) {
            if(await attachPreview(db, id, token, null, "terminal", null, false)) result.terminal++;
          } else await defer(id, "invalid_response", false, true);
          continue;
        }
        if (await isXReferenceHidden(db, id,siteId)) continue;
        if (previewTracker.apiCalls > callsBefore) await db
          .prepare(
            `UPDATE x_post_references SET attempt_count=attempt_count+1
          WHERE referenced_post_id=? AND lease_token=? AND lease_until>?
            AND ${eligibleSourceSql(siteId,"x_post_references")}`,
          )
          .bind(id, token, Date.now())
          .run();
        const post = normalizeLinkedXPost(raw, new Map(), media)!;
        // Persist the paid Post before making any paid User request.
        await writeCache(
          db,
          linkedPostKey(id),
          "linked_post",
          {
            post,
            authorId: raw.author_id ?? null,
          },
          authority,[id],
        );
        result.hydrated += await attachPreview(
          db,
          id,
          token,
          post,
          "hydrated",
          raw.author_id ?? null,
          Boolean(raw.author_id),
        );
        if (raw.author_id)
          authorPosts.set(id, { post, authorId: raw.author_id });
      }
    }

    // A stored body can resume at the author stage without another Post lookup.
    if (options.maxRows !== undefined && mode !== "link_only" && authorPosts.size && !hasXCollectionD1Room(db, mode === "cached_author" ? 32 : 20)) {
      return { ...result, remainingDue: true };
    }
    const users = new Map<string, XApiUser | null>();
    const missingAuthors = new Set<string>();
    for (const id of authorPosts.keys()) {
      if (!(await ownsTarget(db, id, authority))) authorPosts.delete(id);
    }
    const postsByAuthor = new Map<string, string[]>();
    for (const [id, { authorId }] of authorPosts) {
      const ids = postsByAuthor.get(authorId) ?? [];
      ids.push(id);
      postsByAuthor.set(authorId, ids);
    }
    for (const authorId of postsByAuthor.keys()) {
      const userKey = linkedUserKey(authorId), lookupKey = authorLookupKey(siteId, authorId);
      const cached = await db.prepare("SELECT key,value FROM x_api_cache WHERE key IN (?,?) AND expires_at>?")
        .bind(userKey, durableLookup && !cachedOnly ? lookupKey : null, Date.now()).all<{ key: string; value: string }>();
      const user = readCachedAuthor(cached.results.find(row => row.key === userKey)?.value, authorId);
      if (user) {
        users.set(authorId, user);
        previewTracker.authorCacheHits++;
        continue;
      }
      const request = readQuoteLookup(cached.results.find(row => row.key === lookupKey)?.value ?? null, siteId);
      if (request && lookupIncludes(request, "user_lookup", authorId)) lookupByKey.set(lookupKey, request);
      missingAuthors.add(authorId);
      previewTracker.authorCacheMisses++;
    }
    const userFailures = new Map<string, string>();
    const attemptedAuthors = new Set<string>();
    const authorLookups = new Map<string, QuoteLookup>();
    for (const [id, { authorId }] of authorPosts) {
      const request = lookupByKey.get(authorLookupKey(siteId, authorId)) ?? lookupByKey.get(quoteLookupKey(id));
      if (request && lookupIncludes(request, "user_lookup", authorId) && !authorLookups.has(authorId)) authorLookups.set(authorId, request);
    }
    if (cachedOnly && missingAuthors.size) {
      remainingDue = true;
      retrySelection = true;
    }
    while (!cachedOnly && missingAuthors.size) {
      const saved = mode === "cached_author" ? [...missingAuthors].map(id => authorLookups.get(id)).find(request => request) : undefined;
      const budget = !saved && mode === "cached_author" ? await readXReferenceBudget(db) : null;
      const candidates = saved ? [...missingAuthors].filter(id => authorLookups.get(id)?.id === saved.id) : [...missingAuthors].slice(
        0,
        Math.min(100, Math.floor((budget?.remaining ?? 0) / USER_RESERVATION)),
      );
      if (!candidates.length) {
        for (const id of missingAuthors)
          userFailures.set(
            id,
            mode === "cached_author"
              ? "preview_budget_exceeded"
              : "preview_disabled",
          );
        break;
      }
      const ids:string[]=[];
      for(const authorId of candidates) {
        missingAuthors.delete(authorId);
        for(const postId of postsByAuthor.get(authorId) ?? []) {
          if(await ownsTarget(db,postId,authority)) {ids.push(authorId);break;}
        }
      }
      if(!ids.length)continue;
      let response: {
        data?: XApiUser[];
        errors?: XTweetLookupResponse["errors"];
      };
      const callsBefore = previewTracker.apiCalls;
      try {
        response = await lookup(
          "user_lookup",
          `/users?${new URLSearchParams({ ids: ids.join(","), "user.fields": "name,username,profile_image_url,protected" })}`,
          ids.map(authorId => ({ key: authorLookupKey(siteId, authorId),
            posts: postsByAuthor.get(authorId)! })),
          saved,
        );
      } catch (error) {
        const code = providerCode(error);
        ids.forEach((id) => userFailures.set(id, code));
        continue;
      } finally {
        if (previewTracker.apiCalls > callsBefore)
          ids.forEach((id) => attemptedAuthors.add(id));
      }
      for (const id of ids) {
        const user = Array.isArray(response?.data)
          ? response.data.find((user) => user?.id === id)
          : null;
        if (!user?.username) {
          const unavailable =
            Array.isArray(response?.errors) &&
            response.errors.some(
              (error) =>
                (error.resource_id ?? error.value) === id &&
                /\/(resource-not-found|not-authorized-for-resource)$/.test(
                  error.type ?? "",
                ),
            );
          userFailures.set(
            id,
            unavailable ? "resource_unavailable" : "invalid_response",
          );
          continue;
        }
        users.set(id, user);
        await writeCache(db, linkedUserKey(id), "linked_user", { user },authority,
          postsByAuthor.get(id)!);
      }
    }
    for (const [id, entry] of authorPosts) {
      if (!(await ownsTarget(db, id, authority))) continue;
      const user = users.get(entry.authorId);
      if (userFailures.get(entry.authorId) === "resource_unavailable") {
        const attached=await attachPreview(
          db,
          id,
          token,
          null,
          "terminal",
          entry.authorId,
          false,
        );
        await db
          .prepare("DELETE FROM x_api_cache WHERE key=?")
          .bind(linkedPostKey(id))
          .run();
        if(attached)result.terminal++;
        continue;
      }
      if (!user) {
        if (cachedOnly) continue;
        await defer(
          id,
          userFailures.get(entry.authorId) ?? "invalid_response",
          true,
          attemptedAuthors.has(entry.authorId),
        );
        continue;
      }
      if (attemptedAuthors.has(entry.authorId))
        await db
          .prepare(
            `UPDATE x_post_references SET author_attempt_count=author_attempt_count+1
        WHERE referenced_post_id=? AND lease_token=? AND lease_until>?
          AND ${eligibleSourceSql(siteId,"x_post_references")}`,
          )
          .bind(id, token, Date.now())
          .run();
      if (user.protected || (await isXReferenceHidden(db, id,siteId))) {
        const attached=await attachPreview(
          db,
          id,
          token,
          null,
          "terminal",
          entry.authorId,
          false,
        );
        await db
          .prepare("DELETE FROM x_api_cache WHERE key=?")
          .bind(linkedPostKey(id))
          .run();
        if(attached)result.terminal++;
        continue;
      }
      const post = {
        ...entry.post,
        username: user.username,
        name: user.name ?? null,
        profileImageUrl: user.profile_image_url ?? null,
        url: `https://x.com/${user.username}/status/${id}`,
      };
      await writeCache(
        db,
        linkedPostKey(id),
        "linked_post",
        {
          post,
          authorId: entry.authorId,
        },
        authority,[id],
      );
      const attached=await attachPreview(
        db,
        id,
        token,
        post,
        "hydrated",
        entry.authorId,
        false,
      );
      if(attached)result.authorsResolved++;
    }
  } finally {
    await db
      .prepare(
        "UPDATE x_post_references SET lease_token=NULL,lease_until=NULL WHERE lease_token=?",
      )
      .bind(token)
      .run();
    for (const [operation, count] of [
      ["linked_user_cache_hit", previewTracker.authorCacheHits - beforeHits],
      [
        "linked_user_cache_miss",
        previewTracker.authorCacheMisses - beforeMisses,
      ],
    ] as const) {
      if (count > 0)
        await db
          .prepare(
            `INSERT INTO x_api_usage_daily(utc_day,operation,resource_type,request_count,resource_count,unique_resource_count,listed_cost_micros,conservative_cost_micros,updated_at)
        VALUES(?,?,'user',1,?,0,0,0,?) ON CONFLICT(utc_day,operation,resource_type) DO UPDATE SET
        request_count=request_count+1,resource_count=resource_count+excluded.resource_count,updated_at=excluded.updated_at`,
          )
          .bind(
            new Date().toISOString().slice(0, 10),
            operation,
            count,
            Date.now(),
          )
          .run();
    }
    tracker.apiCalls += previewTracker.apiCalls - beforeCalls;
    tracker.estimatedCostMicros +=
      previewTracker.estimatedCostMicros - beforeCost;
    tracker.uniqueResources += previewTracker.uniqueResources - beforeUnique;
    tracker.previewDeferred += result.deferred;
    tracker.authorCacheHits = previewTracker.authorCacheHits;
    tracker.authorCacheMisses = previewTracker.authorCacheMisses;
  }
  result.status = result.failed
    ? "failed"
    : result.deferred
      ? "deferred"
      : "complete";
  return { ...result, ...(options.maxRows === undefined ? {} : { remainingDue }), ...(retrySelection ? { retrySelection: true } : {}) };
}
