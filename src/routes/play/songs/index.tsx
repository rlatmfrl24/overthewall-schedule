import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayCatalogPage, validateOtwPlayCatalogRouteSearch } from "@/features/otw-play";

export const Route = createFileRoute("/play/songs/")({
  validateSearch: validateOtwPlayCatalogRouteSearch,
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <OtwPlayCatalogPage
      search={search}
      onSearchChange={(next, replace) => { void navigate({ search: next, replace }); }}
    />
  );
}
