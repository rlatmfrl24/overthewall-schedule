import type { AnyRoute } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/play/_catalog/members/$memberCode": {
      id: "/play/_catalog/members/$memberCode";
      path: "/members/$memberCode";
      fullPath: "/play/members/$memberCode";
      parentRoute: AnyRoute;
    };
    "/multiview": {
      id: "/multiview";
      path: "/multiview";
      fullPath: "/multiview";
      parentRoute: AnyRoute;
    };
  }
}
