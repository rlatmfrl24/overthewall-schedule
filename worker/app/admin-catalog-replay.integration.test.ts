import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { handleWorkerFetch } from './fetch';
import { clearAuthCachesForTests } from '../platform/auth';
import { readSiteSchemaMigrations } from '../test-support/site-schema';
import { siteEnv } from '../test-support/site-env';
import { meterD1 } from '../test-support/d1-meter';
import type { OtwPlayAdminCommandResponse, OtwPlayAdminCatalogDto, OtwPlayAdminCatalogEntryPreflightDto, OtwPlayAdminCatalogEntryResultDto, OtwPlayAdminCreateCatalogEntryRequest, OtwPlayAdminEntityDto, OtwPlayAdminSongDto, OtwPlayAdminChannelDto, OtwPlayAdminPerformanceDto, OtwPlayAdminProposalDto } from '@contracts/otw-play';
import type { Env } from '../platform/types';
const db = (env as unknown as Env).otw_db;
const origin = 'http://localhost:5173';
const channel = 'UC' + 'R'.repeat(22), video = 'REVIEW00001';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
let jwk: JsonWebKey, keys: CryptoKeyPair;
beforeAll(async () => {
    for (const migration of await readSiteSchemaMigrations()) {
        if (migration.name.startsWith('0030_'))
            await db.batch(['kurenai_natsuki', 'terri_nunna', 'bing_hayu', 'yang_mei', 'u_lili', 'on_haru', 'hane', 'kim_ate'].map((code, index) => db.prepare('INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)').bind(-10000 - index, code, 'migration bootstrap')));
        await applyD1Migrations(db, [migration]);
    }
    await db.batch([
        db.prepare("INSERT INTO members(uid,code,name,youtube_channel_id,is_deprecated) VALUES(900051,'replay_review','Replay review',?,0)").bind(channel),
        db.prepare("INSERT INTO settings(key,value) VALUES('youtube_api_daily_quota_units','10000') ON CONFLICT(key) DO UPDATE SET value='10000'"),
    ]);
    keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    jwk = await crypto.subtle.exportKey('jwk', keys.publicKey) as JsonWebKey;
}, 120000);
afterEach(() => { vi.unstubAllGlobals(); clearAuthCachesForTests(); });
async function fixture(site: "otw" | "luvdia" = "otw", actor = "review-admin") {
    const external: string[] = [];
    const selectedIssuer = `https://${site}.replay.clerk.invalid`;
    const input = part({ alg: "RS256", kid: "review-key" }) + "." + part({ iss: selectedIssuer, azp: origin, sub: actor, exp: Math.floor(Date.now() / 1000) + 3600 });
    const selectedBearer = input + "." + encode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input))));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        external.push(url.hostname + url.pathname);
        if (url.href === selectedIssuer + "/.well-known/jwks.json")
            return Response.json({ keys: [{ ...jwk, kid: "review-key", alg: "RS256", use: "sig" }] });
        if (url.hostname === "www.googleapis.com" && url.pathname === "/youtube/v3/videos")
            return Response.json({ items: [{ id: url.searchParams.get("id"), snippet: { channelId: channel, channelTitle: "Review channel", title: "Review video", publishedAt: "2026-10-20T00:00:00Z", liveBroadcastContent: "none" }, contentDetails: { duration: "PT4M" }, status: { privacyStatus: "public", embeddable: true, uploadStatus: "processed" } }] });
        if (url.hostname === "www.googleapis.com" && url.pathname === "/youtube/v3/channels")
            return Response.json({ items: [{ id: url.searchParams.get("id"), snippet: { title: "Review channel" } }] });
        throw new Error("Unexpected external request: " + url.hostname + url.pathname);
    }));
    const runtime = { ...env, ...siteEnv(site), SITE_PUBLIC_ORIGIN: origin, CLERK_ISSUER: selectedIssuer, CLERK_JWKS_URL: selectedIssuer + "/.well-known/jwks.json", CLERK_AUTHORIZED_PARTIES: origin, CLERK_ADMIN_IDS: "review-admin,other-admin", YOUTUBE_API_KEY: "local-fixture-only", OTW_PLAY_AI_REVIEW_ENABLED: "false" } as unknown as Env;
    const send = (method: string, path: string, body?: unknown, key?: string, database = db, token: string | null = selectedBearer) => handleWorkerFetch(new Request(origin + path, { method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { ...runtime, otw_db: database });
    const write = async <T>(method: string, path: string, body: unknown, key: string, status = 200): Promise<OtwPlayAdminCommandResponse<T>> => {
        const response = await send(method, path, body, key);
        const result = await response.json() as OtwPlayAdminCommandResponse<T>;
        expect(response.status, JSON.stringify(result)).toBe(status);
        const calls = external.length, meter = meterD1(db);
        const replay = await send(method, path, body, key, meter.db);
        expect(replay.status).toBe(status);
        expect(await replay.json()).toEqual(result);
        expect(meter.summary().rowsWritten).toBe(0);
        expect(external).toHaveLength(calls);
        return result;
    };
    const catalog = async () => (await (await send("GET", "/api/play/admin/catalog")).json() as {
        data: OtwPlayAdminCatalogDto;
    }).data;
    const entryCommand = async (videoId: string): Promise<OtwPlayAdminCreateCatalogEntryRequest> => {
        const response = await send("POST", "/api/play/admin/catalog-entries/preflight", { youtubeUrl: "https://youtu.be/" + videoId, startSeconds: 0 });
        const prepared = await response.json() as {
            data: OtwPlayAdminCatalogEntryPreflightDto;
        };
        expect(response.status, JSON.stringify(prepared)).toBe(200);
        return { expectedCatalogRevision: prepared.data.catalogRevision, youtubeUrl: "https://youtu.be/" + videoId, startSeconds: 0, endSeconds: 240,
            song: { kind: "create", title: "Review song " + videoId, isOtwOriginal: true, originalReleaseDate: null, originalReleasePrecision: "unknown", aliases: [], originalArtists: [{ subject: { kind: "member", memberUid: 900051 }, creditOrder: 0, isPrimary: true }] },
            participants: [{ subject: { kind: "member", memberUid: 900051 }, participantRole: "vocal", creditOrder: 0 }],
            channel: prepared.data.channel.catalogChannelId ? { kind: "existing", channelId: prepared.data.channel.catalogChannelId } : { kind: "recognized_member", memberUid: 900051, channelRole: "member_music" },
            relationType: "original", releaseType: "official_video", participationType: "solo", publicationTarget: "draft" };
    };
    return { send, write, catalog, entryCommand, external };
}
it('returns the original successful HTTP result after response loss and concurrent retries', async () => {
    const api = await fixture();
    const post = (path: string, body: unknown, key?: string) => api.send("POST", path, body, key);
    const command = await api.entryCommand(video);
    const key = 'review-replay-20261020';
    const first = await post('/api/play/admin/catalog-entries', command, key);
    const initial = await first.json() as OtwPlayAdminCommandResponse<OtwPlayAdminCatalogEntryResultDto>;
    expect(first.status, JSON.stringify(initial)).toBe(201);
    const id = initial.data.performance.id;
    const beforeRetry = await db.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision');
    const eventCount = await db.prepare('SELECT count(*) FROM music_catalog_events WHERE aggregate_id=?').bind(id).first('count(*)');
    // Simulate the client losing the first response: retry its original body/key.
    const replay = await post('/api/play/admin/catalog-entries', command, key);
    const replayBody = await replay.json() as OtwPlayAdminCommandResponse<OtwPlayAdminCatalogEntryResultDto>;
    expect(replay.status, JSON.stringify(replayBody)).toBe(201);
    expect(replayBody).toEqual(initial);
    expect(await db.prepare('SELECT revision FROM music_catalog_meta WHERE id=1').first('revision')).toBe(beforeRetry);
    expect(await db.prepare('SELECT count(*) FROM music_performances WHERE id=?').bind(id).first('count(*)')).toBe(1);
    expect(await db.prepare('SELECT count(*) FROM music_catalog_events WHERE aggregate_id=?').bind(id).first('count(*)')).toBe(eventCount);
    const video2 = 'REVIEW00002';
    const preflight2 = await post('/api/play/admin/catalog-entries/preflight', { youtubeUrl: 'https://youtu.be/' + video2, startSeconds: 0 });
    const prepared2 = await preflight2.json() as {
        data: OtwPlayAdminCatalogEntryPreflightDto;
    };
    expect(preflight2.status, JSON.stringify(prepared2)).toBe(200);
    const concurrent = { ...command, expectedCatalogRevision: prepared2.data.catalogRevision, youtubeUrl: 'https://youtu.be/' + video2, song: { kind: 'existing', songId: initial.data.song.id }, channel: { kind: 'existing', channelId: initial.data.channel.id } };
    const responses = await Promise.all([post('/api/play/admin/catalog-entries', concurrent, 'review-concurrent-20261020'), post('/api/play/admin/catalog-entries', concurrent, 'review-concurrent-20261020')]);
    const bodies = await Promise.all(responses.map(response => response.json())) as OtwPlayAdminCommandResponse<OtwPlayAdminCatalogEntryResultDto>[];
    const statuses = responses.map(response => response.status).sort();
    expect(statuses, JSON.stringify(bodies)).toEqual([201, 201]);
    expect(bodies[1]).toEqual(bodies[0]);
    const stored = await db.prepare("SELECT count(DISTINCT link.performance_id) n FROM music_performance_sources link JOIN music_media_sources source ON source.id=link.source_id WHERE source.external_id=?").bind(video2).first('n');
    expect(stored).toBe(1);
}, 30000);
it("binds completed keys to the actor, site, method and input before any mutation", async () => {
    const first = await fixture();
    const body = { entityKind: "person", displayName: "Key scope", slug: "key-scope" };
    const key = "review-key-scope-20261020";
    const saved = await first.write<OtwPlayAdminEntityDto>("POST", "/api/play/admin/entities", body, key, 201);
    const reordered = await first.send("POST", "/api/play/admin/entities", Object.fromEntries(Object.entries(body).reverse()), key);
    expect(reordered.status).toBe(201);
    expect(await reordered.json()).toEqual(saved);
    for (const [method, path, changed] of [
        ["POST", "/api/play/admin/entities", { ...body, displayName: "Different intent" }],
        ["PUT", "/api/play/admin/entities", body],
        ["POST", "/api/play/admin/songs", body],
    ] as const) {
        const conflict = await first.send(method, path, changed, key);
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({ error: { code: "PLAY_ADMIN_IDEMPOTENCY_CONFLICT" } });
    }
    const unauthenticated = await first.send("POST", "/api/play/admin/entities", body, key, db, null);
    expect(unauthenticated.status).toBe(401);
    const outsider = await fixture("otw", "stranger");
    expect((await outsider.send("POST", "/api/play/admin/entities", body, key)).status).toBe(403);
    const other = await fixture("otw", "other-admin");
    const otherResult = await other.write<OtwPlayAdminEntityDto>("POST", "/api/play/admin/entities", { ...body, displayName: "Other actor", slug: "other-actor" }, key, 201);
    expect(otherResult.data.id).not.toBe(saved.data.id);
    const luvdia = await fixture("luvdia");
    const siteResult = await luvdia.write<OtwPlayAdminEntityDto>("POST", "/api/play/admin/entities", { ...body, displayName: "Other site", slug: "other-site" }, key, 201);
    expect(siteResult.data.id).not.toBe(saved.data.id);
});
it("rolls back the mutation, revision, event and result together when receipt persistence fails", async () => {
    const api = await fixture(), key = "review-rollback-20261020";
    const body = { entityKind: "person", displayName: "Rollback singer", slug: "rollback-singer" };
    const before = await db.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision");
    await db.prepare(`CREATE TRIGGER fail_command_result BEFORE INSERT ON music_admin_command_results
    WHEN NEW.request_key='review-rollback-20261020' BEGIN SELECT RAISE(ABORT,'forced result failure'); END`).run();
    try {
        expect((await api.send("POST", "/api/play/admin/entities", body, key)).status).toBe(422);
        expect(await db.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first("revision")).toBe(before);
        expect(await db.prepare("SELECT count(*) n FROM music_entities WHERE slug='rollback-singer'").first("n")).toBe(0);
        expect(await db.prepare("SELECT count(*) n FROM music_admin_command_results WHERE site_id='otw' AND actor_user_id='review-admin' AND request_key=?").bind(key).first("n")).toBe(0);
    }
    finally {
        await db.prepare("DROP TRIGGER fail_command_result").run();
    }
    const created = await api.write<OtwPlayAdminEntityDto>("POST", "/api/play/admin/entities", body, key, 201);
    expect(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id=?").bind(created.data.id).first("n")).toBe(1);
});
it("keeps exact entity, song, channel and deletion results after later edits and deletion", async () => {
    const api = await fixture();
    const entityBody = { entityKind: "person", displayName: "CRUD singer", slug: "crud-singer" };
    const entityKey = "review-entity-create-20261020";
    const entity = await api.write<OtwPlayAdminEntityDto>("POST", "/api/play/admin/entities", entityBody, entityKey, 201);
    expect(entity.data).toEqual((await api.catalog()).entities.find(item => item.id === entity.data.id));
    const edited = await api.write<OtwPlayAdminEntityDto>("PUT", "/api/play/admin/entities", { ...entityBody, id: entity.data.id, displayName: "Edited singer", archived: false, expectedVersion: entity.data.version }, "review-entity-update-20261020");
    expect(edited.data).toEqual((await api.catalog()).entities.find(item => item.id === entity.data.id));
    const songBody = { title: "CRUD song", slug: "crud-song", isOtwOriginal: false, originalReleaseDate: null,
        originalReleasePrecision: "unknown", aliases: [{ alias: "Song alias", locale: "en", aliasKind: "title" }], tags: ["J-POP"],
        originalArtists: [{ entityId: entity.data.id, creditOrder: 0, isPrimary: true }] };
    const song = await api.write<OtwPlayAdminSongDto>("POST", "/api/play/admin/songs", songBody, "review-song-create-20261020", 201);
    expect(song.data).toEqual((await api.catalog()).songs.find(item => item.id === song.data.id));
    const updatedSong = await api.write<OtwPlayAdminSongDto>("PUT", "/api/play/admin/songs", { ...songBody,
        id: song.data.id, title: "Edited song", expectedVersion: song.data.version,
        originalArtists: [{ subject: { kind: "entity", entityId: entity.data.id }, creditOrder: 0, isPrimary: true }] }, "review-song-update-20261020");
    expect(updatedSong.data).toEqual((await api.catalog()).songs.find(item => item.id === song.data.id));
    const channelBody = { externalChannelId: "UC" + "S".repeat(22), displayName: "CRUD channel",
        channelRole: "project_official", entityIds: [entity.data.id] };
    const channel = await api.write<OtwPlayAdminChannelDto>("POST", "/api/play/admin/channels", channelBody, "review-channel-create-20261020", 201);
    expect(channel.data).toEqual((await api.catalog()).channels.find(item => item.id === channel.data.id));
    const updatedChannel = await api.write<OtwPlayAdminChannelDto>("PUT", "/api/play/admin/channels", { ...channelBody,
        id: channel.data.id, expectedVersion: channel.data.version, verificationStatus: "approved", active: true }, "review-channel-update-20261020");
    expect(updatedChannel.data).toEqual((await api.catalog()).channels.find(item => item.id === channel.data.id));
    const deleteKey = "review-channel-delete-20261020";
    const deleteBody = { expectedVersion: updatedChannel.data.version };
    await api.write("DELETE", `/api/play/admin/channels?id=${channel.data.id}&id=unused-id`, deleteBody, deleteKey);
    const changedTarget = await api.send("DELETE", `/api/play/admin/channels?id=unused-id&id=${channel.data.id}`, deleteBody, deleteKey);
    expect(changedTarget.status).toBe(409);
    expect(await changedTarget.json()).toMatchObject({ error: { code: "PLAY_ADMIN_IDEMPOTENCY_CONFLICT" } });
    await api.write("DELETE", "/api/play/admin/songs/" + song.data.id, { expectedVersion: updatedSong.data.version }, "review-song-delete-20261020");
    await api.write("DELETE", "/api/play/admin/entities/" + entity.data.id, { expectedVersion: edited.data.version }, "review-entity-delete-20261020");
    const replay = await api.send("POST", "/api/play/admin/entities", entityBody, entityKey);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(entity);
    expect((await api.catalog()).entities.some(item => item.id === entity.data.id)).toBe(false);
});
it("replays publication and withdrawal from their committed performance snapshot", async () => {
    const api = await fixture();
    const entry = await api.write<OtwPlayAdminCatalogEntryResultDto>("POST", "/api/play/admin/catalog-entries", await api.entryCommand("PUBLISH0001"), "review-publication-entry-20261020", 201);
    const catalog = await api.catalog();
    expect(entry.data.performance).toEqual(catalog.performances.find(item => item.id === entry.data.performance.id));
    expect(entry.data.song).toEqual(catalog.songs.find(item => item.id === entry.data.song.id));
    expect(entry.data.channel).toEqual(catalog.channels.find(item => item.id === entry.data.channel.id));
    const performanceBody = { songId: entry.data.song.id, relationType: "original", releaseType: "official_video",
        participationType: "solo", qualityStatus: "ok", releasedAt: Date.now(),
        participants: [{ entityId: entry.data.performance.participants[0].entityId, participantRole: "vocal", creditOrder: 0, creditNameSnapshot: "Replay review" }],
        sources: [{ youtubeUrl: "https://youtu.be/PERFORM0001", channelId: entry.data.channel.id,
                startSeconds: 0, endSeconds: 240, sourceRole: "official", priority: 0, isPrimary: true }] };
    const performance = await api.write<OtwPlayAdminPerformanceDto>("POST", "/api/play/admin/performances", performanceBody, "review-performance-create-20261020", 201);
    expect(performance.data).toEqual((await api.catalog()).performances.find(item => item.id === performance.data.id));
    const corrected = await api.write<OtwPlayAdminPerformanceDto>("PUT", "/api/play/admin/performances", { ...performanceBody, id: performance.data.id, expectedVersion: performance.data.version, internalNote: "Corrected note",
        participants: [{ subject: { kind: "member", memberUid: 900051 }, participantRole: "vocal", creditOrder: 0 }] }, "review-performance-update-20261020");
    expect(corrected.data.internalNote).toBe("Corrected note");
    expect(corrected.data).toEqual((await api.catalog()).performances.find(item => item.id === performance.data.id));
    const published = await api.write<OtwPlayAdminPerformanceDto>("POST", `/api/play/admin/performances/${entry.data.performance.id}/publish`, { expectedVersion: entry.data.performance.version }, "review-performance-publish-20261020");
    expect(published.data.publicationStatus).toBe("published");
    expect(published.data).toEqual((await api.catalog()).performances.find(item => item.id === published.data.id));
    const withdrawn = await api.write<OtwPlayAdminPerformanceDto>("POST", `/api/play/admin/performances/${published.data.id}/withdraw`, { expectedVersion: published.data.version }, "review-performance-withdraw-20261020");
    expect(withdrawn.data.publicationStatus).toBe("withdrawn");
    await api.write("DELETE", "/api/play/admin/performances/" + withdrawn.data.id, { expectedVersion: withdrawn.data.version }, "review-performance-delete-20261020");
});
it("persists approval and rejection snapshots with the original proposal fields", async () => {
    const api = await fixture();
    const seed = await api.write<OtwPlayAdminCatalogEntryResultDto>("POST", "/api/play/admin/catalog-entries", await api.entryCommand("PROPOS00001"), "review-proposal-seed-20261020", 201);
    for (const [id, videoId, action] of [["replay-approve", "PROPOS00002", "approve"], ["replay-reject", "PROPOS00003", "reject"]] as const) {
        const now = Date.now();
        await db.batch([
            db.prepare(`INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,
        segment_start_seconds,submitted_title,submitted_tags_json,status,version,created_at,updated_at)
        VALUES(?,'fixture-member',?,?,?,0,'Proposal title','["J-POP"]','pending_review',0,?,?)`)
                .bind(id, id + "-key", "https://youtu.be/" + videoId, videoId, now, now),
            db.prepare(`INSERT INTO music_cover_proposal_participants(proposal_id,credit_order,resolved_entity_id,submitted_name_snapshot,participant_role)
        VALUES(?,0,?,'Replay review','vocal')`).bind(id, seed.data.performance.participants[0].entityId),
            db.prepare(`INSERT INTO music_cover_proposal_original_artists(proposal_id,credit_order,resolved_entity_id,submitted_name_snapshot)
        VALUES(?,0,?,'Replay review')`).bind(id, seed.data.performance.participants[0].entityId),
        ]);
        const prepared = await api.entryCommand(videoId);
        const command = action === "approve" ? { ...prepared, song: { kind: "existing", songId: seed.data.song.id }, expectedVersion: 0, singingCreditConfirmed: true, publish: true }
            : { expectedVersion: 0, resultCode: "not_eligible", note: "Reviewed and rejected" };
        const result = await api.write<OtwPlayAdminProposalDto>("POST", `/api/play/admin/submissions/${id}/${action}`, command, `review-proposal-${action}-20261020`);
        const response = await api.send("GET", `/api/play/admin/submissions?status=${action === "approve" ? "approved" : "rejected"}`);
        const proposals = await response.json() as {
            data: OtwPlayAdminProposalDto[];
        };
        expect(response.status).toBe(200);
        expect(result.data).toEqual(proposals.data.find(item => item.id === id));
        expect(result.data.reviewedByUserId).toBe("review-admin");
        if (action === "approve") {
            const revision = proposals.data.find(item => item.id === id)?.version;
            const resultCount = await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id=?").bind(id).first("n");
            const repeated = await api.write<OtwPlayAdminProposalDto>("POST", `/api/play/admin/submissions/${id}/approve`, command, "review-proposal-approved-again-20261020");
            expect(repeated.data).toEqual(result.data);
            expect(repeated.data.version).toBe(revision);
            expect(await db.prepare("SELECT count(*) n FROM music_catalog_events WHERE aggregate_id=?").bind(id).first("n")).toBe(resultCount);
        }
    }
});
