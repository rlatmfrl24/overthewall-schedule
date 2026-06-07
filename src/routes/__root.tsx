import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const RootComponent = () => {
  const location = useLocation();
  const isSnapshotRoute = location.pathname.startsWith("/snapshot");
  const isProfileRoute = location.pathname.startsWith("/profile/");
  const hideAppChrome = isSnapshotRoute || isProfileRoute;

  return (
    <div
      className={
        isSnapshotRoute
          ? "min-h-screen w-full font-sans bg-background"
          : isProfileRoute
            ? "h-[100dvh] w-full font-sans overflow-hidden bg-background"
          : "flex flex-col items-center h-[100dvh] w-full font-sans overflow-hidden bg-background"
      }
    >
      {!hideAppChrome && <Header />}
      <Outlet />
      {!hideAppChrome && <Footer />}
    </div>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
