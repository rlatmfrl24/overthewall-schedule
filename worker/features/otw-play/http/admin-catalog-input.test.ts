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
      publicationTarget: "published",
    };
    expect(parseCreateCatalogEntry(command)).toMatchObject({
      ok: true,
      value: {
        song: { kind: "create" },
        participants: [{ subject: { kind: "member", memberUid: 1 } }],
      },
    });
    const fromVideo = parseCreateCatalogEntry({
      ...command,
      song: { kind: "from_video", title: "client-supplied title" },
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

  it("keeps classification axes separate and rejects broadcast from the MVP writer", () => {
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
      parseCreatePerformance({ ...base, participationType: "published" }),
    ).toMatchObject({ ok: false });
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
      song: { existingSongId: "song-1" },
      performance: {
        relationType: "cover",
        releaseType: "official_video",
        participationType: "solo",
        qualityStatus: "ok",
        releasedAt: null,
        participants: [
          {
            entityId: "entity-1",
            participantRole: "vocal",
            creditOrder: 0,
            creditNameSnapshot: "Singer",
          },
        ],
        source: {
          channelId: "channel-1",
          startSeconds: 0,
          sourceRole: "official",
        },
      },
      publish: true,
    });
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        song: { existingSongId: "song-1" },
        performance: { source: { channelId: "channel-1" } },
      },
    });
    if (parsed.ok) {
      expect(parsed.value.performance.source).not.toHaveProperty("youtubeUrl");
    }
  });
});
