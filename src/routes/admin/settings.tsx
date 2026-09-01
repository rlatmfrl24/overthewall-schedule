import { createFileRoute } from "@tanstack/react-router";
import { AutoUpdateSettingsManager, type AutoUpdateTab } from "@/features/configuration";

export const Route = createFileRoute("/admin/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab === "review" || search.tab === "rejections" ||
        search.tab === "runs" || search.tab === "settings"
      ? search.tab
      : "review") as AutoUpdateTab,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <AutoUpdateSettingsManager activeTab={tab} onActiveTabChange={(nextTab) =>
    navigate({ search: { tab: nextTab } })} />;
}
