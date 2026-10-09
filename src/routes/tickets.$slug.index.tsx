import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, Mail, CheckCircle2, AlertTriangle, Ticket } from "lucide-react";

export const Route = createFileRoute("/tickets/$slug/")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Portal de tickets" }, { name: "robots", content: "noindex" }],
  }),
  component: PortalLogin,
});

const ERROR_MSG: Record<string, string> = {
  missing: "El enlace de acceso está incompleto.",
  invalid: "El enlace no es válido.",
  expired: "El enlace expiró. Solicita uno nuevo.",
  used: "Este enlace ya fue usado. Solicita uno nuevo.",
  not_found: "Portal no disponible.",
  session: "No se pudo iniciar la sesión.",
};

function PortalLogin() {
  const { slug } = Route.useParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setLinkError(ERROR_MSG[err] ?? "No se pudo validar el acceso.");
    fetch(`/api/public/portal/${slug}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) window.location.href = `/tickets/${slug}/portal/inbox`;
      })
      .catch(() => {});
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/public/portal/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "request-link", email: email.trim().toLowerCase() }),
      });
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error ?? "Demasiadas solicitudes. Intenta más tarde.");
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setErrorMsg("No se pudo enviar el enlace. Revisa el email e intenta de nuevo.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMsg("Error de red.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Ticket className="w-4 h-4" /> Portal de tickets
          </div>
          <h1 className="text-2xl font-semibold">Ingresa a tu portal</h1>
          <p className="text-sm text-muted-foreground">
            Envía nuevos tickets y consulta el estado de los actuales. Te enviaremos un enlace de
            acceso a tu correo autorizado.
          </p>
        </div>

        {linkError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{linkError}</span>
          </div>
        )}

        {status === "sent" ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-2">
            <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" /> Revisa tu correo
            </div>
            <p className="text-sm text-muted-foreground">
              Si <strong>{email}</strong> está autorizado, recibirás un enlace de acceso en los
              próximos minutos. El enlace expira en 30 minutos.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
            >
              Usar otro correo
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-lg border p-5 bg-card">
            <div className="space-y-2">
              <Label htmlFor="portal-email">Email autorizado</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="portal-email"
                  type="email"
                  required
                  autoFocus
                  className="pl-9"
                  placeholder="tu@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "loading"}
                />
              </div>
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <Button type="submit" className="w-full" disabled={status === "loading" || !email}>
              {status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" /> Enviar enlace de acceso
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
