import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayMemberSongbookPage, validateMemberSongbookSearch } from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog/members/$memberCode")({
  validateSearch: validateMemberSongbookSearch,
  component: MemberSongbookRoute,
});

function MemberSongbookRoute() {
  const { memberCode } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return <OtwPlayMemberSongbookPage memberCode={memberCode} search={search}
    onSearchChange={next => { void navigate({ search: next }); }} />;
}
