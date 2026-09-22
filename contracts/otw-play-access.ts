/** Product policy, distinct from catalog availability and navigation flags. */
export type OtwPlayCatalogAudience = "members" | "public";
export const OTW_PLAY_CATALOG_AUDIENCE: OtwPlayCatalogAudience = "members";
export const requiresOtwPlayMembership = (): boolean =>
  OTW_PLAY_CATALOG_AUDIENCE === "members";
