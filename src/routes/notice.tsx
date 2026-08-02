import { createFileRoute } from "@tanstack/react-router";
import { NoticePage } from "@/features/notices";

export const Route = createFileRoute("/notice")({
  validateSearch: (search: Record<string, unknown>) => {
    const noticeId = Number(search.noticeId);
    return {
      noticeId:
        Number.isInteger(noticeId) && noticeId > 0 ? noticeId : undefined,
    };
  },
  component: NoticeRoute,
});

function NoticeRoute() {
  const { noticeId } = Route.useSearch();
  return <NoticePage focusedNoticeId={noticeId} />;
}
