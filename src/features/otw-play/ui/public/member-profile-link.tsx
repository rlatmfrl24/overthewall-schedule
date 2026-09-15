import { Link } from "@tanstack/react-router";
import { useOtwPlayConfig } from "../../queries/use-public-catalog";

export function OtwPlayMemberProfileLink({ memberUid }: { memberUid: number }) {
  const query = useOtwPlayConfig();
  if (query.isError || !query.data?.data.publicReadEnabled || !query.data.data.navigationVisible) return null;
  return <Link to="/play/songs" search={{ member: String(memberUid) }}
    className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold hover:bg-accent focus-visible:outline-2">
    OTW Play에서 노래 듣기
  </Link>;
}
