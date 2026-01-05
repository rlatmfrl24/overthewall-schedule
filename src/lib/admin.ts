const ADMIN_IDS = (import.meta.env.VITE_CLERK_ADMIN_IDS ?? "")
  .split(",")
  .map((id: string) => id.trim())
  .filter(Boolean);

export const isAdminUser = (userId?: string | null) =>
  Boolean(userId && ADMIN_IDS.includes(userId));

export const getAdminIds = () => ADMIN_IDS;
