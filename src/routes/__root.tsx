import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { getAppChromeMode, PublicAppShell } from "@/app/layout";
import { Footer } from "@/app/layout/footer";
import { RootRouteError } from "@/app/errors/root-route-error";
import { RootNotFound } from "@/app/errors/root-not-found";
import { SiteSeoProvider } from "@/shared/seo";

const RootComponent = () => {
  const location = useLocation();
  const isSnapshotRoute = location.pathname.startsWith("/snapshot");
  const isProfileRoute = location.pathname.startsWith("/profile/");
  const isMultiviewRoute = location.pathname.startsWith("/multiview");
  const chromeMode = getAppChromeMode(location.pathname);

  let content;
  if (chromeMode === "none") {
    content = (
      <div
        className={
          isSnapshotRoute
            ? "min-h-screen w-full font-sans bg-background"
            : isProfileRoute
              ? "h-[100dvh] w-full font-sans overflow-hidden bg-background"
              : "h-[100dvh] w-full font-sans bg-background"
        }
      >
        <Outlet />
      </div>
    );
  } else if (chromeMode === "admin") {
    content = (
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background font-sans">
        <Outlet />
      </div>
    );
  } else {
    content = (
      <PublicAppShell>
        <Outlet />
        {!isMultiviewRoute && <Footer />}
      </PublicAppShell>
    );
  }

  return (
    <SiteSeoProvider pathname={location.pathname}>{content}</SiteSeoProvider>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootRouteError,
  notFoundComponent: RootNotFound,
});
