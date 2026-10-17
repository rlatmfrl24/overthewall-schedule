/** OTW official music is public; other sites retain their membership policy. */
export const requiresOtwPlayMembership = (siteId: string | undefined): boolean =>
  siteId !== "otw";
