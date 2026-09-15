import { createFileRoute, Link, notFound, redirect, useRouter } from "@tanstack/react-router";
import { fetchMemberProfile } from "@/features/members";
import { ApiError } from "@/shared/api/client";
import { Button } from "@/shared/ui/button";

export const Route = createFileRoute("/play/_catalog/members/$memberCode")({
  beforeLoad: async ({ params }) => {
    let member;
    try {
      member = await fetchMemberProfile(params.memberCode);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
    throw redirect({ to: "/play/songs", search: { member: String(member.uid) }, replace: true });
  },
  pendingComponent: () => <p role="status">멤버의 곡 검색으로 이동 중…</p>,
  notFoundComponent: () => <section><h1>멤버를 찾을 수 없습니다</h1><Link to="/play">발견으로 돌아가기</Link></section>,
  errorComponent: MemberRedirectError,
});

function MemberRedirectError() {
  const router = useRouter();
  return <section><p role="alert">멤버 정보를 불러오지 못했습니다.</p>
    <Button onClick={() => void router.invalidate()}>다시 시도</Button>
  </section>;
}
