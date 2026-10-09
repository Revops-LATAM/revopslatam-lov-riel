import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  ssr: false,
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [state, setState] = useState<"loading" | "valid" | "invalid" | "used" | "done" | "error">(
    "loading",
  );
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const token = params.get("token");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(j?.error ?? "Token inválido");
          setState(j?.error === "token_already_used" ? "used" : "invalid");
          return;
        }
        setEmail(j?.email ?? null);
        setState("valid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    const r = await fetch("/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (r.ok) setState("done");
    else setState("error");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full border border-border rounded-lg p-6 space-y-4">
        <h1 className="text-lg font-semibold">Cancelar suscripción</h1>
        {state === "loading" && <p className="text-sm text-muted-foreground">Verificando…</p>}
        {state === "invalid" && (
          <p className="text-sm text-destructive">El enlace no es válido. {error ?? ""}</p>
        )}
        {state === "used" && (
          <p className="text-sm text-muted-foreground">Este enlace ya fue usado.</p>
        )}
        {state === "error" && (
          <p className="text-sm text-destructive">Ocurrió un error. Intenta de nuevo más tarde.</p>
        )}
        {state === "valid" && (
          <>
            <p className="text-sm">
              ¿Confirmas que ya no quieres recibir emails {email ? `en ${email}` : ""}?
            </p>
            <Button onClick={confirm}>Confirmar baja</Button>
          </>
        )}
        {state === "done" && (
          <p className="text-sm">Listo. No recibirás más emails de esta aplicación.</p>
        )}
      </div>
    </div>
  );
}
