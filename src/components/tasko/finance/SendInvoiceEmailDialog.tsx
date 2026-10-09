import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getInvoiceEmailData } from "@/lib/api/dte-email.functions";
import { sendInvoiceEmail } from "@/lib/api/invoice-email.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string | null;
}

function buildDefaultBody(opts: {
  folio: string;
  descripcion: string;
  monto: string;
  ocRef: string;
  clienteNombre: string;
  emisorNombre: string;
  emisorBanco: string;
  emisorTipoCuenta: string;
  emisorCuenta: string;
  emisorRut: string;
  emisorEmail: string;
}) {
  const ocPart = opts.ocRef ? `, según la ${opts.ocRef}` : "";
  const saludo = opts.clienteNombre ? `Hola Equipo ${opts.clienteNombre},` : "Hola,";
  return `${saludo}

Esperamos que se encuentren muy bien.

Adjuntamos la factura electrónica N°${opts.folio}, correspondiente a ${opts.descripcion}${ocPart}.

Monto total: ${opts.monto}

Quedamos atentos ante cualquier consulta o requerimiento relacionado con este proceso.

Datos para transferencia bancaria

En caso de que el pago se realice mediante transferencia, compartimos los datos a continuación:

Nombre: ${opts.emisorNombre}
Banco: ${opts.emisorBanco}
${opts.emisorTipoCuenta}: ${opts.emisorCuenta}
RUT: ${opts.emisorRut}
Correo: ${opts.emisorEmail}

Muchas gracias por su confianza,
Equipo Finanzas Grupo Revenue`;
}

function buildDefaultSubject(folio: string) {
  return `Factura Electrónica ${folio} - Grupo Revenue`;
}

function bodyFromData(
  data: NonNullable<Awaited<ReturnType<typeof getInvoiceEmailData>>>,
  ocRef: string,
) {
  const t = data.templateData;
  return buildDefaultBody({
    folio: String(t.folio),
    descripcion: t.descripcion,
    monto: t.monto_formatted,
    ocRef,
    clienteNombre: (t as { cliente_nombre?: string }).cliente_nombre ?? "",
    emisorNombre: t.emisor_nombre,
    emisorBanco: t.emisor_banco,
    emisorTipoCuenta: t.emisor_tipo_cuenta,
    emisorCuenta: t.emisor_cuenta,
    emisorRut: t.emisor_rut,
    emisorEmail: t.emisor_email,
  });
}

export function SendInvoiceEmailDialog({ open, onOpenChange, invoiceId }: Props) {
  const fetchData = useServerFn(getInvoiceEmailData);
  const sendEmail = useServerFn(sendInvoiceEmail);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [ocReference, setOcReference] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyEdited, setBodyEdited] = useState(false);
  const [subjectEdited, setSubjectEdited] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getInvoiceEmailData>> | null>(null);

  useEffect(() => {
    if (!open || !invoiceId) return;
    setLoading(true);
    setBodyEdited(false);
    setSubjectEdited(false);
    fetchData({ data: { invoiceId } })
      .then((r) => {
        setData(r);
        setTo(r.defaultRecipient);
        setCc(r.defaultCc.join(", "));
        setOcReference("");
        const folio = String(r.templateData.folio);
        setSubject(buildDefaultSubject(folio));
        setBody(bodyFromData(r, ""));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [open, invoiceId, fetchData]);

  // Re-render defaults when OC reference changes (unless user edited manually)
  useEffect(() => {
    if (!data) return;
    if (!bodyEdited) {
      setBody(bodyFromData(data, ocReference));
    }
  }, [ocReference, data, bodyEdited]);

  const handleSend = async () => {
    if (!invoiceId || !to || !data) return;
    setSending(true);
    try {
      const ccList = cc
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await sendEmail({
        data: {
          invoiceId,
          to,
          cc: ccList,
          ocReference: ocReference || null,
          subjectOverride: subjectEdited ? subject : null,
          bodyOverride: body,
        },
      });
      toast.success("Factura enviada por email con PDF adjunto");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar factura por email</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Para</Label>
              <Input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="cliente@empresa.com"
              />
            </div>
            <div>
              <Label className="text-xs">CC (separados por coma)</Label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="finanzas@..., gerencia@..."
              />
            </div>
            <div>
              <Label className="text-xs">Referencia OC (opcional)</Label>
              <Input
                value={ocReference}
                onChange={(e) => setOcReference(e.target.value)}
                placeholder="OC 119 del 15 de Mayo"
              />
            </div>
            <div>
              <Label className="text-xs">Asunto</Label>
              <Input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setSubjectEdited(true);
                }}
              />
            </div>
            <div>
              <Label className="text-xs flex items-center justify-between">
                <span>Mensaje del correo</span>
                {bodyEdited ? (
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline"
                    onClick={() => {
                      if (!data) return;
                      setBody(bodyFromData(data, ocReference));
                      setBodyEdited(false);
                    }}
                  >
                    Restaurar predeterminado
                  </button>
                ) : null}
              </Label>
              <Textarea
                rows={18}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setBodyEdited(true);
                }}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                El PDF de la factura se adjunta automáticamente al correo.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || loading || !to}>
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
