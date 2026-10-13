export const SITE_COPYRIGHT_START_YEAR = 2025;
import type { SiteDefinition } from "@contracts/site-definition";

export function getSiteCopyrightNotice(
  site: SiteDefinition,
  currentYear = new Date().getFullYear(),
): string {
  const endYear = Math.max(currentYear, SITE_COPYRIGHT_START_YEAR);
  const yearRange =
    endYear === SITE_COPYRIGHT_START_YEAR
      ? String(SITE_COPYRIGHT_START_YEAR)
      : `${SITE_COPYRIGHT_START_YEAR}–${endYear}`;

  return `© ${yearRange} ${site.copyrightOwner}. All rights reserved.`;
}
