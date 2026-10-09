import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import { wsBySlugQO, accountsQO } from "@/lib/api/tasko.queries";
import { createAccount } from "@/lib/api/tasko.functions";
import { useDerivedArea } from "@/lib/active-space";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { RouteError } from "@/components/tasko/RouteError";
import { DataGrid, type ColumnDef } from "@/components/datagrid/DataGrid";
import { SiiActivitySelect } from "@/components/tasko/operations/SiiActivitySelect";
import { usePermissions } from "@/lib/permissions";
import { cleanRut, formatRut, isValidRut } from "@/lib/rut";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/accounts/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Clientes · Riel" }] }),
  validateSearch: (s) => z.object({ q: z.string().optional() }).parse(s),
  loader: async ({ context, params }) => {
    const { requirePermission } = await import("@/lib/permissions-loader");
    const ws = await requirePermission(context.queryClient, params.workspaceSlug, [
      "ops_view",
      "ops_manage",
      "finance_view",
      "finance_manage",
    ]);
    // Cargamos ambas variantes: el componente elige según el área activa.
    // (Clientes es un módulo espejo Ops/Finanzas.)
    await context.queryClient.ensureQueryData(accountsQO(ws.id, "finance"));
    return null;
  },
  errorComponent: RouteError,
  component: AccountsPage,
});

type Account = {
  id: string;
  name: string;
  status: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  legal_name: string | null;
  tax_id: string | null;
  business_activity: string | null;
  billing_email: string | null;
  address: string | null;
  commune: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  secondary_contacts: { nombre: string; email: string }[] | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inactive: "bg-muted text-muted-foreground border-border",
  prospect: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TONE[status] ?? STATUS_TONE.closed;
  return (
    <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 border ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

import { formatDateCL } from "@/lib/date-format";

function fmtDate(s: string | null) {
  return formatDateCL(s);
}

function AccountsPage() {
  const { workspaceSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const area = useDerivedArea(pathname, ws.id);
  // En Operaciones filtramos a clientes con handoff completado; en Finanzas se ven todos.
  const listArea: "operations" | "finance" = area === "finance" ? "finance" : "operations";
  const { data: accounts } = useSuspenseQuery(accountsQO(ws.id, listArea));
  const perms = usePermissions(ws.id);
  // Solo Finanzas con permiso de gestión puede crear clientes (Operaciones solo ve/edita)
  const canCreate = perms.has("finance_manage");
  const [open, setOpen] = useState(false);
  const q = (search.q ?? "").trim().toLowerCase();
  const filteredAccounts = useMemo(() => {
    if (!q) return accounts;
    return (
      accounts as Array<{ name: string; legal_name: string | null; tax_id: string | null }>
    ).filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.legal_name ?? "").toLowerCase().includes(q) ||
        (a.tax_id ?? "").toLowerCase().includes(q),
    );
  }, [accounts, q]);

  const columns: ColumnDef<Account>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Cliente",
        required: true,
        sortable: true,
        accessor: (a) => a.name,
        cell: (a) => <span className="font-medium truncate">{a.name}</span>,
        width: 260,
      },
      {
        id: "status",
        header: "Estado",
        sortable: true,
        accessor: (a) => a.status,
        cell: (a) => <StatusBadge status={a.status} />,
        width: 100,
      },
      {
        id: "legal_name",
        header: "Razón social",
        sortable: true,
        accessor: (a) => a.legal_name ?? "",
        cell: (a) => <span className="text-[12px] truncate">{a.legal_name ?? "—"}</span>,
        width: 220,
      },
      {
        id: "tax_id",
        header: "RUT",
        sortable: true,
        accessor: (a) => a.tax_id ?? "",
        cell: (a) => <span className="text-[12px] font-mono">{a.tax_id ?? "—"}</span>,
        width: 120,
      },
      {
        id: "business_activity",
        header: "Giro",
        sortable: true,
        accessor: (a) => a.business_activity ?? "",
        cell: (a) => (
          <span className="text-[12px] text-muted-foreground truncate">
            {a.business_activity ?? "—"}
          </span>
        ),
        width: 260,
      },
      {
        id: "billing_email",
        header: "Email DTE",
        sortable: true,
        accessor: (a) => a.billing_email ?? "",
        cell: (a) => <span className="text-[12px] truncate">{a.billing_email ?? "—"}</span>,
        width: 220,
      },
      {
        id: "primary_contact_name",
        header: "Contacto",
        sortable: true,
        accessor: (a) => a.primary_contact_name ?? "",
        cell: (a) => <span className="text-[12px] truncate">{a.primary_contact_name ?? "—"}</span>,
        width: 180,
      },
      {
        id: "primary_contact_email",
        header: "Email contacto",
        sortable: true,
        accessor: (a) => a.primary_contact_email ?? "",
        cell: (a) => <span className="text-[12px] truncate">{a.primary_contact_email ?? "—"}</span>,
        width: 220,
      },
      {
        id: "address",
        header: "Dirección",
        sortable: false,
        accessor: (a) => a.address ?? "",
        cell: (a) => (
          <span className="text-[12px] text-muted-foreground truncate">{a.address ?? "—"}</span>
        ),
        width: 240,
      },
      {
        id: "commune",
        header: "Comuna",
        sortable: true,
        accessor: (a) => a.commune ?? "",
        cell: (a) => <span className="text-[12px]">{a.commune ?? "—"}</span>,
        width: 140,
      },
      {
        id: "secondary_contacts",
        header: "Contactos sec.",
        sortable: false,
        accessor: (a) => (a.secondary_contacts?.length ?? 0).toString(),
        cell: (a) => {
          const n = a.secondary_contacts?.length ?? 0;
          return (
            <span className="text-[12px] text-muted-foreground">
              {n === 0 ? "—" : `${n} contacto${n === 1 ? "" : "s"}`}
            </span>
          );
        },
        width: 130,
      },
      {
        id: "website",
        header: "Sitio web",
        sortable: true,
        accessor: (a) => a.website ?? "",
        cell: (a) =>
          a.website ? (
            <a
              href={a.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[12px] text-primary hover:underline truncate"
            >
              {a.website}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        width: 200,
      },
      {
        id: "notes",
        header: "Notas",
        sortable: false,
        accessor: (a) => a.notes ?? "",
        cell: (a) => (
          <span className="text-[12px] text-muted-foreground truncate">{a.notes ?? "—"}</span>
        ),
        width: 280,
      },
      {
        id: "created_at",
        header: "Creado",
        sortable: true,
        accessor: (a) => a.created_at,
        cell: (a) => <span className="text-muted-foreground">{fmtDate(a.created_at)}</span>,
        width: 120,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Clientes</h1>
        {canCreate ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo cliente
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Solo Finanzas puede crear clientes
          </span>
        )}
      </header>

      {accounts.length === 0 ? (
        <div className="flex-1 p-6">
          <div className="border border-dashed border-border rounded-md p-10 text-center text-sm text-muted-foreground">
            <Building2 className="w-6 h-6 mx-auto mb-2 opacity-60" />
            {listArea === "operations"
              ? "Aún no hay clientes en Operaciones. Los clientes aparecen aquí cuando Finanzas completa el handoff del contrato."
              : "Aún no tienes clientes. Crea el primero para empezar a registrar contratos."}
          </div>
        </div>
      ) : (
        <DataGrid<Account>
          viewKey={`accounts:${ws.id}`}
          columns={columns}
          rows={filteredAccounts as unknown as Account[]}
          rowKey={(a) => a.id}
          defaultSort={{ id: "created_at", dir: "desc" }}
          onRowOpen={(a) =>
            navigate({
              to: "/w/$workspaceSlug/accounts/$accountId",
              params: { workspaceSlug, accountId: a.id },
            })
          }
          empty="Sin clientes."
        />
      )}

      <NewAccountDialog open={open} onOpenChange={setOpen} workspaceId={ws.id} />
    </div>
  );
}

function NewAccountDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createAccount);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [businessActivity, setBusinessActivity] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [address, setAddress] = useState("");
  const [commune, setCommune] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [secondaryContacts, setSecondaryContacts] = useState<
    { _uid: string; nombre: string; email: string }[]
  >([]);
  const newSecondaryContact = () => ({
    _uid:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    nombre: "",
    email: "",
  });
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName("");
    setLegalName("");
    setTaxId("");
    setBusinessActivity("");
    setBillingEmail("");
    setAddress("");
    setCommune("");
    setPrimaryContactName("");
    setPrimaryContactEmail("");
    setSecondaryContacts([]);
    setNotes("");
  };

  // Chilean RUT format validation (e.g. 12.345.678-9 or 12345678-9)
  const rutOk = !taxId.trim() || isValidRut(taxId);
  const billingEmailOk =
    !billingEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail.trim());
  const primaryEmailOk =
    !primaryContactEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryContactEmail.trim());
  const secondaryOk = secondaryContacts.every(
    (c) => c.nombre.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()),
  );

  const m = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      toast.success("Cliente creado");
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!name.trim() && rutOk && billingEmailOk && primaryEmailOk && secondaryOk && !m.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nombre de la empresa *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme S.A."
              />
            </div>
            <div>
              <Label>Razón social</Label>
              <Input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Acme Sociedad Anónima"
              />
            </div>
            <div>
              <Label>RUT</Label>
              <Input
                value={taxId}
                onChange={(e) => setTaxId(cleanRut(e.target.value))}
                onBlur={() => setTaxId((v) => (v ? formatRut(v) : ""))}
                placeholder="12.345.678-9"
                aria-invalid={!rutOk}
                className={!rutOk ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {!rutOk && (
                <p className="text-[11px] text-destructive mt-1">
                  RUT inválido (verifica el dígito verificador)
                </p>
              )}
            </div>
            <div className="col-span-2">
              <Label>Giro / Actividad económica</Label>
              <SiiActivitySelect value={businessActivity} onChange={setBusinessActivity} />
            </div>
            <div className="col-span-2">
              <Label>Email para envío de DTE</Label>
              <Input
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                placeholder="facturacion@empresa.cl"
              />
              {!billingEmailOk && (
                <p className="text-[11px] text-destructive mt-1">Email inválido</p>
              )}
            </div>
            <div>
              <Label>Dirección</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Av. Apoquindo 1234"
              />
            </div>
            <div>
              <Label>Comuna</Label>
              <Input
                value={commune}
                onChange={(e) => setCommune(e.target.value)}
                placeholder="Las Condes"
              />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Contacto principal
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
                  placeholder="juan@empresa.cl"
                />
                {!primaryEmailOk && (
                  <p className="text-[11px] text-destructive mt-1">Email inválido</p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                Contactos secundarios
              </h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSecondaryContacts((prev) => [...prev, newSecondaryContact()])}
              >
                <Plus className="w-3 h-3 mr-1" /> Agregar
              </Button>
            </div>
            {secondaryContacts.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Sin contactos adicionales.</p>
            ) : (
              <div className="space-y-2">
                {secondaryContacts.map((c, i) => (
                  <div key={c._uid} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-[11px]">Nombre</Label>
                      <Input
                        value={c.nombre}
                        onChange={(e) =>
                          setSecondaryContacts((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? { ...x, nombre: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Email</Label>
                      <Input
                        type="email"
                        value={c.email}
                        onChange={(e) =>
                          setSecondaryContacts((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, email: e.target.value } : x)),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSecondaryContacts((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              m.mutate({
                data: {
                  workspaceId,
                  name: name.trim(),
                  legalName: legalName.trim() || undefined,
                  taxId: taxId.trim() || undefined,
                  businessActivity: businessActivity.trim() || undefined,
                  billingEmail: billingEmail.trim() || undefined,
                  address: address.trim() || undefined,
                  commune: commune.trim() || undefined,
                  primaryContactName: primaryContactName.trim() || undefined,
                  primaryContactEmail: primaryContactEmail.trim() || undefined,
                  secondaryContacts: secondaryContacts
                    .map((c) => ({ nombre: c.nombre.trim(), email: c.email.trim() }))
                    .filter((c) => c.nombre && c.email),
                  notes: notes.trim() || undefined,
                },
              })
            }
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
