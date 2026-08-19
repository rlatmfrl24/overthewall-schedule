export const SITE_COPYRIGHT_START_YEAR = 2025;
export const SITE_COPYRIGHT_OWNER = "OTW Schedule";

export function getSiteCopyrightNotice(
  currentYear = new Date().getFullYear(),
): string {
  const endYear = Math.max(currentYear, SITE_COPYRIGHT_START_YEAR);
  const yearRange =
    endYear === SITE_COPYRIGHT_START_YEAR
      ? String(SITE_COPYRIGHT_START_YEAR)
      : `${SITE_COPYRIGHT_START_YEAR}–${endYear}`;

  return `© ${yearRange} ${SITE_COPYRIGHT_OWNER}. All rights reserved.`;
}
