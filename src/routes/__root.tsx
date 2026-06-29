import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PublicAppShell } from "@/components/app-shell";
import { getAppChromeMode } from "@/components/app-navigation";
import { Footer } from "@/components/footer";

const RootComponent = () => {
  const location = useLocation();
  const isSnapshotRoute = location.pathname.startsWith("/snapshot");
  const isProfileRoute = location.pathname.startsWith("/profile/");
  const isMultiviewRoute = location.pathname.startsWith("/multiview");
  const chromeMode = getAppChromeMode(location.pathname);

  if (chromeMode === "none") {
    return (
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
  }

  if (chromeMode === "admin") {
    return (
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background font-sans">
        <Outlet />
      </div>
    );
  }

  return (
    <PublicAppShell>
      <Outlet />
      {!isMultiviewRoute && <Footer />}
    </PublicAppShell>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
