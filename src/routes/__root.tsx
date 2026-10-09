import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "../integrations/supabase/client";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o ha sido movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error: rawError, reset }: ErrorComponentProps) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          La página no se pudo cargar
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo salió mal. Puedes intentar recargar o volver al inicio.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Riel· Donde corre nuestra operación" },
      {
        name: "description",
        content:
          "Tasko es un gestor de proyectos y tareas estilo Linear: rápido, minimalista y colaborativo.",
      },
      { name: "author", content: "Tasko" },
      { property: "og:title", content: "Riel· Donde corre nuestra operación" },
      {
        property: "og:description",
        content: "Organiza proyectos, tareas y equipos en un espacio rápido y minimalista.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Riel· Donde corre nuestra operación" },
      { name: "description", content: "Riel is a project and task management application designed for operational workflows." },
      { property: "og:description", content: "Riel is a project and task management application designed for operational workflows." },
      { name: "twitter:description", content: "Riel is a project and task management application designed for operational workflows." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7e0663e3-4693-40a9-8d70-3d6c9884dec4/id-preview-a695236a--310d0c09-7379-442d-bfc0-2277f67bc9bb.lovable.app-1780616580953.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7e0663e3-4693-40a9-8d70-3d6c9884dec4/id-preview-a695236a--310d0c09-7379-442d-bfc0-2277f67bc9bb.lovable.app-1780616580953.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

async function syncProfileFromProvider() {
  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return;
    const u = userData.user;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const providerFullName =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      null;
    const providerAvatar =
      (meta.avatar_url as string | undefined) ??
      (meta.picture as string | undefined) ??
      null;
    if (!providerFullName && !providerAvatar) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, email")
      .eq("id", u.id)
      .maybeSingle();
    if (!profile) return;

    const emailLocal = u.email ? u.email.split("@")[0] : "";
    const needsName =
      !profile.full_name ||
      profile.full_name.trim() === "" ||
      profile.full_name === emailLocal;
    const needsAvatar = !profile.avatar_url || profile.avatar_url.trim() === "";

    const patch: { full_name?: string; avatar_url?: string } = {};
    if (needsName && providerFullName) patch.full_name = providerFullName;
    if (needsAvatar && providerAvatar) patch.avatar_url = providerAvatar;
    if (!patch.full_name && !patch.avatar_url) return;

    await supabase.from("profiles").update(patch).eq("id", u.id);
  } catch {
    /* silent — cosmetic sync */
  }
}

function AuthListener() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Only invalidate on real identity changes, not on background TOKEN_REFRESHED
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        return;
      }
      // Auto-populate profile name/avatar from provider (Google) on sign-in.
      void syncProfileFromProvider();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthListener />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
