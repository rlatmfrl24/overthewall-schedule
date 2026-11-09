import type { AnyRoute } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/admin/collection": {
      id: "/admin/collection";
      path: "/collection";
      fullPath: "/admin/collection";
      parentRoute: AnyRoute;
    };
    "/admin/review": {
      id: "/admin/review";
      path: "/review";
      fullPath: "/admin/review";
      parentRoute: AnyRoute;
    };
    "/admin/settings": {
      id: "/admin/settings";
      path: "/settings";
      fullPath: "/admin/settings";
      parentRoute: AnyRoute;
    };
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
