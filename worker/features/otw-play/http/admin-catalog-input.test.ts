import { describe, expect, it } from "vitest";
import { parseCatalogEntryPreflight, parseCreateCatalogEntry, parseCreateChannel, parseApproveProposal, parseCreatePerformance, parseCreateSong, parseRejectProposal, parseUpdateChannel, parseUpdatePerformance, parseUpdateSong, } from "./admin-catalog-input";
describe("OTW Play admin input", () => {
    const createCatalogCommand = () => ({
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
    });
    it("accepts bounded preflight segments", () => {
        expect(parseCatalogEntryPreflight({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 0,
            endSeconds: 180,
        })).toMatchObject({ ok: true, value: { endSeconds: 180 } });
    });
    it("rejects a preflight end at its start", () => {
        expect(parseCatalogEntryPreflight({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 20,
            endSeconds: 20,
        })).toEqual({ ok: false, fields: { endSeconds: "invalid_segment" } });
    });
    it("rejects a negative preflight start", () => {
        expect(parseCatalogEntryPreflight({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: -1,
        })).toEqual({ ok: false, fields: { startSeconds: "invalid_segment" } });
    });
    it("rejects a fractional preflight start", () => {
        expect(parseCatalogEntryPreflight({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 0.5,
        })).toEqual({ ok: false, fields: { startSeconds: "invalid_segment" } });
    });
    it("parses the integrated catalog command and its independent tag lists", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry(command)).toMatchObject({
            ok: true,
            value: {
                registrationMode: "standard",
                song: { kind: "create", tags: ["K-POP", "보컬로이드"] },
                participants: [{ subject: { kind: "member", memberUid: 1 } }],
                performanceTags: ["어쿠스틱", "2026 버전"],
            },
        });
    });
    it("rejects an official-video singing clip", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({ ...command, relationType: "singing_clip" })).toMatchObject({ ok: false });
    });
    it("derives an original song from the video without trusting a supplied title", () => {
        const command = createCatalogCommand();
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
    });
    it("rejects deriving a cover song from its cover video", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            song: { kind: "from_video" },
            relationType: "cover",
        })).toMatchObject({ ok: false });
    });
    it("accepts a bounded medley segment as a draft", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            endSeconds: 120,
            registrationMode: "medley_segment",
            publicationTarget: "draft",
        })).toMatchObject({
            ok: true,
            value: {
                endSeconds: 120,
                registrationMode: "medley_segment",
                relationType: "cover",
                publicationTarget: "draft",
            },
        });
    });
    it("requires draft publication for a medley segment", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            endSeconds: 120,
            registrationMode: "medley_segment",
        })).toEqual({
            ok: false,
            fields: { publicationTarget: "draft_required" },
        });
    });
    it("rejects an unknown registration mode", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            endSeconds: 120,
            registrationMode: "unknown",
        })).toEqual({
            ok: false,
            fields: { registrationMode: "unsupported" },
        });
    });
    it("rejects a negative catalog segment start", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            startSeconds: -1,
        })).toEqual({
            ok: false,
            fields: { startSeconds: "invalid_segment" },
        });
    });
    it("rejects a fractional catalog segment end", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            endSeconds: 12.5,
        })).toEqual({
            ok: false,
            fields: { endSeconds: "invalid_segment" },
        });
    });
    it("rejects duplicate normalized song tags", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            song: { ...command.song, tags: ["K-POP", "k-pop"] },
        })).toMatchObject({ ok: false });
    });
    it("rejects an unsupported participant role", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            participants: [
                {
                    subject: { kind: "member", memberUid: 1 },
                    participantRole: "other",
                    creditOrder: 0,
                },
            ],
        })).toMatchObject({ ok: false });
    });
    it("rejects duplicate participants", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            participants: [command.participants[0], command.participants[0]],
        })).toMatchObject({ ok: false });
    });
    it("rejects duplicate original artists", () => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({
            ...command,
            song: {
                ...command.song,
                originalArtists: [
                    command.song.originalArtists[0],
                    { ...command.song.originalArtists[0], isPrimary: false },
                ],
            },
        })).toMatchObject({ ok: false });
    });
    it.each(["original", "cover", "singing_clip"])("normalizes broadcast relation %s to singing_clip", relationType => {
        const command = createCatalogCommand();
        expect(parseCreateCatalogEntry({ ...command, relationType, releaseType: "broadcast", publicationTarget: "draft" })).toMatchObject({ ok: true, value: { relationType: "singing_clip", releaseType: "broadcast" } });
    });
  it("accepts a complete song with a primary original artist", () => {
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
  });

  it.each([
    { condition: "no original artists", slug: "song-slug", title: "곡 제목", originalArtists: [] },
    {
      condition: "no primary original artist",
      slug: "song-without-primary",
      title: "주 가수 없는 곡",
      originalArtists: [{ entityId: "artist-1", creditOrder: 0, isPrimary: false }],
    },
  ])("rejects a song with $condition", ({ slug, title, originalArtists }) => {
    expect(
      parseCreateSong({
        slug,
        title,
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists,
      }),
    ).toEqual({ ok: false, fields: { body: "invalid_song" } });
  });

  describe("song correction", () => {
    const makeInput = () => ({
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
    });

    it("parses an external original artist and leaves omitted tags unset", () => {
      const input = makeInput();
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
    });

    it("preserves explicit tag clearing", () => {
      const input = makeInput();
      expect(parseUpdateSong({ ...input, tags: [] })).toMatchObject({
        ok: true,
        value: { tags: [] },
      });
    });

    it("rejects duplicate original artist subjects", () => {
      const input = makeInput();
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
  });

  describe("performance source classification", () => {
    const makeInput = () => ({
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
    });

    it("accepts an official video with an official source", () => {
      const base = makeInput();
      expect(parseCreatePerformance(base)).toMatchObject({ ok: true });
    });

    it("rejects a broadcast with an official source", () => {
      const base = makeInput();
      expect(
        parseCreatePerformance({ ...base, releaseType: "broadcast" }),
      ).toMatchObject({ ok: false });
    });

    it("accepts a broadcast with a clip source", () => {
      const base = makeInput();
      expect(
        parseCreatePerformance({
          ...base,
          releaseType: "broadcast",
          source: { ...base.source, sourceRole: "kirinuki" },
        }),
      ).toMatchObject({ ok: true });
    });

    it("rejects an official video with a clip source", () => {
      const base = makeInput();
      expect(
        parseCreatePerformance({
          ...base,
          source: { ...base.source, sourceRole: "kirinuki" },
        }),
      ).toMatchObject({ ok: false });
    });

    it("rejects publication status as a participation type", () => {
      const base = makeInput();
      expect(
        parseCreatePerformance({ ...base, participationType: "published" }),
      ).toMatchObject({ ok: false });
    });
  });

  describe("performance correction", () => {
    const makeInput = () => ({
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
    });

    it("parses the corrected song, tags, participants and primary source", () => {
      const input = makeInput();
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
    });

    it("rejects duplicate participant subjects", () => {
      const input = makeInput();
      expect(
        parseUpdatePerformance({
          ...input,
          participants: [input.participants[0], input.participants[0]],
        }),
      ).toEqual({ ok: false, fields: { body: "invalid_performance" } });
    });
  });

  describe("YouTube channel input", () => {
    const makeInput = () => ({
      externalChannelId: `UC${"A".repeat(22)}`,
      displayName: "Official",
      channelRole: "member_music",
      entityIds: [],
    });

    it("accepts a valid external channel ID", () => {
      const base = makeInput();
      expect(parseCreateChannel(base)).toMatchObject({ ok: true });
    });

    it("rejects a malformed external channel ID", () => {
      const base = makeInput();
      expect(
        parseCreateChannel({ ...base, externalChannelId: "not-youtube" }),
      ).toMatchObject({ ok: false });
    });

    it("rejects enabling an unapproved channel", () => {
      const base = makeInput();
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
  });

  it("accepts an internal proposal rejection code", () => {
    expect(
      parseRejectProposal({ expectedVersion: 0, resultCode: "duplicate" }),
    ).toMatchObject({ ok: true });
  });

  it("rejects a blank internal proposal rejection code", () => {
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
  describe("clip proposal approval", () => {
    const makeInput = () => ({
      expectedVersion: 0,
      expectedCatalogRevision: 1,
      song: { kind: "existing", songId: "song-1" },
      participants: [{
        subject: { kind: "entity", entityId: "entity-1" },
        participantRole: "vocal",
        creditOrder: 0,
        creditNameSnapshot: "Singer",
      }],
      channel: { kind: "existing", channelId: "channel-1" },
      releaseType: "broadcast",
      participationType: "solo",
      singingCreditConfirmed: true,
      publish: true,
      startSeconds: 1,
      endSeconds: 120,
      broadcast: { performedOn: null, dateEvidence: null, originalUrl: null, extent: "partial" },
    });

    it("accepts a bounded clip segment with broadcast metadata", () => {
      const input = makeInput();
      expect(parseApproveProposal(input)).toMatchObject({ ok: true, value: { releaseType: "broadcast", startSeconds: 1, endSeconds: 120, broadcast: input.broadcast } });
    });

    it("rejects a clip segment ending before its start", () => {
      const input = makeInput();
      expect(parseApproveProposal({ ...input, endSeconds: 0 }).ok).toBe(false);
    });
  });

});
