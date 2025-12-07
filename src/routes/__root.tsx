import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const Route = createRootRoute({
  component: () => (
    <div className="flex flex-col items-center h-screen w-full font-sans overflow-hidden">
      <Header />
      <Outlet />
      <Footer />
    </div>
  ),
});
