import { createFileRoute } from "@tanstack/react-router";
import { MemberPostSettingsManager, type MemberPostSource } from "@/features/member-posts";

export const Route = createFileRoute("/admin/member-posts")({
  validateSearch: (search: Record<string, unknown>) => ({
    source: (search.source === "naver-cafe" ? "naver-cafe" : "x") as MemberPostSource,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { source } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <MemberPostSettingsManager activeSource={source} onActiveSourceChange={(nextSource) =>
    navigate({ search: { source: nextSource } })} />;
}
