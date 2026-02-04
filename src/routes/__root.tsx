import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const RootComponent = () => {
  const location = useLocation();
  const isSnapshotRoute = location.pathname.startsWith("/snapshot");

  return (
    <div
      className={
        isSnapshotRoute
          ? "min-h-screen w-full font-sans bg-background"
          : "flex flex-col items-center h-[100dvh] w-full font-sans overflow-hidden bg-background"
      }
    >
      {!isSnapshotRoute && <Header />}
      <Outlet />
      {!isSnapshotRoute && <Footer />}
    </div>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
