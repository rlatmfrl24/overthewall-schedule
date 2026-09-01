import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { ThemeProvider } from "./app/providers/theme-provider";
import { ToastProvider } from "./shared/ui/toast";
import { queryClient } from "./shared/query/query-client";

const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

const expectedClerkKeyPrefix = import.meta.env.DEV ? "pk_test_" : "pk_live_";
if (!PUBLISHABLE_KEY.startsWith(expectedClerkKeyPrefix)) {
  throw new Error(
    `Invalid Clerk environment: ${import.meta.env.DEV ? "local development" : "production"} requires a ${expectedClerkKeyPrefix.slice(0, -1)} publishable key.`,
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <ToastProvider>
          <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
            <RouterProvider router={router} />
          </ClerkProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
