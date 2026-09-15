import { createFileRoute } from "@tanstack/react-router";
import type { OtwPlaySubmissionKind } from "@contracts/otw-play";
import { OtwPlaySubmissionPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/_member/submit")({
  validateSearch: (search: Record<string, unknown>): { submissionKind?: OtwPlaySubmissionKind; edit?: string } => {
    const kind = search.submissionKind ?? search.kind;
    return {
      submissionKind: kind === "official_cover" || kind === "singing_clip" ? kind : undefined,
      edit: typeof search.edit === "string" && search.edit.trim() ? search.edit.trim() : undefined,
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { edit, submissionKind } = Route.useSearch();
  return <OtwPlaySubmissionPage editId={edit} initialKind={submissionKind} />;
}
