import type { OtwPlayAdminCatalogDto, OtwPlayReviewItemDto } from "@contracts/otw-play";

export const createAdminCatalogFixture = (
  overrides: Partial<OtwPlayAdminCatalogDto> = {},
): OtwPlayAdminCatalogDto => ({
  revision: 7,
  readModelRevision: 7,
  songs: [],
  performances: [],
  entities: [],
  channels: [],
  ...overrides,
});

/** Current review-list wire shape, independent of the proposal detail response. */
export const createReviewItemFixture = (
  overrides: Partial<OtwPlayReviewItemDto> = {},
): OtwPlayReviewItemDto => ({
  id: "proposal-1",
  kind: "proposal",
  candidateKind: "official_video",
  sources: ["user"],
  title: "검수할 공식 커버",
  status: "pending_review",
  version: 2,
  createdAt: 1_788_000_000_000,
  channelId: null,
  candidate: null,
  ...overrides,
});
