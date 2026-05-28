import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/cafe")({
  beforeLoad: () => {
    throw redirect({ to: "/feed", replace: true });
  },
});
