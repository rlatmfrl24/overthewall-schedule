import { createFileRoute } from "@tanstack/react-router";
import { OtwPlaySubmissionPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/_member/submit")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search.edit === "string" && search.edit.trim()
      ? search.edit.trim()
      : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { edit } = Route.useSearch();
  return <OtwPlaySubmissionPage editId={edit} />;
}
