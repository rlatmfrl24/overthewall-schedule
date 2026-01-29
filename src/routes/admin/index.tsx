import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: RouteComponent,
});

function RouteComponent() {
  // 기본 페이지는 공지사항 관리로 리다이렉트
  return <Navigate to="/admin/notices" replace />;
}
