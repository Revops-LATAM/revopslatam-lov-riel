import { BillingEntitiesSection } from "@/components/tasko/finance/BillingEntitiesSection";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { wsBySlugQO, accountQO, contractsQO } from "@/lib/api/tasko.queries";
import { deleteAccount, updateAccount } from "@/lib/api/tasko.functions";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/tasko/Breadcrumbs";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RouteError } from "@/components/tasko/RouteError";
import { ContractTypeBadge } from "@/components/tasko/operations/ContractTypeBadge";
import { ConfirmDialog } from "@/components/tasko/ConfirmDialog";
import { SiiActivitySelect } from "@/components/tasko/operations/SiiActivitySelect";
import { usePermissions } from "@/lib/permissions";
import { cleanRut, formatRut, isValidRut } from "@/lib/rut";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/accounts/$accountId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cliente · Riel" }] }),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await Promise.all([
      context.queryClient.ensureQueryData(accountQO(params.accountId)),
      context.queryClient.ensureQueryData(contractsQO(ws.id, params.accountId)),
    ]);
    return null;
  },
  errorComponent: RouteError,
  component: AccountDetail,
});

function AccountDetail() {
  const { workspaceSlug, accountId } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: account } = useSuspenseQuery(accountQO(accountId));
  const { data: contracts } = useSuspenseQuery(contractsQO(ws.id, accountId));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteAccount);
  const perms = usePermissions(ws.id);
  const canEdit = perms.hasAny(["finance_manage", "ops_manage"]);
  const canDelete = perms.has("finance_manage");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const delM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", ws.id] });
      toast.success("Cliente eliminado");
      navigate({ to: "/w/$workspaceSlug/accounts", params: { workspaceSlug } });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmOpen(false);
    },
  });

  const hasContracts = contracts.length > 0;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-6 py-2 flex flex-col gap-1">
        <Breadcrumbs
          items={[
            { label: "Clientes", to: "/w/$workspaceSlug/accounts", params: { workspaceSlug } },
            { label: account.name },
          ]}
        />
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold truncate">{account.name}</h1>
          <span className="text-[10px] uppercase text-muted-foreground border border-border rounded px-1.5 py-0.5">
            {account.status}
          </span>
          <div className="ml-auto flex items-center gap-1">

          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1" />
              Editar
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={hasContracts}
              title={
                hasContracts
                  ? "Elimina o desvincula los contratos asociados antes de borrar este cliente"
                  : "Eliminar cliente"
              }
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar
            </Button>
          )}
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Eliminar "${account.name}"`}
        description="Esta acción no se puede deshacer. El cliente se eliminará permanentemente."
        destructive
        loading={delM.isPending}
        confirmLabel="Eliminar"
        onConfirm={() => delM.mutate({ data: { accountId } })}
      />

      <EditAccountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        account={normalizeAccount(account)}
        workspaceId={ws.id}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Datos comerciales */}
        <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Field label="Razón social" value={account.legal_name} />
          <Field label="RUT" value={account.tax_id} />
          <Field label="Giro" value={account.business_activity} className="col-span-2" />
          <Field label="Email DTE" value={account.billing_email} />
          <Field label="Comuna" value={account.commune} />
          <Field label="Dirección" value={account.address} className="col-span-2" />
          <Field label="Contacto principal" value={account.primary_contact_name} />
          <Field label="Email contacto" value={account.primary_contact_email} />
        </section>

        {(() => {
          const secs = parseSecondaryContacts(account.secondary_contacts);
          if (secs.length === 0) return null;
          return (
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Contactos secundarios
              </h3>
              <ul className="space-y-1 text-xs">
                {secs.map((c, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground">{c.nombre}</span>
                    {" — "}
                    {c.email}
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}


        {account.website && (
          <a href={account.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline block">
            {account.website}
          </a>
        )}
        {account.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{account.notes}</p>}

        <BillingEntitiesSection accountId={accountId} />

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Contratos</h2>
            <Link
              to="/w/$workspaceSlug/contracts"
              params={{ workspaceSlug }}
              search={{ accountId }}
            >
              <Button size="sm" variant="outline">
                + Nuevo contrato
              </Button>
            </Link>
          </div>
          {contracts.length === 0 ? (
            <div className="border border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground">
              <FileText className="w-5 h-5 mx-auto mb-2 opacity-60" />
              Sin contratos todavía.
            </div>
          ) : (
            <div className="space-y-2">
              {contracts.map((c) => (
                <Link
                  key={c.id}
                  to="/w/$workspaceSlug/contracts/$contractId"
                  params={{ workspaceSlug, contractId: c.id }}
                  className="block border border-border rounded-md p-3 hover:border-primary/50 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{c.name}</span>
                    <ContractTypeBadge type={c.type} />
                    <span className="text-[10px] uppercase text-muted-foreground border border-border rounded px-1.5 py-0.5 ml-auto">
                      {c.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.start_date} {c.end_date ? `→ ${c.end_date}` : "→ en curso"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-foreground">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

type AccountForEdit = {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  business_activity: string | null;
  billing_email: string | null;
  address: string | null;
  commune: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  secondary_contacts: { nombre: string; email: string }[] | null;
  website: string | null;
  notes: string | null;
};

const newUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function parseSecondaryContacts(raw: unknown): { nombre: string; email: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>;
        return { nombre: String(o.nombre ?? ""), email: String(o.email ?? "") };
      }
      return { nombre: "", email: "" };
    })
    .filter((c) => c.nombre || c.email);
}

function normalizeAccount(a: {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  business_activity: string | null;
  billing_email: string | null;
  address: string | null;
  commune: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  secondary_contacts: unknown;
  website: string | null;
  notes: string | null;
}): AccountForEdit {
  return {
    id: a.id,
    name: a.name,
    legal_name: a.legal_name,
    tax_id: a.tax_id,
    business_activity: a.business_activity,
    billing_email: a.billing_email,
    address: a.address,
    commune: a.commune,
    primary_contact_name: a.primary_contact_name,
    primary_contact_email: a.primary_contact_email,
    secondary_contacts: parseSecondaryContacts(a.secondary_contacts),
    website: a.website,
    notes: a.notes,
  };
}


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EditAccountDialog({
  open,
  onOpenChange,
  account,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: AccountForEdit;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAccount);
  const [name, setName] = useState(account.name);
  const [legalName, setLegalName] = useState(account.legal_name ?? "");
  const [taxId, setTaxId] = useState(account.tax_id ?? "");
  const [businessActivity, setBusinessActivity] = useState(account.business_activity ?? "");
  const [billingEmail, setBillingEmail] = useState(account.billing_email ?? "");
  const [address, setAddress] = useState(account.address ?? "");
  const [commune, setCommune] = useState(account.commune ?? "");
  const [primaryContactName, setPrimaryContactName] = useState(account.primary_contact_name ?? "");
  const [primaryContactEmail, setPrimaryContactEmail] = useState(account.primary_contact_email ?? "");
  const [website, setWebsite] = useState(account.website ?? "");
  const [notes, setNotes] = useState(account.notes ?? "");
  const [secondaryContacts, setSecondaryContacts] = useState<
    { _uid: string; nombre: string; email: string }[]
  >(
    (account.secondary_contacts ?? []).map((c) => ({ _uid: newUid(), nombre: c.nombre, email: c.email })),
  );

  // Re-hidratar al cambiar de cliente o reabrir
  useEffect(() => {
    if (!open) return;
    setName(account.name);
    setLegalName(account.legal_name ?? "");
    setTaxId(account.tax_id ?? "");
    setBusinessActivity(account.business_activity ?? "");
    setBillingEmail(account.billing_email ?? "");
    setAddress(account.address ?? "");
    setCommune(account.commune ?? "");
    setPrimaryContactName(account.primary_contact_name ?? "");
    setPrimaryContactEmail(account.primary_contact_email ?? "");
    setWebsite(account.website ?? "");
    setNotes(account.notes ?? "");
    setSecondaryContacts(
      (account.secondary_contacts ?? []).map((c) => ({ _uid: newUid(), nombre: c.nombre, email: c.email })),
    );
  }, [open, account]);

  const rutOk = !taxId.trim() || isValidRut(taxId);
  const billingEmailOk = !billingEmail.trim() || EMAIL_RE.test(billingEmail.trim());
  const primaryEmailOk = !primaryContactEmail.trim() || EMAIL_RE.test(primaryContactEmail.trim());
  const secondaryOk = secondaryContacts.every(
    (c) => c.nombre.trim() && EMAIL_RE.test(c.email.trim()),
  );

  const m = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", account.id] });
      qc.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      toast.success("Cliente actualizado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!name.trim() && rutOk && billingEmailOk && primaryEmailOk && secondaryOk && !m.isPending;

  const submit = () => {
    m.mutate({
      data: {
        accountId: account.id,
        name: name.trim(),
        legalName: legalName.trim() || null,
        taxId: taxId.trim() || null,
        businessActivity: businessActivity.trim() || null,
        billingEmail: billingEmail.trim() || null,
        address: address.trim() || null,
        commune: commune.trim() || null,
        primaryContactName: primaryContactName.trim() || null,
        primaryContactEmail: primaryContactEmail.trim() || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
        secondaryContacts: secondaryContacts
          .map((c) => ({ nombre: c.nombre.trim(), email: c.email.trim() }))
          .filter((c) => c.nombre && c.email),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nombre de la empresa *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Razón social</Label>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
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
              />
              {!billingEmailOk && (
                <p className="text-[11px] text-destructive mt-1">Email inválido</p>
              )}
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label>Comuna</Label>
              <Input value={commune} onChange={(e) => setCommune(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Sitio web</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
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
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
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
                onClick={() =>
                  setSecondaryContacts((prev) => [...prev, { _uid: newUid(), nombre: "", email: "" }])
                }
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
                            prev.map((x, idx) => (idx === i ? { ...x, nombre: e.target.value } : x)),
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
          <Button disabled={!canSubmit} onClick={submit}>
            {m.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
