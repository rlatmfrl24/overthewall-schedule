import { describe, expect, it, vi } from "vitest";
import type {
  OtwPlayAdminReleaseConfirmation,
  OtwPlayAdminReleaseFlagsDto,
  OtwPlayAdminReleaseTransition,
} from "@contracts/otw-play";
import type { ReleaseRepository } from "./ports/release-repository";
import { ReleaseService } from "./release-service";

const flags = (
  publicReadEnabled: boolean,
  navigationVisible: boolean,
): OtwPlayAdminReleaseFlagsDto => ({
  publicReadEnabled,
  navigationVisible,
});

const actor = { userId: "admin", displayName: "Admin", ipAddress: null };

const repositoryOf = (
  update: ReleaseRepository["update"] = vi.fn(async (command) => ({
    kind: "updated" as const,
    response: {
      data: {
        ...command.target,
        catalogRevision: 7,
        readModelRevision: 7,
        updatedAt: command.changedAt,
        readyForPublicRead: true,
      },
      transition: command.transition,
      changedAt: command.changedAt,
    },
    diagnostics: { rowsRead: 3, rowsWritten: 2 },
  })),
): ReleaseRepository => ({
  readState: vi.fn(async () => ({
    ...flags(false, false),
    catalogRevision: 7,
    readModelRevision: 7,
    updatedAt: 10,
    readyForPublicRead: true,
  })),
  readRecentChanges: vi.fn(async () => []),
  update,
});

describe("OTW Play release service", () => {
  it.each<[
    OtwPlayAdminReleaseFlagsDto,
    OtwPlayAdminReleaseFlagsDto,
    OtwPlayAdminReleaseConfirmation,
    OtwPlayAdminReleaseTransition,
  ]>([
    [flags(false, false), flags(true, false), "direct_routes_verified", "enable_public_read"],
    [flags(true, false), flags(true, true), "public_canary_verified", "enable_navigation"],
    [flags(true, true), flags(true, false), "rollback_reviewed", "disable_navigation"],
    [flags(true, false), flags(false, false), "rollback_reviewed", "rollback_all"],
    [flags(true, true), flags(false, false), "rollback_reviewed", "rollback_all"],
  ])("allows %o -> %o only with its confirmation", async (expected, target, confirmation, transition) => {
    const update = vi.fn(repositoryOf().update);
    const service = new ReleaseService(repositoryOf(update), () => "audit-1", () => 9);
    const result = await service.update(
      { expected: { ...expected, updatedAt: 10 }, target, confirmation },
      actor,
    );
    expect(result.response.transition).toBe(transition);
    expect(result.response.changedAt).toBe(11);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: { ...expected, updatedAt: 10 },
        target,
        transition,
        changedAt: 11,
        auditId: "audit-1",
      }),
    );
  });

  it.each([
    [flags(false, false), flags(true, true), "public_canary_verified"],
    [flags(false, true), flags(true, true), "public_canary_verified"],
    [flags(false, false), flags(false, true), "direct_routes_verified"],
    [flags(true, false), flags(true, false), "direct_routes_verified"],
    [flags(false, false), flags(true, false), "rollback_reviewed"],
  ] as const)("rejects invalid or mismatched transition %#", async (expected, target, confirmation) => {
    const update = vi.fn(repositoryOf().update);
    const service = new ReleaseService(repositoryOf(update));
    await expect(
      service.update(
        { expected: { ...expected, updatedAt: 10 }, target, confirmation },
        actor,
      ),
    ).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["stale", "policy_unresolved"] as const)(
    "maps repository %s outcomes to service errors",
    async (kind) => {
      const update = vi.fn(async () => ({
        kind,
        state: {
          ...flags(false, false),
          catalogRevision: 7,
          readModelRevision: kind === "policy_unresolved" ? 6 : 7,
          updatedAt: 10,
          readyForPublicRead: kind !== "policy_unresolved",
        },
        diagnostics: { rowsRead: 2, rowsWritten: 0 },
      }));
      const service = new ReleaseService(repositoryOf(update));
      await expect(
        service.update(
          {
            expected: { ...flags(false, false), updatedAt: 10 },
            target: flags(true, false),
            confirmation: "direct_routes_verified",
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: kind === "stale" ? "stale_write" : kind });
    },
  );

  it("reads the authority and at most 20 recent changes", async () => {
    const repository = repositoryOf();
    const service = new ReleaseService(repository);
    await expect(service.read()).resolves.toMatchObject({
      data: { publicReadEnabled: false, navigationVisible: false },
      recentChanges: [],
    });
    expect(repository.readRecentChanges).toHaveBeenCalledWith(20);
  });
});
