import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSystemConfig } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/system")({
  component: AdminSystem,
});

function AdminSystem() {
  const fetchCfg = useServerFn(getSystemConfig);
  const cfg = useQuery({
    queryKey: ["admin-system-config"],
    queryFn: () => fetchCfg(),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-sm font-semibold">Configuración técnica</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Información de plataforma para super admins. Solo lectura.
        </p>
      </div>

      {cfg.isLoading ? (
        <div className="text-xs text-muted-foreground">Cargando…</div>
      ) : (
        <>
          <section className="border border-border rounded-md p-4 space-y-2">
            <h3 className="text-sm font-semibold">Secretos configurados</h3>
            <p className="text-[11px] text-muted-foreground">
              Nombres de variables de entorno disponibles en el servidor. Los valores no se muestran nunca.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(cfg.data?.secret_names ?? []).map((n) => (
                <span
                  key={n}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                >
                  {n}
                </span>
              ))}
            </div>
          </section>

          <section className="border border-border rounded-md p-4 space-y-3">
            <h3 className="text-sm font-semibold">Tipos de cambio recientes</h3>
            {(cfg.data?.currency_rates ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin tipos de cambio registrados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-1">Moneda</th>
                    <th className="text-left font-medium py-1">Base</th>
                    <th className="text-left font-medium py-1">Tasa</th>
                    <th className="text-left font-medium py-1">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.data!.currency_rates.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5">{r.currency}</td>
                      <td className="py-1.5">{r.base_currency}</td>
                      <td className="py-1.5">{r.rate_to_base}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{r.rate_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="border border-border rounded-md p-4 space-y-3">
            <h3 className="text-sm font-semibold">Últimos envíos de email</h3>
            {(cfg.data?.recent_email_logs ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin envíos registrados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-1">Destinatario</th>
                    <th className="text-left font-medium py-1">Plantilla</th>
                    <th className="text-left font-medium py-1">Estado</th>
                    <th className="text-left font-medium py-1">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.data!.recent_email_logs.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5 text-xs">{l.recipient_email}</td>
                      <td className="py-1.5 text-xs">{l.template_name ?? "—"}</td>
                      <td className="py-1.5 text-xs">{l.status}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
