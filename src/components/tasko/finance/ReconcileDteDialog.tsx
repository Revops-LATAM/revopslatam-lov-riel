import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { reconcileDte } from "@/lib/api/dte-email.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string | null;
  onDone?: () => void;
}

export function ReconcileDteDialog({ open, onOpenChange, invoiceId, onDone }: Props) {
  const reconcile = useServerFn(reconcileDte);
  const [folio, setFolio] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!invoiceId || !folio) return;
    setBusy(true);
    try {
      await reconcile({
        data: {
          invoiceId,
          folio,
          pdfUrl: pdfUrl || null,
          fechaEmision: fecha,
        },
      });
      toast.success("DTE conciliado");
      onDone?.();
      onOpenChange(false);
      setFolio("");
      setPdfUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conciliar DTE</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Asocia un folio del SII a una factura local sin emitir nuevamente.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Folio SII</Label>
            <Input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="2885" />
          </div>
          <div>
            <Label className="text-xs">URL del PDF (opcional)</Label>
            <Input
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label className="text-xs">Fecha de emisión</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handle} disabled={busy || !folio}>
            {busy ? "Conciliando…" : "Conciliar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
