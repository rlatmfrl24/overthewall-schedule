import { createFileRoute } from "@tanstack/react-router";
import { RightsPage } from "@/features/rights";

export const Route = createFileRoute("/rights")({
  component: RightsRoute,
});

function RightsRoute() {
  return <RightsPage />;
}
