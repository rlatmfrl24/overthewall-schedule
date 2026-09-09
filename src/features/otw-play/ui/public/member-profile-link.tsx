import { Link } from "@tanstack/react-router";
import { useOtwPlayMembers } from "../../queries/use-public-catalog";

export function OtwPlayMemberProfileLink({ code }: { code: string }) {
  const query = useOtwPlayMembers({ adminPreview: false });
  const member = !query.isError && query.data?.data.members.find(item => item.code === code && item.pageEligible);
  if (!member) return null;
  return <Link to="/play/members/$memberCode" params={{ memberCode: member.code }} search={{}}
    className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold hover:bg-accent focus-visible:outline-2">
    OTW Play에서 노래 듣기
  </Link>;
}
