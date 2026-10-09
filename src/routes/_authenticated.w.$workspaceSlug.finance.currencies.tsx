import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wsBySlugQO, currencyRatesQO } from "@/lib/api/tasko.queries";
import { upsertCurrencyRate, deleteCurrencyRate } from "@/lib/api/tasko.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/currencies")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(currencyRatesQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: CurrenciesPage,
});

function CurrenciesPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: rates } = useSuspenseQuery(currencyRatesQO(ws.id));
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCurrencyRate);
  const delFn = useServerFn(deleteCurrencyRate);

  const [currency, setCurrency] = useState<"USD" | "CLP" | "UF">("UF");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const upsert = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["currency-rates", ws.id] });
      setRate("");
      toast.success("Tipo de cambio guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: delFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["currency-rates", ws.id] });
      toast.success("Eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <section className="border border-border rounded-md p-4 space-y-3">
        <h3 className="text-sm font-semibold">Agregar tipo de cambio</h3>
        <p className="text-xs text-muted-foreground">
          Valor de 1 unidad de la moneda expresado en USD (moneda base).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <Label>Moneda</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as typeof currency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor en USD</Label>
            <Input
              type="number"
              step="0.000001"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.001075"
            />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button
            disabled={!rate || Number(rate) <= 0 || upsert.isPending}
            onClick={() =>
              upsert.mutate({
                data: {
                  workspaceId: ws.id,
                  currency,
                  baseCurrency: "USD",
                  rateToBase: Number(rate),
                  rateDate: date,
                },
              })
            }
          >
            Guardar
          </Button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Historial</h3>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                <th className="text-left px-3 py-2 font-medium">Moneda</th>
                <th className="text-right px-3 py-2 font-medium">Valor (USD)</th>
                <th className="text-left px-3 py-2 font-medium">Notas</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-10">
                    Sin registros.
                  </td>
                </tr>
              ) : (
                rates.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{r.rate_date}</td>
                    <td className="px-3 py-2 font-medium">{r.currency}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(r.rate_to_base).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? ""}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={del.isPending}
                        onClick={() => del.mutate({ data: { rateId: r.id } })}
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
      </section>
    </div>
  );
}
