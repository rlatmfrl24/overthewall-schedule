/** Both known sites expose official music publicly; unknown sites fail closed. */
export const requiresOtwPlayMembership = (siteId: string | undefined): boolean =>
  siteId !== "otw" && siteId !== "luvdia";
