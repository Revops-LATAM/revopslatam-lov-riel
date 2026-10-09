import { useState, useEffect, useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Building2,
  FileText,
  Repeat,
  Rocket,
  Layers,
  Archive,
  FolderKanban,
  Share2,
} from "lucide-react";
import { operationsTreeQO, contractChildrenQO } from "@/lib/api/tasko.queries";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AccountShareDialog } from "@/components/tasko/AccountShareDialog";





type Props = {
  workspaceId: string;
  workspaceSlug: string;
};

type ExpansionState = Record<string, boolean>;

function useTreeExpansion(workspaceId: string) {
  const storageKey = `tasko:tree:${workspaceId}`;
  const [state, setState] = useState<ExpansionState>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as ExpansionState) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, storageKey]);
  const toggle = (id: string, fallback = false) =>
    setState((s) => ({ ...s, [id]: !(s[id] ?? fallback) }));
  const isOpen = (id: string, fallback = false) => state[id] ?? fallback;
  const setOpen = (id: string, open: boolean) =>
    setState((s) => ({ ...s, [id]: open }));
  return { isOpen, toggle, setOpen };
}

export function ProjectTree({ workspaceId, workspaceSlug }: Props) {
  const { data: accounts = [], isLoading } = useQuery(operationsTreeQO(workspaceId));
  const { isOpen, toggle, setOpen } = useTreeExpansion(workspaceId);
  const [shareAccountId, setShareAccountId] = useState<string | null>(null);


  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => r.location.search }) as {
    sprint?: string;
    phase?: string;
  };

  // Auto-open ancestors of the active node based on current URL.
  useEffect(() => {
    // Active project route → open its account + contract
    const projMatch = pathname.match(/\/projects\/([0-9a-f-]{36})/i);
    const activeProjectId = projMatch?.[1];
    if (activeProjectId) {
      const account = accounts.find((a) =>
        a.contracts.some((c) => c.project_id === activeProjectId),
      );
      const contract = account?.contracts.find((c) => c.project_id === activeProjectId);
      if (account) setOpen(`a:${account.id}`, true);
      if (contract) setOpen(`c:${contract.id}`, true);
    }
    // Active account route → open it
    const accMatch = pathname.match(/\/accounts\/([0-9a-f-]{36})/i);
    const activeAccountId = accMatch?.[1];
    if (activeAccountId) {
      setOpen(`a:${activeAccountId}`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, accounts.length]);

  // Derive active account id from URL (project route resolves via tree).
  const activeAccountId = (() => {
    const accMatch = pathname.match(/\/accounts\/([0-9a-f-]{36})/i);
    if (accMatch) return accMatch[1];
    const projMatch = pathname.match(/\/projects\/([0-9a-f-]{36})/i);
    if (projMatch) {
      const acc = accounts.find((a) =>
        a.contracts.some((c) => c.project_id === projMatch[1]),
      );
      return acc?.id ?? null;
    }
    return null;
  })();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto py-1">

        {isLoading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Cargando...</p>
        ) : accounts.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No hay clientes con contratos activos.
          </p>
        ) : (
          accounts.map((account) => {
            const accOpen = isOpen(`a:${account.id}`, true);
            const isActiveAccount = activeAccountId === account.id;
            return (
              <div key={account.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-0.5 group">
                      <button
                        onClick={() => toggle(`a:${account.id}`, true)}
                        className="flex-shrink-0 p-1 hover:bg-accent/40 rounded-sm"
                        aria-label={accOpen ? "Colapsar" : "Expandir"}
                      >
                        <Chevron open={accOpen} />
                      </button>
                      <Link
                        to="/w/$workspaceSlug/accounts/$accountId"
                        params={{ workspaceSlug, accountId: account.id }}
                        preload="intent"
                        className={cn(
                          "flex-1 flex items-center gap-1.5 py-1.5 pr-2 rounded-sm hover:bg-accent/40 min-w-0",
                          isActiveAccount && "bg-accent/60",
                        )}
                      >
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-[13px] leading-5 font-medium truncate flex-1">
                          {account.name}
                        </span>
                        <span className="text-[11px] leading-4 font-medium tabular-nums text-muted-foreground">
                          {account.contracts.length}
                        </span>
                      </Link>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => setShareAccountId(account.id)}>
                      <Share2 className="h-3.5 w-3.5 mr-2" />
                      Compartir accesos…
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>


                {accOpen && (
                  <div className="ml-3">
                    {[...account.contracts]
                      .sort((a, b) => {
                        if (a.type !== b.type) return a.type === "implementation" ? -1 : 1;
                        const ad = a.start_date ?? "";
                        const bd = b.start_date ?? "";
                        return ad.localeCompare(bd);
                      })
                      .map((contract) => (
                        <ContractBranch
                          key={contract.id}
                          contract={contract}
                          workspaceSlug={workspaceSlug}
                          pathname={pathname}
                          search={search}
                          isOpen={isOpen}
                          toggle={toggle}
                        />
                      ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {shareAccountId && (
        <AccountShareDialog
          open={!!shareAccountId}
          onOpenChange={(o) => !o && setShareAccountId(null)}
          accountId={shareAccountId}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}



function ContractBranch({
  contract,
  workspaceSlug,
  pathname,
  search,
  isOpen,
  toggle,
}: {
  contract: {
    id: string;
    name: string;
    type: "implementation" | "recurrente";
    start_date?: string | null;
    project_id: string | null;
    open_tasks: number;
    projects_count?: number;
  };
  workspaceSlug: string;
  pathname: string;
  search: { sprint?: string; phase?: string };
  isOpen: (id: string, fallback?: boolean) => boolean;
  toggle: (id: string, fallback?: boolean) => void;
}) {
  const open = isOpen(`c:${contract.id}`);
  const { data: children } = useQuery({
    ...contractChildrenQO(contract.id),
    enabled: open,
  });
  const projectId = contract.project_id;
  const isMultiProject = (contract.projects_count ?? 0) > 1;
  const isActiveContract =
    projectId && pathname.includes(projectId) && !search.sprint && !search.phase;

  return (
    <div>
      <div className="flex items-center gap-0.5 group">
        <button
          onClick={() => toggle(`c:${contract.id}`)}
          className="flex-shrink-0 p-1 hover:bg-accent/40 rounded-sm"
          aria-label={open ? "Colapsar" : "Expandir"}
        >
          <Chevron open={open} />
        </button>
        {isMultiProject ? (
          <Link
            to="/w/$workspaceSlug/contracts/$contractId"
            params={{ workspaceSlug, contractId: contract.id }}
            search={{ tab: "plan" }}
            preload="intent"
            className={cn(
              "flex-1 flex items-center gap-1.5 py-1.5 pr-2 rounded-sm hover:bg-accent/40 min-w-0",
              pathname.includes(contract.id) && "bg-accent/60",
            )}
          >
            {contract.type === "recurrente" ? (
              <Repeat className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-[13px] leading-5 truncate flex-1">{contract.name}</span>
            {contract.open_tasks > 0 && (
              <span className="text-[11px] leading-4 font-medium tabular-nums text-muted-foreground">
                {contract.open_tasks}
              </span>
            )}
          </Link>
        ) : projectId ? (
          <Link
            to="/w/$workspaceSlug/projects/$projectId"
            params={{ workspaceSlug, projectId }}
            preload="intent"
            className={cn(
              "flex-1 flex items-center gap-1.5 py-1.5 pr-2 rounded-sm hover:bg-accent/40 min-w-0",
              isActiveContract && "bg-accent/60",
            )}
          >
            {contract.type === "recurrente" ? (
              <Repeat className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-[13px] leading-5 truncate flex-1">{contract.name}</span>
            {contract.open_tasks > 0 && (
              <span className="text-[11px] leading-4 font-medium tabular-nums text-muted-foreground">
                {contract.open_tasks}
              </span>
            )}
          </Link>
        ) : (
          <span className="flex-1 flex items-center gap-1.5 py-1.5 pr-2 text-[13px] leading-5 text-muted-foreground min-w-0">
            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{contract.name}</span>
            <span className="text-[11px] leading-4 italic">sin proyecto</span>
          </span>
        )}

      </div>

      {open && children && (
        <div className="ml-5">
          {children.projects.length > 1 ? (
            children.projects.map((p) => {
              const pOpen = isOpen(`p:${p.id}`, true);
              const isActiveProject =
                pathname.includes(p.id) && !search.sprint && !search.phase;
              return (
                <div key={p.id}>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => toggle(`p:${p.id}`, true)}
                      className="flex-shrink-0 p-1 hover:bg-accent/40 rounded-sm"
                      aria-label={pOpen ? "Colapsar" : "Expandir"}
                    >
                      <Chevron open={pOpen} />
                    </button>
                    <Link
                      to="/w/$workspaceSlug/projects/$projectId"
                      params={{ workspaceSlug, projectId: p.id }}
                      preload="intent"
                      className={cn(
                        "flex-1 flex items-center gap-1.5 py-1.5 pr-2 rounded-sm hover:bg-accent/40 min-w-0",
                        isActiveProject && "bg-accent/60",
                      )}
                    >
                      <FolderKanban className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-[13px] leading-5 truncate flex-1">{p.name}</span>
                    </Link>
                  </div>
                  {pOpen && (
                    <div className="ml-5">
                      {p.sprints.length > 0 && (
                        <SprintsBranch
                          sprints={p.sprints}
                          contractId={`${contract.id}:${p.id}`}
                          workspaceSlug={workspaceSlug}
                          projectId={p.id}
                          activeSprintId={search.sprint ?? null}
                        />
                      )}
                      {p.phases.map((ph) => (
                        <PhaseLink
                          key={ph.id}
                          phase={ph}
                          projectId={p.id}
                          workspaceSlug={workspaceSlug}
                          active={search.phase === ph.id}
                        />
                      ))}
                      {p.sprints.length === 0 && p.phases.length === 0 && (
                        <p className="px-2 py-1 text-xs text-muted-foreground italic">
                          Sin sprints ni fases
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : projectId ? (
            <>
              {contract.type === "recurrente" && (
                <SprintsBranch
                  sprints={children.sprints}
                  contractId={contract.id}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  activeSprintId={search.sprint ?? null}
                />
              )}

              {contract.type === "implementation" && (
                <>
                  {children.phases.length === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground italic">
                      Sin fases
                    </p>
                  )}
                  {children.phases.map((p) => (
                    <PhaseLink
                      key={p.id}
                      phase={p}
                      projectId={projectId}
                      workspaceSlug={workspaceSlug}
                      active={search.phase === p.id}
                    />
                  ))}
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PhaseLink({
  phase,
  projectId,
  workspaceSlug,
  active,
}: {
  phase: { id: string; name: string; open_tasks: number };
  projectId: string;
  workspaceSlug: string;
  active: boolean;
}) {
  return (
    <Link
      to="/w/$workspaceSlug/projects/$projectId"
      params={{ workspaceSlug, projectId }}
      search={{ phase: phase.id }}
      preload="intent"
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:bg-accent/40 min-w-0",
        active && "bg-primary/15 text-primary",
      )}
    >
      <Layers className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[13px] leading-5 truncate flex-1">{phase.name}</span>
      {phase.open_tasks > 0 && (
        <span className="text-[11px] leading-4 font-medium tabular-nums text-muted-foreground">
          {phase.open_tasks}
        </span>
      )}
    </Link>
  );
}

type SprintNode = {
  id: string;
  sprint_number: number;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  contracted_hours: number | null;
  open_tasks: number;
};

function SprintsBranch({
  sprints,
  contractId,
  workspaceSlug,
  projectId,
  activeSprintId,
}: {
  sprints: SprintNode[];
  contractId: string;
  workspaceSlug: string;
  projectId: string;
  activeSprintId: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const { openSprints, closedSprints } = useMemo(() => {
    const open: SprintNode[] = [];
    const closed: SprintNode[] = [];
    for (const s of sprints) {
      const isClosed =
        s.status === "cerrado" || (s.end_date != null && s.end_date < today);
      if (isClosed) closed.push(s);
      else open.push(s);
    }
    // Closed: most recent first
    closed.sort((a, b) => b.sprint_number - a.sprint_number);
    return { openSprints: open, closedSprints: closed };
  }, [sprints, today]);

  const activeIsClosed = !!(
    activeSprintId && closedSprints.some((s) => s.id === activeSprintId)
  );

  const storageKey = `tree:closed-sprints:${contractId}`;
  const [archiveOpen, setArchiveOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) return raw === "1";
    } catch {
      /* ignore */
    }
    return false;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, archiveOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [archiveOpen, storageKey]);
  // Auto-open archive if the active sprint lives inside it
  useEffect(() => {
    if (activeIsClosed) setArchiveOpen(true);
  }, [activeIsClosed]);

  const renderSprintLink = (s: SprintNode) => {
    const isActive = activeSprintId === s.id;
    const isCurrent =
      s.start_date != null &&
      s.end_date != null &&
      s.start_date <= today &&
      s.end_date >= today;
    return (
      <Link
        key={s.id}
        to="/w/$workspaceSlug/projects/$projectId"
        params={{ workspaceSlug, projectId }}
        search={{ sprint: s.id }}
        preload="intent"
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:bg-accent/40 min-w-0",
          isActive && "bg-primary/15 text-primary",
          isCurrent && !isActive && "text-foreground",
        )}
      >
        <Rocket
          className={cn(
            "w-3.5 h-3.5 flex-shrink-0",
            isCurrent && "text-primary",
          )}
        />
        <span className="text-[13px] leading-5 truncate flex-1">Sprint {s.sprint_number}</span>
        {s.open_tasks > 0 && (
          <span className="text-[11px] leading-4 font-medium tabular-nums text-muted-foreground">{s.open_tasks}</span>
        )}
      </Link>
    );
  };

  if (sprints.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground italic">Sin sprints</p>
    );
  }

  return (
    <>
      {openSprints.map(renderSprintLink)}
      {closedSprints.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-sm hover:bg-accent/40 min-w-0 text-muted-foreground"
            aria-expanded={archiveOpen}
          >
            {archiveOpen ? (
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <Archive className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[13px] leading-5 truncate flex-1 text-left">
              Sprints cerrados
            </span>
            <span className="text-[11px] leading-4 font-medium tabular-nums">{closedSprints.length}</span>
          </button>
          {archiveOpen && (
            <div className="ml-5 opacity-80">
              {closedSprints.map(renderSprintLink)}
            </div>
          )}
        </div>
      )}
    </>
  );
}


function Chevron({ open }: { open: boolean }) {
  return open ? (
    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
  ) : (
    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
  );
}

