import { describe, expect, it, vi } from "vitest";
import type {
  OtwPlayChannelVerificationStatus,
  OtwPlayProposalStatus,
} from "@contracts/otw-play";
import {
  AdminCatalogService,
  AdminCatalogServiceError,
} from "./admin-catalog-service";
import type { AdminCatalogRepository } from "./ports/admin-catalog-repository";
import type { OtwPlayYouTubeVideoMetadata } from "./ports/youtube-metadata";

const actor = { userId: "admin", displayName: "Admin", ipAddress: null };

describe("AdminCatalogService", () => {
  it("preflights and then re-verifies YouTube metadata before one integrated catalog command", async () => {
    const video = {
      videoId: "dQw4w9WgXcQ",
      channelId: `UC${"M".repeat(22)}`,
      channelTitle: "Member Channel",
      title: "Verified title",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: 123,
      availabilityStatus: "playable" as const,
    };
    const preflightCatalogEntry = vi.fn(async () => ({
      catalogRevision: 4,
      video,
      channel: {
        state: "recognized_member" as const,
        catalogChannelId: null,
        verificationStatus: null,
        active: false,
        channelRole: null,
        memberUid: 1,
      },
      duplicate: null,
    }));
    const createCatalogEntry = vi.fn(async () => ({
      data: { performance: { id: "created-performance" } },
      catalogRevision: 5,
    }));
    const readVideo = vi.fn(async () => video);
    let sequence = 0;
    const service = new AdminCatalogService(
      {
        preflightCatalogEntry,
        createCatalogEntry,
      } as unknown as AdminCatalogRepository,
      { readChannel: vi.fn(), readVideo },
      { record: vi.fn(async () => undefined) },
      () => `workflow-id-${++sequence}`,
      false,
      () => 456,
    );
    await expect(
      service.preflightCatalogEntry({
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        startSeconds: 0,
      }),
    ).resolves.toMatchObject({ catalogRevision: 4 });
    await expect(
      service.createCatalogEntry(
        {
          expectedCatalogRevision: 4,
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          startSeconds: 0,
          song: { kind: "existing", songId: "song-1" },
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
          publicationTarget: "draft",
        },
        actor,
      ),
    ).resolves.toMatchObject({ catalogRevision: 5 });

    expect(readVideo).toHaveBeenCalledTimes(2);
    expect(createCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        video,
        now: 456,
        input: expect.objectContaining({ expectedCatalogRevision: 4 }),
        ids: expect.objectContaining({
          entityIds: { "member:1": expect.any(String) },
          performanceId: expect.any(String),
        }),
      }),
    );
  });

  it("rejects source segments outside the authoritative YouTube duration", async () => {
    const video = {
      videoId: "dQw4w9WgXcQ",
      channelId: `UC${"M".repeat(22)}`,
      channelTitle: "Member Channel",
      title: "Verified title",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: 123,
      availabilityStatus: "playable" as const,
    };
    const preflightCatalogEntry = vi.fn();
    const createCatalogEntry = vi.fn();
    const service = new AdminCatalogService(
      { preflightCatalogEntry, createCatalogEntry } as unknown as AdminCatalogRepository,
      { readChannel: vi.fn(), readVideo: vi.fn(async () => video) },
      { record: vi.fn(async () => undefined) },
      () => "generated-id",
      false,
    );

    await expect(service.preflightCatalogEntry({
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 180,
    })).rejects.toMatchObject({
      code: "invalid_request",
      fields: { startSeconds: "invalid_segment" },
    });
    await expect(service.preflightCatalogEntry({
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 10,
      endSeconds: 181,
    })).rejects.toMatchObject({
      code: "invalid_request",
      fields: { endSeconds: "invalid_segment" },
    });
    await expect(service.createCatalogEntry({
      expectedCatalogRevision: 4,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 10,
      endSeconds: 181,
      song: { kind: "existing", songId: "song-1" },
      participants: [{
        subject: { kind: "member", memberUid: 1 },
        participantRole: "vocal",
        creditOrder: 0,
      }],
      channel: {
        kind: "recognized_member",
        memberUid: 1,
        channelRole: "member_music",
      },
      relationType: "cover",
      releaseType: "official_video",
      participationType: "solo",
      publicationTarget: "draft",
    }, actor)).rejects.toMatchObject({
      code: "invalid_request",
      fields: { endSeconds: "invalid_segment" },
    });
    expect(preflightCatalogEntry).not.toHaveBeenCalled();
    expect(createCatalogEntry).not.toHaveBeenCalled();
  });

  it("enforces input-only medley segment rules before catalog persistence", async () => {
    const video = {
      videoId: "dQw4w9WgXcQ",
      channelId: `UC${"M".repeat(22)}`,
      channelTitle: "Member Channel",
      title: "Verified title",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: 123,
      availabilityStatus: "playable" as const,
    };
    const createCatalogEntry = vi.fn(async () => ({
      data: { performance: { id: "medley-performance" } },
      catalogRevision: 5,
    }));
    const service = new AdminCatalogService(
      {
        preflightCatalogEntry: vi.fn(),
        createCatalogEntry,
      } as unknown as AdminCatalogRepository,
      { readChannel: vi.fn(), readVideo: vi.fn(async () => video) },
      { record: vi.fn(async () => undefined) },
      () => "generated-id",
      false,
    );
    const base = {
      expectedCatalogRevision: 4,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 30,
      endSeconds: 90,
      registrationMode: "medley_segment" as const,
      song: { kind: "existing" as const, songId: "song-1" },
      participants: [{
        subject: { kind: "member" as const, memberUid: 1 },
        participantRole: "vocal" as const,
        creditOrder: 0,
      }],
      channel: {
        kind: "recognized_member" as const,
        memberUid: 1,
        channelRole: "member_music" as const,
      },
      relationType: "cover" as const,
      releaseType: "official_video" as const,
      participationType: "solo" as const,
      publicationTarget: "draft" as const,
    };

    await expect(service.createCatalogEntry(base, actor)).resolves.toMatchObject({
      catalogRevision: 5,
    });
    expect(createCatalogEntry).toHaveBeenCalledOnce();

    for (const [override, field] of [
      [{ publicationTarget: "published" as const }, "publicationTarget"],
      [{ relationType: "original" as const }, "relationType"],
      [{ song: { kind: "from_video" as const } }, "song"],
      [{ endSeconds: undefined }, "endSeconds"],
    ] as const) {
      await expect(
        service.createCatalogEntry({ ...base, ...override }, actor),
      ).rejects.toMatchObject({
        code: "invalid_request",
        fields: { [field]: expect.any(String) },
      });
    }

    const unknownDurationService = new AdminCatalogService(
      {
        preflightCatalogEntry: vi.fn(),
        createCatalogEntry: vi.fn(),
      } as unknown as AdminCatalogRepository,
      {
        readChannel: vi.fn(),
        readVideo: vi.fn(async () => ({ ...video, durationSeconds: null })),
      },
      { record: vi.fn(async () => undefined) },
      () => "generated-id",
      false,
    );
    await expect(
      unknownDurationService.createCatalogEntry(base, actor),
    ).rejects.toMatchObject({
      code: "invalid_request",
      fields: { endSeconds: "duration_unavailable" },
    });
  });

  it("coordinates successful admin lifecycle commands and audit mirrors", async () => {
    const result = { data: { id: "resource-1" }, catalogRevision: 2 };
    const repository = {
      createEntity: vi.fn(async () => result),
      updateEntity: vi.fn(async () => result),
      deleteEntity: vi.fn(async () => result),
      createSong: vi.fn(async () => result),
      updateSong: vi.fn(async () => result),
      deleteSong: vi.fn(async () => result),
      deletePerformance: vi.fn(async () => result),
      transitionPerformance: vi.fn(async () => result),
      createChannel: vi.fn(async () => result),
      updateChannel: vi.fn(async () => result),
      deleteChannel: vi.fn(async () => result),
    } as unknown as AdminCatalogRepository;
    const audit = { record: vi.fn(async () => undefined) };
    let sequence = 0;
    const service = new AdminCatalogService(
      repository,
      {
        readChannel: vi.fn(async (channelId) => ({
          channelId,
          displayName: "Verified Channel",
        })),
        readVideo: vi.fn(),
      },
      audit,
      () => `id-${++sequence}`,
      false,
      () => 123,
    );
    const song = {
      slug: "song",
      title: "Song",
      isOtwOriginal: false,
      originalReleaseDate: null,
      originalReleasePrecision: "unknown" as const,
      aliases: [],
      originalArtists: [
        { entityId: "artist", creditOrder: 0, isPrimary: true },
      ],
    };
    const channel = {
      externalChannelId: `UC${"A".repeat(22)}`,
      displayName: "Client claim",
      channelRole: "member_music" as const,
      entityIds: [],
    };

    await service.createEntity(
      {
        entityKind: "person",
        displayName: "Singer",
        slug: "singer",
      },
      actor,
    );
    await service.updateEntity(
      {
        entityKind: "person",
        displayName: "Singer",
        slug: "singer",
        id: "entity-1",
        expectedVersion: 0,
        archived: false,
      },
      actor,
    );
    await service.deleteEntity("external-1", { expectedVersion: 0 }, actor);
    await service.createSong(song, actor);
    await service.updateSong(
      {
        ...song,
        id: "song-1",
        expectedVersion: 0,
        originalArtists: [
          {
            subject: { kind: "entity", entityId: "artist" },
            creditOrder: 0,
            isPrimary: true,
          },
        ],
      },
      actor,
    );
    await service.deletePerformance(
      "performance-draft",
      { expectedVersion: 0 },
      actor,
    );
    await service.deleteSong("song-draft", { expectedVersion: 0 }, actor);
    await service.transitionPerformance(
      "performance-1",
      { expectedVersion: 0 },
      "published",
      actor,
    );
    await service.createChannel(channel, actor);
    await service.updateChannel(
      {
        ...channel,
        id: "channel-1",
        verificationStatus: "approved",
        active: true,
        expectedVersion: 0,
      },
      actor,
    );
    await service.deleteChannel("channel-1", { expectedVersion: 1 }, actor);

    expect(repository.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Verified Channel" }),
      actor,
      expect.any(Object),
      123,
    );
    expect(repository.updateChannel).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Verified Channel" }),
      actor,
      expect.any(String),
      123,
    );
    expect(repository.deletePerformance).toHaveBeenCalledWith(
      "performance-draft",
      0,
      actor,
      expect.any(String),
      123,
    );
    expect(repository.deleteEntity).toHaveBeenCalledWith(
      "external-1",
      0,
      actor,
      expect.any(String),
      123,
    );
    expect(repository.deleteSong).toHaveBeenCalledWith(
      "song-draft",
      0,
      actor,
      expect.any(String),
      123,
    );
    expect(audit.record).toHaveBeenCalledTimes(10);
  });

  it("does not persist a video whose authoritative YouTube channel differs", async () => {
    const createPerformance = vi.fn();
    const repository = {
      readCatalog: vi.fn(async () => ({
        revision: 1,
        readModelRevision: 1,
        entities: [],
        songs: [],
        performances: [],
        channels: [
          {
            id: "channel-internal",
            provider: "youtube",
            externalChannelId: `UC${"A".repeat(22)}`,
            displayName: "Official",
            channelRole: "member_music",
            verificationStatus: "approved",
            active: true,
            entityIds: [],
            version: 0,
          },
        ],
      })),
      createPerformance,
    } as unknown as AdminCatalogRepository;
    const service = new AdminCatalogService(
      repository,
      {
        readChannel: vi.fn(),
        readVideo: vi.fn(async () => ({
          videoId: "dQw4w9WgXcQ",
          channelId: `UC${"B".repeat(22)}`,
          channelTitle: "Impostor",
          title: "Wrong",
          thumbnailUrl: null,
          durationSeconds: 10,
          publishedAt: null,
          availabilityStatus: "playable" as const,
        })),
      },
      { record: vi.fn() },
      () => "id-1",
      false,
    );
    await expect(
      service.createPerformance(
        {
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
          sources: [{
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            channelId: "channel-internal",
            startSeconds: 0,
            sourceRole: "official",
            priority: 0,
            isPrimary: true,
          }],
        },
        actor,
      ),
    ).rejects.toMatchObject({
      code: "validation_failed",
    } satisfies Partial<AdminCatalogServiceError>);
    expect(createPerformance).not.toHaveBeenCalled();
  });

  it("coordinates a full performance correction and allocates inline participant identities", async () => {
    const externalChannelId = `UC${"A".repeat(22)}`;
    const video = {
      videoId: "ASRCBcCY_qE",
      channelId: externalChannelId,
      channelTitle: "Official",
      title: "Corrected video",
      thumbnailUrl: null,
      durationSeconds: 190,
      publishedAt: 1_786_500_000_000,
      availabilityStatus: "playable" as const,
    };
    const updatePerformance = vi.fn(async () => ({
      data: { id: "performance-1" },
      catalogRevision: 8,
    }));
    const repository = {
      readCatalog: vi.fn(async () => ({
        revision: 7,
        readModelRevision: 7,
        entities: [],
        songs: [],
        performances: [],
        channels: [
          {
            id: "channel-1",
            externalChannelId,
            displayName: "Official",
          },
        ],
      })),
      updatePerformance,
    } as unknown as AdminCatalogRepository;
    let sequence = 0;
    const service = new AdminCatalogService(
      repository,
      { readChannel: vi.fn(), readVideo: vi.fn(async () => video) },
      { record: vi.fn(async () => undefined) },
      () => `generated-${++sequence}`,
      false,
      () => 123,
    );

    await expect(
      service.updatePerformance(
        {
          id: "performance-1",
          expectedVersion: 4,
          songId: "song-2",
          relationType: "original",
          releaseType: "official_mv",
          participationType: "duet",
          qualityStatus: "needs_update",
          releasedAt: video.publishedAt,
          internalNote: "corrected",
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
          sources: [{
            youtubeUrl: "https://youtu.be/ASRCBcCY_qE",
            channelId: "channel-1",
            startSeconds: 12,
            endSeconds: 170,
            sourceRole: "alternate",
            priority: 0,
            isPrimary: true,
          }],
        },
        actor,
      ),
    ).resolves.toMatchObject({ catalogRevision: 8 });
    expect(updatePerformance).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.objectContaining({ video })],
        now: 123,
        ids: {
          entityIds: {
            "member:1": expect.any(String),
            "external:guest-chip": expect.any(String),
          },
          entityEventIds: {
            "member:1": expect.any(String),
            "external:guest-chip": expect.any(String),
          },
          eventId: expect.any(String),
        },
      }),
    );
  });

  it("keeps an authoritative success when the global audit mirror fails", async () => {
    const result = { data: { id: "song-1" }, catalogRevision: 2 };
    const repository = {
      createSong: vi.fn(async () => result),
    } as unknown as AdminCatalogRepository;
    const service = new AdminCatalogService(
      repository,
      { readChannel: vi.fn(), readVideo: vi.fn() },
      {
        record: vi.fn(async () => {
          throw new Error("audit unavailable");
        }),
      },
      () => "generated-id",
      false,
    );
    await expect(
      service.createSong(
        {
          slug: "song",
          title: "Song",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          aliases: [],
          originalArtists: [
            { entityId: "artist", creditOrder: 0, isPrimary: true },
          ],
        },
        actor,
      ),
    ).resolves.toBe(result);
  });

  it("keeps success when the audit mirror throws a non-Error value", async () => {
    const result = { data: { id: "entity-1" }, catalogRevision: 2 };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new AdminCatalogService(
      {
        createEntity: vi.fn(async () => result),
      } as unknown as AdminCatalogRepository,
      { readChannel: vi.fn(), readVideo: vi.fn() },
      {
        record: vi.fn(async () => {
          throw "audit unavailable";
        }),
      },
      () => "generated-id",
      false,
      () => 123,
    );

    await expect(
      service.createEntity(
        {
          entityKind: "person",
          displayName: "Singer",
          slug: "singer",
        },
        actor,
      ),
    ).resolves.toBe(result);
    expect(warn).toHaveBeenCalledWith(
      "OTW Play global audit write failed",
      expect.objectContaining({ error: "unknown" }),
    );
    warn.mockRestore();
  });

  it("rejects non-integral versions and unverified channel metadata", async () => {
    const externalChannelId = `UC${"A".repeat(22)}`;
    const readChannel = vi.fn<
      (
        channelId: string,
      ) => Promise<{ channelId: string; displayName: string } | null>
    >();
    const repository = {
      createChannel: vi.fn(),
      updateChannel: vi.fn(),
      deleteChannel: vi.fn(),
      deleteEntity: vi.fn(),
      deleteSong: vi.fn(),
      deletePerformance: vi.fn(),
    } as unknown as AdminCatalogRepository;
    const service = new AdminCatalogService(
      repository,
      { readChannel, readVideo: vi.fn() },
      { record: vi.fn() },
      () => "generated-id",
      false,
      () => 123,
    );
    const channel = {
      externalChannelId,
      displayName: "Client claim",
      channelRole: "member_music" as const,
      entityIds: [],
    };

    await expect(
      service.deleteChannel("channel-1", { expectedVersion: 0.5 }, actor),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.deleteChannel("channel-1", { expectedVersion: -1 }, actor),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.deleteEntity("entity-1", { expectedVersion: 0.5 }, actor),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.deleteSong("song-1", { expectedVersion: 0.5 }, actor),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.deletePerformance("performance-1", { expectedVersion: -1 }, actor),
    ).rejects.toMatchObject({ code: "invalid_request" });

    readChannel.mockResolvedValueOnce(null);
    await expect(service.createChannel(channel, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
    readChannel.mockResolvedValueOnce({
      channelId: `UC${"B".repeat(22)}`,
      displayName: "Wrong channel",
    });
    await expect(service.createChannel(channel, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });

    const update = {
      ...channel,
      id: "channel-1",
      verificationStatus: "approved" as const,
      active: true,
      expectedVersion: 0,
    };
    readChannel.mockResolvedValueOnce(null);
    await expect(service.updateChannel(update, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
    readChannel.mockResolvedValueOnce({
      channelId: `UC${"B".repeat(22)}`,
      displayName: "Wrong channel",
    });
    await expect(service.updateChannel(update, actor)).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect(repository.createChannel).not.toHaveBeenCalled();
    expect(repository.updateChannel).not.toHaveBeenCalled();
    expect(repository.deleteChannel).not.toHaveBeenCalled();
    expect(repository.deleteEntity).not.toHaveBeenCalled();
    expect(repository.deleteSong).not.toHaveBeenCalled();
    expect(repository.deletePerformance).not.toHaveBeenCalled();
  });

  it("creates a verified performance and rejects missing or mismatched metadata", async () => {
    const createPerformance = vi.fn(async () => ({
      data: { id: "performance-1" },
      catalogRevision: 2,
    }));
    const channel = {
      id: "channel-1",
      provider: "youtube" as const,
      externalChannelId: `UC${"A".repeat(22)}`,
      displayName: "Official",
      channelRole: "member_music" as const,
      verificationStatus: "approved" as const,
      active: true,
      entityIds: [],
      version: 0,
    };
    const repository = {
      readCatalog: vi.fn(async () => ({
        revision: 1,
        readModelRevision: 1,
        entities: [],
        songs: [],
        performances: [],
        channels: [channel],
      })),
      createPerformance,
    } as unknown as AdminCatalogRepository;
    const readVideo = vi.fn<
      (videoId: string) => Promise<OtwPlayYouTubeVideoMetadata | null>
    >(async () => ({
      videoId: "dQw4w9WgXcQ",
      channelId: channel.externalChannelId,
      channelTitle: channel.displayName,
      title: "Song",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: null,
      availabilityStatus: "playable",
    }));
    const service = new AdminCatalogService(
      repository,
      { readChannel: vi.fn(), readVideo },
      { record: vi.fn() },
      () => "generated-id",
      false,
    );
    const input = {
      songId: "song-1",
      relationType: "cover" as const,
      releaseType: "official_video" as const,
      participationType: "solo" as const,
      qualityStatus: "ok" as const,
      releasedAt: null,
      participants: [
        {
          entityId: "member-1",
          participantRole: "vocal" as const,
          creditOrder: 0,
          creditNameSnapshot: "Member",
        },
      ],
      sources: [{
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        channelId: channel.id,
        startSeconds: 0,
        sourceRole: "official" as const,
        priority: 0,
        isPrimary: true,
      }],
    };

    await expect(
      service.createPerformance(input, actor),
    ).resolves.toMatchObject({
      catalogRevision: 2,
    });
    expect(createPerformance).toHaveBeenCalledOnce();

    readVideo.mockResolvedValueOnce(null);
    await expect(service.createPerformance(input, actor)).rejects.toMatchObject(
      {
        code: "external_service_unavailable",
      },
    );
    await expect(
      service.createPerformance(
        {
          ...input,
          sources: [{ ...input.sources[0]!, youtubeUrl: "https://example.com/video" }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("keeps proposal approval fail-closed until policy resolution", async () => {
    const repository = {
      readProposals: vi.fn(),
      approveProposal: vi.fn(),
    } as unknown as AdminCatalogRepository;
    const service = new AdminCatalogService(
      repository,
      { readChannel: vi.fn(), readVideo: vi.fn() },
      { record: vi.fn() },
      () => "id",
      false,
    );

    await expect(
      service.approveProposal(
        "proposal-1",
        {
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
          singingCreditConfirmed: true,
          publish: true,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "policy_unresolved" });
    expect(repository.readProposals).not.toHaveBeenCalled();
    expect(repository.approveProposal).not.toHaveBeenCalled();
  });

  it("validates every proposal approval boundary before the atomic repository command", async () => {
    const input = {
      expectedVersion: 0,
      expectedCatalogRevision: 1,
      song: { kind: "existing" as const, songId: "song-1" },
      participants: [
        {
          subject: { kind: "entity" as const, entityId: "entity-1" },
          participantRole: "vocal" as const,
          creditOrder: 0,
          creditNameSnapshot: "Singer",
        },
      ],
      channel: { kind: "existing" as const, channelId: "channel-1" },
      releaseType: "official_video" as const,
      participationType: "solo" as const,
      singingCreditConfirmed: true as const,
      publish: true as const,
    };
    const proposal = {
      id: "proposal-1",
      version: 0,
      status: "pending_review" as OtwPlayProposalStatus,
      approvedPerformanceId: null as string | null,
      youtubeVideoId: "dQw4w9WgXcQ",
    };
    const channel = {
      id: "channel-1",
      externalChannelId: `UC${"A".repeat(22)}`,
      verificationStatus: "approved" as OtwPlayChannelVerificationStatus,
      active: true,
      channelRole: "member_music" as const,
    };
    const video: OtwPlayYouTubeVideoMetadata = {
      videoId: proposal.youtubeVideoId,
      channelId: channel.externalChannelId,
      channelTitle: "Official",
      title: "Song",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: null,
      availabilityStatus: "playable",
    };
    const readProposals = vi.fn(async () => [proposal]);
    const readCatalog = vi.fn(async () => ({ revision: 1, channels: [channel] }));
    const approveProposal = vi.fn(async () => ({
      data: { approvedPerformanceId: "performance-1" },
      catalogRevision: 2,
    }));
    const readVideo = vi.fn<
      (videoId: string) => Promise<OtwPlayYouTubeVideoMetadata | null>
    >(async () => video);
    const audit = { record: vi.fn(async () => undefined) };
    const service = new AdminCatalogService(
      {
        readProposals,
        readCatalog,
        approveProposal,
      } as unknown as AdminCatalogRepository,
      { readChannel: vi.fn(), readVideo },
      audit,
      () => "generated-id",
      true,
      () => 123,
    );

    readProposals.mockResolvedValueOnce([]);
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "not_found" });

    readProposals.mockResolvedValueOnce([{ ...proposal, version: 1 }]);
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "stale_write" });

    readCatalog.mockResolvedValueOnce({ revision: 1, channels: [] });
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "validation_failed" });

    readCatalog.mockResolvedValueOnce({
      revision: 1,
      channels: [{ ...channel, verificationStatus: "pending" }],
    });
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "validation_failed" });

    readCatalog.mockResolvedValueOnce({
      revision: 1,
      channels: [{ ...channel, active: false }],
    });
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "validation_failed" });

    readVideo.mockResolvedValueOnce(null);
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "validation_failed" });

    readVideo.mockResolvedValueOnce({ ...video, videoId: "aaaaaaaaaaa" });
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "validation_failed" });

    readVideo.mockResolvedValueOnce({ ...video, channelId: "wrong-channel" });
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).rejects.toMatchObject({ code: "validation_failed" });

    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).resolves.toMatchObject({ catalogRevision: 2 });
    expect(approveProposal).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "otw_play.proposal.approved",
        detail: { performanceId: "performance-1" },
      }),
    );

    readProposals.mockResolvedValueOnce([{
      ...proposal,
      status: "approved",
      version: 1,
      approvedPerformanceId: "performance-1",
    }]);
    readCatalog.mockResolvedValueOnce({ revision: 2, channels: [channel] });
    await expect(
      service.approveProposal("proposal-1", input, actor),
    ).resolves.toMatchObject({
      data: { status: "approved", approvedPerformanceId: "performance-1" },
      catalogRevision: 2,
    });
    expect(approveProposal).toHaveBeenCalledOnce();
  });

  it("delegates proposal rejection", async () => {
    const rejectProposal = vi.fn(async () => ({
      data: { id: "proposal-1" },
      catalogRevision: 2,
    }));
    const repository = {
      rejectProposal,
    } as unknown as AdminCatalogRepository;
    const service = new AdminCatalogService(
      repository,
      { readChannel: vi.fn(), readVideo: vi.fn() },
      { record: vi.fn() },
      () => "event-1",
      false,
      () => 123,
    );

    await expect(
      service.rejectProposal(
        "proposal-1",
        { expectedVersion: 0, resultCode: "duplicate" },
        actor,
      ),
    ).resolves.toMatchObject({ catalogRevision: 2 });
    expect(rejectProposal).toHaveBeenCalledWith(
      "proposal-1",
      { expectedVersion: 0, resultCode: "duplicate" },
      actor,
      "event-1",
      123,
    );
  });
});
