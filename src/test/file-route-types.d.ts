import type { AnyRoute } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/multiview": {
      id: "/multiview";
      path: "/multiview";
      fullPath: "/multiview";
      parentRoute: AnyRoute;
    };
  }
}
