import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const Route = createRootRoute({
  component: () => (
    <div className="flex flex-col items-center min-h-screen w-full font-sans bg-background">
      <Header />
      <Outlet />
      <Footer />
    </div>
  ),
});
