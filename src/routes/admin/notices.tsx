import { createFileRoute } from "@tanstack/react-router";
import { NoticeManager } from "@/features/admin/notice-manager";

export const Route = createFileRoute("/admin/notices")({
  component: RouteComponent,
});

function RouteComponent() {
  return <NoticeManager />;
}
