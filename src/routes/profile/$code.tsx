import { OtwPlayMemberProfileLink } from "@/features/otw-play";
import { createFileRoute } from "@tanstack/react-router";
import { MemberProfilePage } from "@/features/members";

export const Route = createFileRoute("/profile/$code")({
  component: RouteComponent,
});

function RouteComponent() {
  const { code } = Route.useParams();
  return <MemberProfilePage code={code} renderPlayLink={memberCode => <OtwPlayMemberProfileLink code={memberCode} />} />;
}
