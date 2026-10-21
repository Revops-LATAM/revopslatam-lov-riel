import { createFileRoute } from "@tanstack/react-router";

// Diagnóstico del despliegue. Público a propósito y sin datos sensibles: solo informa qué variables
// obligatorias faltan (por nombre) y si el servidor alcanza a Supabase Auth.
const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "PUBLIC_APP_URL",
] as const;

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const missing = REQUIRED.filter((k) => !process.env[k]);
        let supabase: "ok" | "inalcanzable" | "sin_configurar" = "sin_configurar";
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (url && key) {
          try {
            const res = await fetch(`${url}/auth/v1/health`, {
              headers: { apikey: key },
              signal: AbortSignal.timeout(4000),
            });
            supabase = res.ok ? "ok" : "inalcanzable";
          } catch {
            supabase = "inalcanzable";
          }
        }
        // Una clave con formato equivocado (p. ej. un secreto de Google) "existe" pero Supabase la rechaza.
        const okFormat = (v: string | undefined) =>
          !v || /^sb_publishable_[\w-]+$/.test(v) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v);
        const invalid = (
          ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const
        ).filter((k) => !okFormat(process.env[k]));
        const ok = missing.length === 0 && invalid.length === 0 && supabase === "ok";
        return Response.json({ ok, missing, invalid, supabase }, { status: 200 });
      },
    },
  },
});
