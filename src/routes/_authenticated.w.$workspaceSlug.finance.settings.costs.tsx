import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { wsBySlugQO, memberCostRatesQO, membersQO } from "@/lib/api/tasko.queries";
import { upsertMemberCostRate, deleteMemberCostRate } from "@/lib/api/tasko.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RouteError } from "@/components/tasko/RouteError";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/settings/costs")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await Promise.all([
      context.queryClient.ensureQueryData(memberCostRatesQO(ws.id)),
      context.queryClient.ensureQueryData(membersQO(ws.id)),
    ]);
    return null;
  },
  errorComponent: RouteError,
  component: CostsPage,
});

type Rate = {
  id: string;
  user_id: string;
  costo_hora: number | string | null;
  currency: string;
  effective_from: string;
  profiles: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function CostsPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: rates } = useSuspenseQuery(memberCostRatesQO(ws.id));
  const { data: members } = useSuspenseQuery(membersQO(ws.id));
  const qc = useQueryClient();

  const upsertFn = useServerFn(upsertMemberCostRate);
  const deleteFn = useServerFn(deleteMemberCostRate);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["member-cost-rates", ws.id] });
  };

  const upsertM = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      invalidate();
      toast.success("Costo guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      invalidate();
      toast.success("Costo eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // current rate per member (latest <= today)
  const today = todayIso();
  const currentByUser = useMemo(() => {
    const m = new Map<string, Rate>();
    for (const r of (rates ?? []) as Rate[]) {
      if (r.effective_from > today) continue;
      const prev = m.get(r.user_id);
      if (!prev || r.effective_from > prev.effective_from) m.set(r.user_id, r);
    }
    return m;
  }, [rates, today]);

  const [newUserId, setNewUserId] = useState<string>("");
  const [newAmount, setNewAmount] = useState<string>("");
  const [newCurrency, setNewCurrency] = useState<"CLP" | "USD" | "UF">("CLP");
  const [newDate, setNewDate] = useState<string>(today);

  const onAdd = () => {
    if (!newUserId || !newAmount) {
      toast.error("Selecciona miembro y monto");
      return;
    }
    upsertM.mutate({
      data: {
        workspaceId: ws.id,
        userId: newUserId,
        costoHora: Number(newAmount),
        currency: newCurrency,
        effectiveFrom: newDate,
      },
    });
    setNewAmount("");
  };

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Costos por hora</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Define el costo interno por hora de cada miembro. Se usa para calcular el margen estimado
          de cada proyecto. Puedes mantener un histórico por fecha de vigencia.
        </p>
      </div>

      {/* New rate */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
          Asignar / actualizar costo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-4">
            <label className="text-[11px] text-muted-foreground">Miembro</label>
            <Select value={newUserId} onValueChange={setNewUserId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <label className="text-[11px] text-muted-foreground">Costo / hora</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="h-8 text-xs"
              placeholder="0"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] text-muted-foreground">Moneda</label>
            <Select
              value={newCurrency}
              onValueChange={(v) => setNewCurrency(v as "CLP" | "USD" | "UF")}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] text-muted-foreground">Vigente desde</label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="md:col-span-1">
            <Button
              onClick={onAdd}
              disabled={upsertM.isPending}
              size="sm"
              className="h-8 w-full text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Guardar
            </Button>
          </div>
        </div>
      </div>

      {/* Current rates */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/40">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Costo vigente por miembro
          </h3>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/20">
            <tr>
              <th className="text-left px-4 py-2">Miembro</th>
              <th className="text-right px-4 py-2">Costo/hora</th>
              <th className="text-left px-4 py-2">Moneda</th>
              <th className="text-left px-4 py-2">Vigente desde</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-muted-foreground">
                  Sin miembros en el workspace.
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const r = currentByUser.get(m.user_id);
                return (
                  <tr key={m.user_id} className="border-t border-border">
                    <td className="px-4 py-2">
                      {m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r ? (
                        Number(r.costo_hora ?? 0).toLocaleString("es-CL")
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r?.currency ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r?.effective_from ?? "—"}</td>
                    <td className="px-2 py-2"></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Full history */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/40">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Historial completo
          </h3>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[11px] uppercase text-muted-foreground bg-muted/20">
            <tr>
              <th className="text-left px-4 py-2">Miembro</th>
              <th className="text-right px-4 py-2">Costo/hora</th>
              <th className="text-left px-4 py-2">Moneda</th>
              <th className="text-left px-4 py-2">Desde</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {(rates as Rate[]).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-muted-foreground">
                  Sin tarifas registradas todavía.
                </td>
              </tr>
            ) : (
              (rates as Rate[]).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    {r.profiles?.full_name ?? r.profiles?.email ?? r.user_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {Number(r.costo_hora ?? 0).toLocaleString("es-CL")}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.currency}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.effective_from}</td>
                  <td className="px-2 py-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      disabled={deleteM.isPending}
                      title="Eliminar"
                      aria-label="Eliminar"
                      onClick={() => deleteM.mutate({ data: { rateId: r.id } })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
