import { MemberVodsList } from "@/features/vods/member-vods-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vods/$code")({
  component: RouteComponent,
});

function RouteComponent() {
  const { code } = Route.useParams();
  return <MemberVodsList memberCode={code} />;
}
