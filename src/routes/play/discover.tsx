import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/play/discover")({
  beforeLoad: () => {
    throw redirect({ to: "/play", replace: true });
  },
});
