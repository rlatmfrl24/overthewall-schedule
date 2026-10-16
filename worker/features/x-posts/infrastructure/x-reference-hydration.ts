import type {
  XLinkedPostPreviewDto,
  XReferenceHydrationResultDto,
} from "@contracts/x-posts";
import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-transition";
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
  readStoredXPreview,
  REFERENCE_CACHE_TTL,
} from "./x-reference-store";

type Reference = {
  source_post_id: string;
  relation_type: "reply" | "quote";
  referenced_post_id: string;
  attempt_count: number;
  author_attempt_count: number;
  author_id: string | null;
  author_state: string;
  next_attempt_at: number | null;
  author_next_attempt_at: number | null;
};
type Options = {
  db: D1Database;
  siteId: SiteId;
  handles: string[];
  bearerToken: string;
  mode: "cached_author" | "post_only" | "link_only";
  tracker: XApiUsageTracker;
};
type ReferenceAuthority = { siteId: SiteId; scope: string; token: string };
const eligibleSourceSql = (siteId: SiteId, reference: string) =>
  `EXISTS(SELECT 1 FROM x_posts p WHERE p.id=${reference}.source_post_id
    AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
    AND NOT (${publicationHiddenSql("x_posts","p",siteId)}))`;
const LEASE_MS = 5 * 60_000;
const POST_RESERVATION = 25_000; // Post + up to four media resources, at conservative internal rates.
const USER_RESERVATION = 10_000;
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
) {
  const result = await db
    .prepare(
      `WITH free AS MATERIALIZED (
    SELECT NOT EXISTS(SELECT 1 FROM x_post_references WHERE referenced_post_id=? AND lease_until>?) AS available
  ) UPDATE x_post_references SET lease_token=?,lease_until=?
    WHERE referenced_post_id=? AND relation_type='quote' AND (SELECT available FROM free)=1
      AND ${eligibleSourceSql(siteId,"x_post_references")} RETURNING source_post_id`,
    )
    .bind(id, timestamp, token, timestamp + LEASE_MS, id)
    .all<{ source_post_id: string }>();
  return result.results.length > 0;
}

async function writeCache(
  db: D1Database,
  key: string,
  type: string,
  value: unknown,
  authority: ReferenceAuthority,
  targets: string[],
) {
  const timestamp = Date.now();
  const postId = type === "linked_post" ? targets[0] : null;
  await db
    .prepare(
      `INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) SELECT ?,?,?,?,?
    WHERE (? IS NULL OR (NOT EXISTS(SELECT 1 FROM x_posts WHERE id=?
      AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM x_post_references WHERE referenced_post_id=? AND resolution_state='terminal')))
    AND EXISTS(SELECT 1 FROM x_post_references r WHERE r.lease_token=? AND r.lease_until>?
      AND r.referenced_post_id IN (SELECT value FROM json_each(?))
      AND (r.source_post_id||':'||r.relation_type) IN (SELECT value FROM json_each(?))
      AND ${eligibleSourceSql(authority.siteId,"r")})
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at`,
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
    )
    .run();
}

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
): Promise<XReferenceHydrationResultDto> {
  const { db, siteId, handles, bearerToken, mode, tracker } = options;
  const result = emptyResult();
  if (!handles.length) return result;
  const timestamp = Date.now();
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
        ORDER BY COALESCE(r.next_attempt_at,r.author_next_attempt_at,0),r.created_at,r.source_post_id LIMIT 100
      )`).join(",")}, due AS (
        ${dueBranches.map((_, i) => `SELECT * FROM due_${i}`).join(" UNION ")}
      ) SELECT r.* FROM due CROSS JOIN x_post_references r USING(source_post_id,relation_type)
      ORDER BY COALESCE(r.next_attempt_at,r.author_next_attempt_at,0),r.created_at,r.source_post_id LIMIT 100`,
    )
    .bind(...dueBranches.flatMap(([, , timed]) => [...handles, ...(timed ? [timestamp] : [])]))
    .all<Reference>();
  result.scanned = rows.results.length;
  if (!result.scanned) return result;
  // Bound content writes to the selected 100 relations. Other shards resolve
  // from the shared cache on their next run, without repurchasing the Post.
  const scope=JSON.stringify(rows.results.map(row=>`${row.source_post_id}:${row.relation_type}`));
  const attachPreview = createPreviewAttacher(scope,siteId);
  const targets = new Map<string, Reference[]>();
  for (const row of rows.results) {
    const group = targets.get(row.referenced_post_id) ?? [];
    group.push(row);
    targets.set(row.referenced_post_id, group);
  }
  const token = crypto.randomUUID();
  const authority={siteId,scope,token};
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
    const updated=await db
      .prepare(
        `UPDATE x_post_references SET ${column}next_attempt_at=?,${column}last_error_code=?,
      ${column}attempt_count=${column}attempt_count+?,updated_at=? WHERE relation_type='quote' AND referenced_post_id=? AND lease_token=? AND lease_until>?
        AND ${eligibleSourceSql(siteId,"x_post_references")}`,
      )
      .bind(next, code, attempted ? 1 : 0, Date.now(), id, token, Date.now())
      .run();
    if(!updated.meta.changes)return;
    result.deferred++;
    result.retryAt = Math.min(result.retryAt ?? next, next);
    if (
      ![
        "budget_exceeded",
        "preview_budget_exceeded",
        "preview_disabled",
      ].includes(code)
    ) {
      result.failed++;
      result.errorCode = code;
    } else result.errorCode ??= code;
  };

  try {
    for (const [id, references] of targets) {
      // Resource fetches are shared, but the body/author state belongs to each relation.
      const row =
        references.find((reference) => reference.author_state === "pending") ??
        references[0];
      if (!(await claimXReferenceTarget(db, id, token,siteId))) {
        result.coalesced++;
        continue;
      }
      claimed.set(id, row);
      if (await isXReferenceHidden(db, id,siteId)) {
        if(await attachPreview(db, id, token, null, "terminal", null, false)) result.terminal++;
        continue;
      }
      const stored = await readStoredXPreview(db, id,Date.now(),siteId);
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

    while (pendingPosts.length) {
      if (mode === "link_only") {
        for (const id of pendingPosts.splice(0))
          await defer(id, "preview_disabled");
        break;
      }
      const budget = await readXReferenceBudget(db);
      const count = Math.min(
        100,
        pendingPosts.length,
        Math.floor(budget.remaining / POST_RESERVATION),
      );
      if (count === 0) {
        for (const id of pendingPosts.splice(0))
          await defer(id, "preview_budget_exceeded");
        break;
      }
      const ids = pendingPosts.splice(0, count);
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
        response = await requestXApi<XTweetLookupResponse>(
          `/tweets?${params}`,
          bearerToken,
          {
            cacheDb: db,
            operation: "tweet_lookup",
            usageTracker: previewTracker,
            estimatedCostMicros: eligible.length * POST_RESERVATION,
          },
        );
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
        await db
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

    const users = new Map<string, XApiUser | null>();
    const missingAuthors = new Set<string>();
    for (const id of authorPosts.keys()) {
      if (!(await ownsTarget(db, id, authority))) authorPosts.delete(id);
    }
    for (const { authorId } of authorPosts.values()) {
      if (users.has(authorId) || missingAuthors.has(authorId)) continue;
      const cached = await db
        .prepare("SELECT value FROM x_api_cache WHERE key=? AND expires_at>?")
        .bind(linkedUserKey(authorId), Date.now())
        .first<{ value: string }>();
      if (cached) {
        let value: { user?: XApiUser } = {};
        try {
          value = JSON.parse(cached.value);
        } catch {
          /* A corrupt cache is a miss, not a deleted user. */
        }
        if (value?.user?.id === authorId && value.user.username) {
          users.set(authorId, value.user);
          previewTracker.authorCacheHits++;
          continue;
        }
      }
      missingAuthors.add(authorId);
      previewTracker.authorCacheMisses++;
    }
    const userFailures = new Map<string, string>();
    const attemptedAuthors = new Set<string>();
    while (missingAuthors.size) {
      const budget =
        mode === "cached_author" ? await readXReferenceBudget(db) : null;
      const candidates = [...missingAuthors].slice(
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
        for(const [postId,entry] of authorPosts) {
          if(entry.authorId===authorId && await ownsTarget(db,postId,authority)) {ids.push(authorId);break;}
        }
      }
      if(!ids.length)continue;
      let response: {
        data?: XApiUser[];
        errors?: XTweetLookupResponse["errors"];
      };
      const callsBefore = previewTracker.apiCalls;
      try {
        response = await requestXApi(
          `/users?${new URLSearchParams({ ids: ids.join(","), "user.fields": "name,username,profile_image_url,protected" })}`,
          bearerToken,
          {
            cacheDb: db,
            operation: "user_lookup",
            usageTracker: previewTracker,
          },
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
          [...authorPosts].filter(([,entry])=>entry.authorId===id).map(([postId])=>postId));
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
  return result;
}
