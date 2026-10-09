import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  startGoogleCalendarOAuth,
  getMyCalendarConnection,
  disconnectGoogleCalendar,
} from "@/lib/api/calendar.functions";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2, AlertCircle, Unplug } from "lucide-react";

export function CalendarConnectionSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const startOAuth = useServerFn(startGoogleCalendarOAuth);
  const fetchConn = useServerFn(getMyCalendarConnection);
  const disconnect = useServerFn(disconnectGoogleCalendar);

  const conn = useQuery({
    queryKey: ["calendar-connection", workspaceId],
    queryFn: () => fetchConn({ data: { workspaceId } }),
  });

  // Detect ?calendar=connected return param
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("calendar") === "connected") {
      url.searchParams.delete("calendar");
      window.history.replaceState({}, "", url.toString());
      toast.success("Google Calendar conectado");
      qc.invalidateQueries({ queryKey: ["calendar-connection", workspaceId] });
    }
  }, [qc, workspaceId]);

  const connectMut = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/api/public/oauth/google-calendar/callback`;
      const res = await startOAuth({ data: { workspaceId, redirectUri } });
      window.location.href = res.url;
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect({ data: { workspaceId } }),
    onSuccess: () => {
      toast.success("Calendario desconectado");
      qc.invalidateQueries({ queryKey: ["calendar-connection", workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const c = conn.data;
  const isActive = c && c.status === "active";

  return (
    <section className="border border-border rounded-md p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Calendar className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold">Google Calendar</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conecta tu agenda para que Riel descuente las reuniones de tu capacidad y te muestre en
            el Inbox las que aún no están asociadas a un proyecto. Solo se leen eventos públicos
            —los marcados como <span className="text-foreground">Privado</span> en Google Calendar
            se ignoran por completo.
          </p>
        </div>
      </div>

      {conn.isLoading ? (
        <div className="text-xs text-muted-foreground">Cargando…</div>
      ) : isActive ? (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">{c.google_account_email}</span>
            {c.last_synced_at ? (
              <span className="text-xs text-muted-foreground">
                · sincronizado {new Date(c.last_synced_at).toLocaleString()}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                · pendiente primera sincronización
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => disconnectMut.mutate()}
            disabled={disconnectMut.isPending}
          >
            <Unplug className="h-3.5 w-3.5 mr-1.5" />
            Desconectar
          </Button>
        </div>
      ) : c && c.status === "needs_reauth" ? (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span>Necesita reautorizar: {c.google_account_email}</span>
          </div>
          <Button size="sm" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
            Reconectar
          </Button>
        </div>
      ) : (
        <div className="pt-2 border-t border-border">
          <Button size="sm" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Conectar Google Calendar
          </Button>
        </div>
      )}
    </section>
  );
}
