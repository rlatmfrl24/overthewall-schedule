import { describe, expect, it } from "vitest";
import {
  parseCatalogEntryPreflight,
  parseCreateCatalogEntry,
  parseCreateChannel,
  parseApproveProposal,
  parseCreatePerformance,
  parseCreateSong,
  parseRejectProposal,
  parseUpdateChannel,
  parseUpdatePerformance,
  parseUpdateSong,
} from "./admin-catalog-input";

describe("OTW Play admin input", () => {
  it("parses the workflow-first preflight and integrated catalog command", () => {
    expect(
      parseCatalogEntryPreflight({
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        startSeconds: 0,
      }),
    ).toMatchObject({ ok: true });
    const command = {
      expectedCatalogRevision: 7,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 0,
      song: {
        kind: "create",
        title: "새 곡",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        tags: ["K-POP", "보컬로이드"],
        aliases: [],
        originalArtists: [
          {
            subject: {
              kind: "new_external",
              clientKey: "artist-chip",
              displayName: "원곡 가수",
              entityKind: "person",
            },
            creditOrder: 0,
            isPrimary: true,
          },
        ],
      },
      participants: [
        {
          subject: { kind: "member", memberUid: 1 },
          participantRole: "vocal",
          creditOrder: 0,
        },
      ],
      channel: {
        kind: "recognized_member",
        memberUid: 1,
        channelRole: "member_music",
      },
      relationType: "cover",
      releaseType: "official_video",
      participationType: "solo",
      performanceTags: ["어쿠스틱", "2026 버전"],
      publicationTarget: "published",
    };
    expect(parseCreateCatalogEntry(command)).toMatchObject({
      ok: true,
      value: {
        song: { kind: "create", tags: ["K-POP", "보컬로이드"] },
        participants: [{ subject: { kind: "member", memberUid: 1 } }],
        performanceTags: ["어쿠스틱", "2026 버전"],
      },
    });
    const fromVideo = parseCreateCatalogEntry({
      ...command,
      song: { kind: "from_video", title: "client-supplied title" },
      relationType: "original",
    });
    expect(fromVideo).toMatchObject({
      ok: true,
      value: { song: { kind: "from_video" } },
    });
    if (fromVideo.ok) {
      expect(fromVideo.value.song).toEqual({ kind: "from_video" });
    }
    expect(
      parseCreateCatalogEntry({
        ...command,
        song: { kind: "from_video" },
        relationType: "cover",
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseCreateCatalogEntry({
        ...command,
        song: { ...command.song, tags: ["K-POP", "k-pop"] },
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseCreateCatalogEntry({
        ...command,
        participants: [
          {
            subject: { kind: "member", memberUid: 1 },
            participantRole: "other",
            creditOrder: 0,
          },
        ],
      }),
    ).toMatchObject({ ok: false });

    expect(
      parseCreateCatalogEntry({
        ...command,
        participants: [command.participants[0], command.participants[0]],
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseCreateCatalogEntry({
        ...command,
        song: {
          ...command.song,
          originalArtists: [
            command.song.originalArtists[0],
            { ...command.song.originalArtists[0], isPrimary: false },
          ],
        },
      }),
    ).toMatchObject({ ok: false });
  });

  it("accepts a complete MVP song and rejects missing original artists", () => {
    expect(
      parseCreateSong({
        slug: "song-slug",
        title: "곡 제목",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [{ alias: "Song Title" }],
        originalArtists: [
          { entityId: "artist-1", creditOrder: 0, isPrimary: true },
        ],
      }),
    ).toMatchObject({ ok: true });
    expect(
      parseCreateSong({
        slug: "song-slug",
        title: "곡 제목",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [],
      }),
    ).toEqual({ ok: false, fields: { body: "invalid_song" } });
    expect(
      parseCreateSong({
        slug: "song-without-primary",
        title: "주 가수 없는 곡",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [
          { entityId: "artist-1", creditOrder: 0, isPrimary: false },
        ],
      }),
    ).toEqual({ ok: false, fields: { body: "invalid_song" } });
  });

  it("parses original artist subjects for the integrated song edit", () => {
    const input = {
      id: "song-1",
      expectedVersion: 2,
      slug: "song-slug",
      title: "수정한 곡",
      isOtwOriginal: false,
      originalReleaseDate: null,
      originalReleasePrecision: "unknown",
      aliases: [],
      originalArtists: [
        {
          subject: {
            kind: "new_external",
            clientKey: "artist-chip",
            displayName: "새 원곡 가수",
            entityKind: "person",
          },
          creditOrder: 0,
          isPrimary: true,
        },
      ],
    };
    const parsed = parseUpdateSong(input);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        originalArtists: [
          { subject: { kind: "new_external", displayName: "새 원곡 가수" } },
        ],
      },
    });
    if (!parsed.ok) throw new Error("Expected the song update to parse");
    expect(parsed.value).not.toHaveProperty("tags");
    expect(parseUpdateSong({ ...input, tags: [] })).toMatchObject({
      ok: true,
      value: { tags: [] },
    });
    expect(
      parseUpdateSong({
        ...input,
        originalArtists: [
          input.originalArtists[0],
          { ...input.originalArtists[0], isPrimary: false },
        ],
      }),
    ).toEqual({ ok: false, fields: { body: "invalid_song" } });
  });

  it("keeps classification axes separate and binds broadcast to kirinuki sources", () => {
    const base = {
      songId: "song-1",
      relationType: "cover",
      releaseType: "official_video",
      participationType: "solo",
      qualityStatus: "ok",
      releasedAt: null,
      participants: [
        {
          entityId: "member-1",
          participantRole: "vocal",
          creditOrder: 0,
          creditNameSnapshot: "Member",
        },
      ],
      source: {
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        channelId: "channel-1",
        startSeconds: 0,
        sourceRole: "official",
      },
    };
    expect(parseCreatePerformance(base)).toMatchObject({ ok: true });
    expect(
      parseCreatePerformance({ ...base, releaseType: "broadcast" }),
    ).toMatchObject({ ok: false });
    expect(
      parseCreatePerformance({
        ...base,
        releaseType: "broadcast",
        source: { ...base.source, sourceRole: "kirinuki" },
      }),
    ).toMatchObject({ ok: true });
    expect(
      parseCreatePerformance({
        ...base,
        source: { ...base.source, sourceRole: "kirinuki" },
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseCreatePerformance({ ...base, participationType: "published" }),
    ).toMatchObject({ ok: false });
  });

  it("parses a full performance correction with subject-based participants", () => {
    const input = {
      id: "performance-1",
      expectedVersion: 3,
      songId: "song-2",
      relationType: "original",
      releaseType: "official_mv",
      participationType: "duet",
      qualityStatus: "needs_update",
      releasedAt: 1_786_500_000_000,
      internalNote: "corrected",
      tags: ["라이브", "듀엣 버전"],
      participants: [
        {
          subject: { kind: "member", memberUid: 1 },
          participantRole: "featured_vocal",
          creditOrder: 0,
          creditNameSnapshot: "Member",
        },
        {
          subject: {
            kind: "new_external",
            clientKey: "guest-chip",
            displayName: "Guest",
            entityKind: "person",
          },
          participantRole: "vocal",
          creditOrder: 1,
          creditNameSnapshot: "Guest",
        },
      ],
      source: {
        youtubeUrl: "https://youtu.be/ASRCBcCY_qE",
        channelId: "channel-2",
        startSeconds: 12,
        endSeconds: 170,
        sourceRole: "alternate",
      },
    };
    expect(parseUpdatePerformance(input)).toMatchObject({
      ok: true,
      value: {
        songId: "song-2",
        tags: ["라이브", "듀엣 버전"],
        participants: [
          { subject: { kind: "member", memberUid: 1 } },
          {
            subject: {
              kind: "new_external",
              clientKey: "guest-chip",
            },
          },
        ],
        sources: [{ sourceRole: "alternate", priority: 0, isPrimary: true }],
      },
    });
    expect(
      parseUpdatePerformance({
        ...input,
        participants: [input.participants[0], input.participants[0]],
      }),
    ).toEqual({ ok: false, fields: { body: "invalid_performance" } });
  });

  it("requires exact YouTube channel IDs and prevents active unapproved channels", () => {
    const base = {
      externalChannelId: `UC${"A".repeat(22)}`,
      displayName: "Official",
      channelRole: "member_music",
      entityIds: [],
    };
    expect(parseCreateChannel(base)).toMatchObject({ ok: true });
    expect(
      parseCreateChannel({ ...base, externalChannelId: "not-youtube" }),
    ).toMatchObject({ ok: false });
    expect(
      parseUpdateChannel({
        ...base,
        id: "channel-1",
        expectedVersion: 0,
        verificationStatus: "pending",
        active: true,
      }),
    ).toMatchObject({ ok: false });
  });

  it("requires a non-empty internal rejection code", () => {
    expect(
      parseRejectProposal({ expectedVersion: 0, resultCode: "duplicate" }),
    ).toMatchObject({ ok: true });
    expect(
      parseRejectProposal({ expectedVersion: 0, resultCode: " " }),
    ).toMatchObject({ ok: false });
  });

  it("parses proposal approval without accepting a client-supplied YouTube URL", () => {
    const parsed = parseApproveProposal({
      expectedVersion: 0,
      expectedCatalogRevision: 1,
      song: { kind: "existing", songId: "song-1" },
      participants: [
        {
          subject: { kind: "entity", entityId: "entity-1" },
          participantRole: "vocal",
          creditOrder: 0,
          creditNameSnapshot: "Singer",
        },
      ],
      channel: { kind: "existing", channelId: "channel-1" },
      releaseType: "official_video",
      participationType: "solo",
      performanceTags: ["피아노 편곡"],
      singingCreditConfirmed: true,
      publish: true,
    });
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        expectedCatalogRevision: 1,
        song: { kind: "existing", songId: "song-1" },
        channel: { kind: "existing", channelId: "channel-1" },
        performanceTags: ["피아노 편곡"],
      },
    });
    if (parsed.ok) expect(parsed.value).not.toHaveProperty("youtubeUrl");
  });
});
