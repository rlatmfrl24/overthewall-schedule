import { createFileRoute } from "@tanstack/react-router";
import { MemberPostsPage } from "@/features/member-posts";

import { Footer } from "@/app/layout/footer";

export const Route = createFileRoute("/feed")({
  component: () => <MemberPostsPage footer={<Footer />} />,
});
