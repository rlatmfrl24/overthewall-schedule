import { createFileRoute, redirect } from "@tanstack/react-router";
import { OtwPlayMembersPage, validateOtwPlayCatalogRouteSearch } from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog/members")({
  validateSearch: validateOtwPlayCatalogRouteSearch,
  beforeLoad: ({ search }) => {
    if (search.member && search.participantRole !== "vocal") {
      throw redirect({ to: "/play/members", search: { ...search, participantRole: "vocal" }, replace: true });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return <OtwPlayMembersPage search={search} onSearchChange={next => { void navigate({ search: next }); }} />;
}
