import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import rielLogo from "@/assets/riel-logo.svg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Riel" },
      { name: "description", content: "Inicia sesión en Riel para gestionar tus proyectos." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || "/",
  }),
  beforeLoad: async ({ search }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: search.redirect });
  },
  component: LoginPage,
});

function friendlyAuthError(message: string): { title: string; description: string } {
  const msg = (message || "").toLowerCase();
  if (
    msg.includes("no está autorizado") ||
    msg.includes("not allowed") ||
    msg.includes("insufficient_privilege") ||
    msg.includes("database error saving new user")
  ) {
    return {
      title: "Acceso restringido",
      description: "Tu correo no está autorizado. Pide a un administrador que te invite.",
    };
  }
  return { title: "No se pudo iniciar sesión con Google", description: message };
}

function LoginPage() {
  const search = Route.useSearch();
  const [loading, setLoading] = useState(false);

  // Si el inicio de sesión falló al volver de Google, Supabase deja el error en la URL.
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search + "&" + window.location.hash.slice(1),
    );
    const description = params.get("error_description");
    if (!description) return;
    toast.error(friendlyAuthError(description).title, {
      description: friendlyAuthError(description).description,
    });
  }, []);

  const handleGoogle = async () => {
    setLoading(true);
    // Preserve the intended post-login path across the Google round-trip.
    const nextParam =
      search.redirect && search.redirect !== "/"
        ? `?redirect=${encodeURIComponent(search.redirect)}`
        : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login${nextParam}` },
    });
    if (error) {
      setLoading(false);
      const { title, description } = friendlyAuthError(error.message);
      toast.error(title, { description });
    }
    // Sin error, el navegador ya está yendo a Google; al volver, beforeLoad redirige.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <img src={rielLogo} alt="Riel" className="mx-auto h-14 w-14 object-contain" />
          <h1 className="text-2xl font-semibold tracking-tight">Bienvenido a Riel</h1>
          <p className="text-sm text-muted-foreground">Donde corre nuestra operación</p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.17v2.93h5.27c-.24 1.4-1.66 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.85 0-3.23 2.59-5.85 5.76-5.85 1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.81 3.91 14.71 3 12.18 3 7.13 3 3 7.13 3 12.18s4.13 9.17 9.18 9.17c5.3 0 8.81-3.73 8.81-8.98 0-.6-.07-1.07-.14-1.27z"
            />
          </svg>
          {loading ? "Conectando..." : "Continuar con Google"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Riel es una aplicación privada. Solo los correos invitados por un administrador pueden
          iniciar sesión.
        </p>
      </div>
    </div>
  );
}
