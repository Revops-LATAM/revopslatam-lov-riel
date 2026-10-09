import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { workspacesQO } from "@/lib/api/tasko.queries";
import { importLegacyData } from "@/lib/api/legacy-import.functions";
import {
  setupEscContractAndProject,
  importEscTasksFromXlsx,
  createEscGhostUser,
} from "@/lib/api/esc-import.functions";
import {
  importWrikeContract,
  listContractsForImport,
} from "@/lib/api/wrike-import.functions";
import { listContractProjects } from "@/lib/api/operations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/import")({
  head: () => ({ meta: [{ title: "Importar desde sistema comercial · Riel" }] }),
  component: ImportPage,
});

type ImportResult = Awaited<ReturnType<typeof importLegacyData>>;

function ImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runImport = useServerFn(importLegacyData);
  const workspaces = useQuery(workspacesQO());
  const options = (workspaces.data ?? []).filter((w) => w.kind === "operations");

  const [workspaceId, setWorkspaceId] = useState<string>("");
  useEffect(() => {
    if (!workspaceId && options.length > 0) setWorkspaceId(options[0].id);
  }, [options, workspaceId]);

  const selected = options.find((w) => w.id === workspaceId);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(dryRun: boolean) {
    if (!workspaceId || !selected) return;
    if (!dryRun) {
      const ok = window.confirm(
        `Vas a importar TODA la data del sistema comercial al workspace "${selected.name}". ¿Continuar?`,
      );
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await runImport({ data: { workspaceId, dryRun } });
      setResult(r);
      if (!dryRun) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["ws-payments", workspaceId] }),
          qc.invalidateQueries({ queryKey: ["finance-dashboard", workspaceId] }),
          qc.invalidateQueries({ queryKey: ["invoices", workspaceId] }),
          qc.invalidateQueries({ queryKey: ["contracts", workspaceId] }),
          qc.invalidateQueries({ queryKey: ["accounts", workspaceId] }),
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <section className="border border-border rounded-md p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Importar desde sistema comercial</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Trae accounts, contratos, facturas y pagos desde el endpoint legacy y los inserta en el workspace seleccionado.
            No crea proyectos, sprints, fases, tareas ni handoffs. Es idempotente: re-ejecutar actualiza en vez de duplicar (matching por id legacy).
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Workspace destino</label>
          <Select value={workspaceId} onValueChange={setWorkspaceId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Selecciona workspace…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={loading || !workspaceId} onClick={() => go(true)}>
            {loading ? "..." : "Previsualizar (dry-run)"}
          </Button>
          <Button size="sm" disabled={loading || !workspaceId} onClick={() => go(false)}>
            {loading ? "Importando..." : "Importar ahora"}
          </Button>
        </div>
      </section>

      {error && (
        <section className="border border-destructive/40 bg-destructive/5 rounded-md p-4 text-sm text-destructive">
          {error}
        </section>
      )}

      {result && (
        <section className="border border-border rounded-md p-4 space-y-3">
          <h3 className="text-sm font-semibold">
            {result.dryRun ? "Vista previa" : "Resultado"}
          </h3>
          <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-[60vh]">
            {JSON.stringify(result, null, 2)}
          </pre>
          {!result.dryRun && selected ? (
            <Button
              size="sm"
              onClick={() =>
                navigate({
                  to: "/w/$workspaceSlug/finance/payments",
                  params: { workspaceSlug: selected.slug },
                })
              }
            >
              Ver facturación
            </Button>
          ) : null}
        </section>
      )}

      <EscImportSection />
      <WrikeImportSection workspaceId={workspaceId} />
    </div>
  );
}

// ============================================================
// ESC (Escuela de Comercio) importer — Wrike xlsx
// ============================================================

function EscImportSection() {
  const setupFn = useServerFn(setupEscContractAndProject);
  const importFn = useServerFn(importEscTasksFromXlsx);
  const ghostFn = useServerFn(createEscGhostUser);

  const [busy, setBusy] = useState<null | "setup-dry" | "setup" | "import-dry" | "import" | "ghost">(null);
  const [projectId, setProjectId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runSetup(dryRun: boolean) {
    setBusy(dryRun ? "setup-dry" : "setup");
    setErr(null);
    setOutput(null);
    try {
      const r = await setupFn({ data: { dryRun } });
      setOutput(r);
      if (!dryRun && "projectId" in r && r.projectId) setProjectId(r.projectId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function fileToBase64(f: File): Promise<string> {
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function runImport(dryRun: boolean) {
    if (!file) {
      setErr("Sube el archivo .xlsx primero");
      return;
    }
    if (!projectId) {
      setErr("Falta el projectId (corre primero el setup o pégalo).");
      return;
    }
    setBusy(dryRun ? "import-dry" : "import");
    setErr(null);
    setOutput(null);
    try {
      const b64 = await fileToBase64(file);
      const r = await importFn({ data: { projectId, fileBase64: b64, dryRun } });
      setOutput(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border border-border rounded-md p-4 space-y-4 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold">Escuela de Comercio — Wrike xlsx</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Paso 1: completa el contrato RaaS (quincenal, 25 h/sprint) y crea el proyecto ESC - RaaS 2026.
          Paso 2: sube el export de Wrike y crea/actualiza las tareas por sprint.
          Es idempotente por <code>wrike:&lt;Key&gt;</code>.
        </p>
      </div>

      <div className="border border-dashed rounded-md p-3 space-y-2">
        <div className="text-xs font-medium">Paso 1 · Contrato + proyecto</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => runSetup(true)}>
            {busy === "setup-dry" ? "..." : "Dry-run setup"}
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => runSetup(false)}>
            {busy === "setup" ? "Ejecutando..." : "Ejecutar setup"}
          </Button>
        </div>
      </div>

      <div className="border border-dashed rounded-md p-3 space-y-2">
        <div className="text-xs font-medium">Ghost user (ex-empleados)</div>
        <p className="text-xs text-muted-foreground">
          Crea una cuenta ficticia para preservar el historial de asignaciones de alguien que ya no trabaja acá.
          Email sugerido: <code>dominique.ghost@rielapp.local</code>. Idempotente.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("ghost");
            setErr(null);
            setOutput(null);
            try {
              const r = await ghostFn({
                data: {
                  email: "dominique.ghost@rielapp.local",
                  fullName: "Dominique Oyarce Díaz (ex)",
                },
              });
              setOutput(r);
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "ghost" ? "Creando..." : "Crear ghost user para Dominique"}
        </Button>
      </div>

      <div className="border border-dashed rounded-md p-3 space-y-2">
        <div className="text-xs font-medium">Paso 2 · Importar tareas</div>
        <div className="space-y-1.5">
          <label className="text-xs">Project ID</label>
          <Input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Se llena solo con el setup"
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs">Archivo .xlsx</label>
          <Input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => runImport(true)}>
            {busy === "import-dry" ? "..." : "Dry-run import"}
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => runImport(false)}>
            {busy === "import" ? "Importando..." : "Importar tareas"}
          </Button>
        </div>
      </div>

      {err && (
        <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 text-xs text-destructive whitespace-pre-wrap">
          {err}
        </div>
      )}
      {output != null && (
        <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-[60vh]">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </section>
  );
}

// ============================================================
// Wrike importer genérico (multi-contrato)
// ============================================================

function WrikeImportSection({ workspaceId }: { workspaceId: string }) {
  const listFn = useServerFn(listContractsForImport);
  const importFn = useServerFn(importWrikeContract);

  const contracts = useQuery({
    queryKey: ["wrike-import-contracts", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
    enabled: !!workspaceId,
  });

  const [contractId, setContractId] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [cadence, setCadence] = useState<"weekly" | "biweekly" | "monthly">("biweekly");
  const [phaseName, setPhaseName] = useState<string>("");
  const [sprintMode, setSprintMode] = useState<"folders" | "by_date">("folders");
  const [sprintStart, setSprintStart] = useState<string>("");
  const [sprintEnd, setSprintEnd] = useState<string>("");
  const [hoursPerSprint, setHoursPerSprint] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "dry" | "run">(null);
  const [output, setOutput] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  const listProjectsFn = useServerFn(listContractProjects);
  const contractProjects = useQuery({
    queryKey: ["contract-projects", contractId],
    queryFn: () => listProjectsFn({ data: { contractId } }),
    enabled: !!contractId,
  });

  const selectedContract = (contracts.data ?? []).find((c) => c.id === contractId);
  useEffect(() => {
    if (selectedContract && !projectName) {
      setProjectName(`${selectedContract.accountName ?? selectedContract.name} — Wrike`);
    }
  }, [selectedContract, projectName]);

  async function fileToBase64(f: File): Promise<string> {
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function go(dryRun: boolean) {
    if (!contractId) { setErr("Elige un contrato"); return; }
    if (!file) { setErr("Sube el .xlsx de Wrike"); return; }
    if (!projectName.trim()) { setErr("Nombre de proyecto requerido"); return; }
    setBusy(dryRun ? "dry" : "run");
    setErr(null);
    setOutput(null);
    try {
      const b64 = await fileToBase64(file);
      const r = await importFn({
        data: {
          contractId,
          projectName: projectName.trim(),
          targetProjectId: targetProjectId || undefined,
          projectColor: "#6366f1",
          sprintCadence: cadence,
          phaseName: phaseName.trim() || undefined,
          sprintMode,
          sprintStartDate: sprintStart || undefined,
          sprintEndDate: sprintEnd || undefined,
          hoursPerSprint: hoursPerSprint ? Number(hoursPerSprint) : undefined,
          fileBase64: b64,
          dryRun,
        },
      });
      setOutput(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border border-border rounded-md p-4 space-y-4 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold">Importar contrato desde Wrike (genérico)</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Elige un contrato existente y sube el export .xlsx de Wrike. El importador
          descubre los sprints desde los folders del export (usando <code>Horas contratadas</code>),
          mapea estados/asignados, y crea o actualiza el proyecto e ideas de tareas. Idempotente por <code>wrike:&lt;Key&gt;</code>.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs">Contrato</label>
        <Select value={contractId} onValueChange={setContractId}>
          <SelectTrigger className="text-xs"><SelectValue placeholder="Selecciona contrato" /></SelectTrigger>
          <SelectContent>
            {(contracts.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.accountName ? `${c.accountName} — ` : ""}{c.name} · {c.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(contractProjects.data ?? []).length > 1 && (
        <div className="space-y-1.5">
          <label className="text-xs">Proyecto interno destino</label>
          <Select value={targetProjectId} onValueChange={setTargetProjectId}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Elige el proyecto interno" />
            </SelectTrigger>
            <SelectContent>
              {(contractProjects.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.is_primary ? " · principal" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            El contrato tiene varias líneas. Las tareas y sprints del export se
            cargan en el proyecto elegido.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs">Nombre del proyecto</label>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="text-xs" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs">Cadencia sprints</label>
          <Select value={cadence} onValueChange={(v) => setCadence(v as typeof cadence)}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="biweekly">Quincenal</SelectItem>
              <SelectItem value="monthly">Mensual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs">Fase / línea de negocio (opcional)</label>
          <Input
            value={phaseName}
            onChange={(e) => setPhaseName(e.target.value)}
            placeholder="Ej: Performance Marketing"
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs">Asignación de sprints</label>
          <Select value={sprintMode} onValueChange={(v) => setSprintMode(v as typeof sprintMode)}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="folders">Desde folders del export</SelectItem>
              <SelectItem value="by_date">Por fecha (grilla del contrato)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {sprintMode === "by_date" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs">Inicio grilla</label>
            <Input type="date" value={sprintStart} onChange={(e) => setSprintStart(e.target.value)} className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs">Fin grilla</label>
            <Input type="date" value={sprintEnd} onChange={(e) => setSprintEnd(e.target.value)} className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs">Horas por sprint</label>
            <Input
              type="number"
              min={0}
              value={hoursPerSprint}
              onChange={(e) => setHoursPerSprint(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs">Archivo .xlsx</label>
        <Input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => go(true)}>
          {busy === "dry" ? "..." : "Dry-run"}
        </Button>
        <Button size="sm" disabled={busy !== null} onClick={() => go(false)}>
          {busy === "run" ? "Importando..." : "Importar"}
        </Button>
      </div>

      {err && (
        <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 text-xs text-destructive whitespace-pre-wrap">
          {err}
        </div>
      )}
      {output != null && (
        <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-[60vh]">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </section>
  );
}
