import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Wait a bit longer before preloading on hover to avoid
    // triggering loaders on quick pointer sweeps across the sidebar.
    defaultPreloadDelay: 150,
    // Cache preloaded route matches so hovering the same Link twice
    // (very common in the sidebar tree) does not re-run loaders.
    defaultPreloadStaleTime: 30_000,
    // Router-level GC for preloaded matches — align with react-query gc.
    defaultPreloadGcTime: 5 * 60_000,
    // View Transitions can add a visible freeze on tab/route switches
    // in Chromium; we already handle skeletons and optimistic UI.
    defaultViewTransition: false,
  });

  return router;
};
