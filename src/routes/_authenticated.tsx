import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCanViewReports } from "@/lib/reports-access";
import { amISuperAdmin as amISuperAdminFn } from "@/lib/api/me.functions";
import { authUserQO } from "@/lib/api/auth.queries";
import { profileQO, workspacesQO } from "@/lib/api/tasko.queries";
import { usePermissions } from "@/lib/permissions";
import { useActiveSpace, useDerivedArea, AREAS, type Space, type Area } from "@/lib/active-space";
import { Button } from "@/components/ui/button";
import { CheckSquare, LogOut, Folder, Inbox, Settings, Users, Search, Clock, BarChart3, FileBarChart, Building2, FileText, DollarSign, Briefcase, Shield, Wallet, Megaphone, ArrowLeftRight, Receipt, ChevronDown, Check, Handshake, RefreshCcw, Percent, CalendarDays, GraduationCap, CalendarHeart, Coffee } from "lucide-react";
import { pendingHandoffsCountQO } from "@/lib/api/tasko.queries";
import { inboxPendingCount } from "@/lib/api/calendar.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


import { toast } from "sonner";
import { CommandPalette } from "@/components/tasko/CommandPalette";
import { ShortcutsDialog } from "@/components/tasko/ShortcutsDialog";
import { TimerPill } from "@/components/tasko/TimerPill";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { ProjectTree } from "@/components/tasko/tree/ProjectTree";
import { useHotkey, useHotkeySequence } from "@/hooks/use-hotkeys";
import rielLogo from "@/assets/riel-logo.svg";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    if (typeof window === "undefined") return;
    // Revalidate with the auth server so a revoked/expired session is detected.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      await context.queryClient.cancelQueries();
      context.queryClient.clear();
      try { await supabase.auth.signOut(); } catch {}
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    context.queryClient.setQueryData(["auth-user"], data.user.id);
  },
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const profileQuery = useQuery(profileQO());
  const workspacesQuery = useQuery(workspacesQO());

  const bootstrapError =
    workspacesQuery.data && workspacesQuery.data.length === 0
      ? "No tienes acceso a ningún espacio de trabajo. Pide a un administrador que te invite."
      : null;


  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentSlug = pathname.match(/^\/w\/([^/]+)/)?.[1];
  const currentWs =
    workspacesQuery.data?.find((w) => w.slug === currentSlug) ?? workspacesQuery.data?.[0];

  useEffect(() => {
    if (!currentWs) return;
    if (currentSlug && currentSlug !== currentWs.slug) {
      navigate({ to: "/w/$workspaceSlug", params: { workspaceSlug: currentWs.slug }, replace: true });
    }
  }, [currentSlug, currentWs, navigate]);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    queryClient.removeQueries({ queryKey: ["auth-user"] });
    toast.success("Sesión cerrada");
    navigate({ to: "/login", search: { redirect: "/" } });
  };

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useHotkey("?", () => setShortcutsOpen(true), { enabled: !!currentWs });
  useHotkeySequence(["g", "h"], () =>
    currentWs && navigate({ to: "/w/$workspaceSlug", params: { workspaceSlug: currentWs.slug } }),
  );
  useHotkeySequence(["g", "m"], () => navigate({ to: "/my-tasks" }));

  useHotkeySequence(["g", "p"], () =>
    currentWs && navigate({ to: "/w/$workspaceSlug/projects", params: { workspaceSlug: currentWs.slug } }),
  );
  useHotkeySequence(["g", "t"], () => navigate({ to: "/admin/users" }));

  if (!currentWs) {
    if (bootstrapError) {
      return (
        <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
          {bootstrapError}
        </div>
      );
    }
    return <AppShellSkeleton />;
  }

  const initial =
    profileQuery.data?.full_name?.[0]?.toUpperCase() ??
    profileQuery.data?.email?.[0]?.toUpperCase() ??
    "T";

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <aside className="w-72 h-screen border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col overflow-hidden">

        <div className="px-4 h-14 flex items-center gap-2.5 border-b border-sidebar-border">
          <img src={rielLogo} alt="Riel" className="h-7 w-7 object-contain shrink-0" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-semibold text-sm flex items-center gap-1.5">
              Riel
              {currentWs.slug.includes("sandbox") && (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Sandbox
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground truncate">Donde corre nuestra operación</span>
          </div>
        </div>

        <nav className="px-2 pt-2 space-y-0.5">
          <SidebarLink
            to="/"
            params={{}}
            icon={<Inbox className="w-4 h-4" />}
            label="Inicio"
            active={pathname === "/"}
          />
          <SidebarLink
            to="/my-tasks"
            params={{}}
            icon={<CheckSquare className="w-4 h-4" />}
            label="Mis tareas"
            active={pathname.startsWith("/my-tasks")}
          />
          <SidebarLink
            to="/my-time"
            params={{}}
            icon={<Clock className="w-4 h-4" />}
            label="Mi tiempo"
            active={pathname.startsWith("/my-time") || pathname.endsWith("/my-time")}
          />
          <SidebarLink
            to="/w/$workspaceSlug/my-team"
            params={{ workspaceSlug: currentWs.slug }}
            icon={<Users className="w-4 h-4" />}
            label="Mi equipo"
            active={pathname === `/w/${currentWs.slug}/my-team`}
          />
          <CalendarInboxLink
            workspaceId={currentWs.id}
            slug={currentWs.slug}
            active={pathname === `/w/${currentWs.slug}/inbox`}
          />
          <ReportsSidebarLink
            workspaceId={currentWs.id}
            slug={currentWs.slug}
            active={pathname.startsWith(`/w/${currentWs.slug}/reports`)}
          />
        </nav>



        <WorkspacePicker
          workspaces={workspacesQuery.data ?? []}
          currentWs={currentWs}
        />

        <AreaSwitcher
          workspaces={workspacesQuery.data ?? []}
          currentWs={currentWs}
          pathname={pathname}
        />




        <div className="px-2">
          <ClientFilter workspaceId={currentWs.id} workspaceSlug={currentWs.slug} />
        </div>

        <nav className="px-2 mt-2 space-y-0.5 flex-1 overflow-y-auto">
          <SidebarNav workspace={currentWs} pathname={pathname} />
        </nav>




        <UserMenuFooter
          initial={initial}
          fullName={profileQuery.data?.full_name ?? null}
          email={profileQuery.data?.email ?? null}
          onLogout={handleLogout}
        />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative h-screen overflow-y-auto">
        <div className="absolute top-2 right-3 z-30 flex items-center gap-2">
          <NotificationsBell />
          <TimerPill workspaceSlug={currentWs.slug} workspaceId={currentWs.id} />
        </div>
        <Outlet />
      </main>
      <CommandPalette
        workspaceId={currentWs.id}
        workspaceSlug={currentWs.slug}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}




function SidebarLink({
  to,
  params,
  icon,
  label,
  active,
}: {
  to: string;
  params: Record<string, string>;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      params={params}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function HandoffsSidebarLink({
  workspaceId,
  slug,
  active,
}: {
  workspaceId: string;
  slug: string;
  active: boolean;
}) {
  const { data } = useQuery(pendingHandoffsCountQO(workspaceId));
  const count = data?.count ?? 0;
  return (
    <Link
      to="/w/$workspaceSlug/handoffs"
      params={{ workspaceSlug: slug }}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <Handshake className="w-4 h-4" />
      <span className="flex-1">Handoffs</span>
      {count > 0 && (
        <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-500/20 text-amber-400 min-w-[1.25rem] text-center">
          {count}
        </span>
      )}
    </Link>
  );
}

function ReportsSidebarLink({
  workspaceId,
  slug,
  active,
}: {
  workspaceId: string;
  slug: string;
  active: boolean;
}) {
  const perms = usePermissions(workspaceId);
  const canReports = useCanViewReports();
  if (!perms.has("reports_view") || !canReports) return null;
  return (
    <SidebarLink
      to="/w/$workspaceSlug/reports"
      params={{ workspaceSlug: slug }}
      icon={<FileBarChart className="w-4 h-4" />}
      label="Reportes"
      active={active}
    />
  );
}



function CalendarInboxLink({
  workspaceId,
  slug,
  active,
}: {
  workspaceId: string;
  slug: string;
  active: boolean;
}) {
  const fetchCount = useServerFn(inboxPendingCount);
  const { data } = useQuery({
    queryKey: ["calendar-inbox-count", workspaceId],
    queryFn: () => fetchCount({ data: { workspaceId } }),
    staleTime: 30_000,
  });
  const count = data?.count ?? 0;
  return (
    <Link
      to="/w/$workspaceSlug/inbox"
      params={{ workspaceSlug: slug }}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <CalendarDays className="w-4 h-4" />
      <span className="flex-1">Inbox</span>
      {count > 0 && (
        <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-primary/20 text-primary min-w-[1.25rem] text-center">
          {count}
        </span>
      )}
    </Link>
  );
}





type WsLite = { id: string; slug: string; kind: "operations" | "internal"; name: string; color: string | null };

function WorkspacePicker({
  workspaces,
  currentWs,
}: {
  workspaces: WsLite[];
  currentWs: WsLite;
}) {
  const navigate = useNavigate();
  if (workspaces.length <= 1) return null;

  const isSandbox = (w: WsLite) => w.slug.includes("sandbox");

  return (
    <div className="px-2 pt-3 pb-1">
      <div className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Workspace
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors text-left">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: currentWs.color ?? "#8b5cf6" }}
            />
            <span className="flex-1 text-sm font-medium truncate">{currentWs.name}</span>
            {isSandbox(currentWs) && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                Sandbox
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[15rem]">
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() =>
                navigate({ to: "/w/$workspaceSlug", params: { workspaceSlug: w.slug } })
              }
              className="flex items-center gap-2 py-2"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: w.color ?? "#8b5cf6" }}
              />
              <span className="flex-1 text-sm truncate">{w.name}</span>
              {isSandbox(w) && (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Sandbox
                </span>
              )}
              {w.id === currentWs.id && <Check className="w-3.5 h-3.5 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}



function AreaSwitcher({
  workspaces,
  currentWs,
  pathname,
}: {
  workspaces: WsLite[];
  currentWs: WsLite;
  pathname: string;
}) {
  const navigate = useNavigate();
  const slug = currentWs.slug;
  const perms = usePermissions(currentWs.id);

  const active = useDerivedArea(pathname, currentWs.id);

  type Item = { id: Area; icon: React.ReactNode; show: boolean; onSelect: () => void };
  const items: Item[] = ([
    {
      id: "operations" as const,
      icon: <Briefcase className="w-3.5 h-3.5" />,
      show:
        perms.hasAny(["ops_view", "ops_manage", "workload_view", "reports_view"]) ||
        perms.isLoading,
      onSelect: () =>
        navigate({ to: "/w/$workspaceSlug", params: { workspaceSlug: slug } }),
    },
    {
      id: "marketing" as const,
      icon: <Megaphone className="w-3.5 h-3.5" />,
      show: perms.hasAny(["marketing_view", "marketing_manage"]) || perms.isLoading,
      onSelect: () =>
        navigate({ to: "/w/$workspaceSlug/marketing", params: { workspaceSlug: slug } }),
    },
    {
      id: "internal" as const,
      icon: <Coffee className="w-3.5 h-3.5" />,
      // Interno es visible para todos los miembros del workspace por defecto.
      show: true,
      onSelect: () =>
        navigate({ to: "/w/$workspaceSlug/internal", params: { workspaceSlug: slug } }),
    },
    {
      id: "finance" as const,
      icon: <Wallet className="w-3.5 h-3.5" />,
      show: perms.hasAny(["finance_view", "finance_manage"]) || perms.isLoading,
      onSelect: () =>
        navigate({ to: "/w/$workspaceSlug/finance", params: { workspaceSlug: slug } }),
    },
  ] satisfies Item[]).filter((it) => it.show);


  const activeMeta = AREAS[active];

  return (
    <div className="px-2 pt-2 pb-1">
      <div className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Espacio
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors text-left"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: activeMeta.accent }}
            />
            <span style={{ color: activeMeta.accent }} className="shrink-0">
              {items.find((i) => i.id === active)?.icon}
            </span>
            <span className="flex-1 text-sm font-medium truncate">{activeMeta.label}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[15rem]">
          {items.map((it) => {
            const meta = AREAS[it.id];
            const isActive = active === it.id;
            return (
              <DropdownMenuItem
                key={it.id}
                onSelect={it.onSelect}
                className="flex items-start gap-2 py-2"
              >
                <span style={{ color: meta.accent }} className="mt-0.5 shrink-0">
                  {it.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {meta.description}
                  </div>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 mt-1 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

import { SpaceSwitcher } from "@/components/tasko/SpaceSwitcher";

function SidebarNav({
  workspace,
  pathname,
}: {
  workspace: WsLite;
  pathname: string;
}) {
  const area = useDerivedArea(pathname, workspace.id);

  if (area === "operations") return <OperationsNav workspace={workspace} pathname={pathname} />;
  if (area === "marketing") return <MarketingNav workspace={workspace} pathname={pathname} />;
  if (area === "internal") return <InternalNav workspace={workspace} pathname={pathname} />;
  return <FinanceNav workspace={workspace} pathname={pathname} />;
}

function OperationsNav({
  workspace,
  pathname,
}: {
  workspace: WsLite;
  pathname: string;
}) {
  const slug = workspace.slug;
  const params = { workspaceSlug: slug };
  const startsWith = (p: string) => pathname.startsWith(`/w/${slug}${p}`);
  const perms = usePermissions(workspace.id);
  const { space, setSpace, canSeeAdmin } = useActiveSpace(workspace.id);

  const isOps = workspace.kind === "operations";

  return (
    <>
      {canSeeAdmin && <SpaceSwitcher space={space} setSpace={setSpace} />}

      {space === "work" && (
        <div className="mt-2">



          {isOps && perms.has("ops_view") ? (
            <>
              <div className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Clientes
              </div>
              <ProjectTree workspaceId={workspace.id} workspaceSlug={slug} />
            </>
          ) : (
            !isOps && (
              <SidebarLink
                to="/w/$workspaceSlug/projects"
                params={params}
                icon={<Folder className="w-4 h-4" />}
                label="Proyectos"
                active={startsWith("/projects")}
              />
            )
          )}
        </div>
      )}

      {space === "admin" && canSeeAdmin && (
        <div className="mt-2">
          {isOps && perms.has("ops_view") && (
            <SidebarLink
              to="/w/$workspaceSlug/accounts"
              params={params}
              icon={<Building2 className="w-4 h-4" />}
              label="Clientes"
              active={startsWith("/accounts")}
            />
          )}
          {isOps && perms.has("ops_view") && (
            <SidebarLink
              to="/w/$workspaceSlug/finance/contracts"
              params={params}
              icon={<FileText className="w-4 h-4" />}
              label="Contratos"
              active={startsWith("/contracts")}
            />
          )}
          {isOps && perms.has("ops_view") && (
            <HandoffsSidebarLink workspaceId={workspace.id} slug={slug} active={startsWith("/handoffs")} />
          )}
          {perms.has("workload_view") && (
            <SidebarLink
              to="/w/$workspaceSlug/workload"
              params={params}
              icon={<BarChart3 className="w-4 h-4" />}
              label="Carga de trabajo"
              active={startsWith("/workload")}
            />
          )}
          <ReportsSidebarLink
            workspaceId={workspace.id}
            slug={slug}
            active={startsWith("/reports")}
          />
          {perms.hasAny(["admin_settings", "admin_roles", "admin_capacity"]) && (
            <SidebarLink
              to="/w/$workspaceSlug/settings"
              params={params}
              icon={<Settings className="w-4 h-4" />}
              label="Ajustes"
              active={startsWith("/settings")}
            />
          )}
        </div>
      )}
    </>
  );
}

function MarketingNav({
  workspace,
  pathname,
}: {
  workspace: WsLite;
  pathname: string;
}) {
  const slug = workspace.slug;
  const params = { workspaceSlug: slug };
  const perms = usePermissions(workspace.id);
  const startsWith = (p: string) => pathname.startsWith(`/w/${slug}/marketing${p}`);

  return (
    <div className="mt-2 space-y-0.5">
      <SidebarLink
        to="/w/$workspaceSlug/marketing"
        params={params}
        icon={<Inbox className="w-4 h-4" />}
        label="Inicio"
        active={pathname === `/w/${slug}/marketing`}
      />
      <SidebarLink
        to="/w/$workspaceSlug/marketing/grilla"
        params={params}
        icon={<CalendarDays className="w-4 h-4" />}
        label="Grilla"
        active={startsWith("/grilla")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/marketing/campaigns"
        params={params}
        icon={<Megaphone className="w-4 h-4" />}
        label="Campañas"
        active={startsWith("/campaigns")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/marketing/pieces"
        params={params}
        icon={<FileText className="w-4 h-4" />}
        label="Piezas"
        active={startsWith("/pieces")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/marketing/projects"
        params={params}
        icon={<Folder className="w-4 h-4" />}
        label="Proyectos"
        active={startsWith("/projects")}
      />
      {perms.has("marketing_manage") && (
        <>
          <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Gestión
          </div>
          <SidebarLink
            to="/w/$workspaceSlug/marketing/settings/cadencia"
            params={params}
            icon={<CalendarDays className="w-4 h-4" />}
            label="Plantillas de cadencia"
            active={startsWith("/settings/cadencia")}
          />
          <SidebarLink
            to="/w/$workspaceSlug/marketing/settings/pilares"
            params={params}
            icon={<FileText className="w-4 h-4" />}
            label="Pilares"
            active={startsWith("/settings/pilares")}
          />
          <SidebarLink
            to="/w/$workspaceSlug/marketing/settings/channels"
            params={params}
            icon={<Settings className="w-4 h-4" />}
            label="Canales"
            active={startsWith("/settings/channels")}
          />
        </>
      )}
    </div>
  );
}

function InternalNav({
  workspace,
  pathname,
}: {
  workspace: WsLite;
  pathname: string;
}) {
  const slug = workspace.slug;
  const params = { workspaceSlug: slug };
  const startsWith = (p: string) => pathname.startsWith(`/w/${slug}/internal${p}`);
  const perms = usePermissions(workspace.id);

  return (
    <div className="mt-2 space-y-0.5">
      <SidebarLink
        to="/w/$workspaceSlug/internal"
        params={params}
        icon={<Coffee className="w-4 h-4" />}
        label="Inicio"
        active={pathname === `/w/${slug}/internal`}
      />
      <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Categorías
      </div>
      <SidebarLink
        to="/w/$workspaceSlug/internal/categories/$key"
        params={{ workspaceSlug: slug, key: "reuniones" }}
        icon={<Users className="w-4 h-4" />}
        label="Reuniones"
        active={pathname.startsWith(`/w/${slug}/internal/categories/reuniones`)}
      />
      <SidebarLink
        to="/w/$workspaceSlug/internal/categories/$key"
        params={{ workspaceSlug: slug, key: "formacion" }}
        icon={<GraduationCap className="w-4 h-4" />}
        label="Formación"
        active={pathname.startsWith(`/w/${slug}/internal/categories/formacion`)}
      />
      <SidebarLink
        to="/w/$workspaceSlug/internal/categories/$key"
        params={{ workspaceSlug: slug, key: "eventos" }}
        icon={<CalendarHeart className="w-4 h-4" />}
        label="Eventos y comunidad"
        active={pathname.startsWith(`/w/${slug}/internal/categories/eventos`)}
      />
      <SidebarLink
        to="/w/$workspaceSlug/internal/categories/$key"
        params={{ workspaceSlug: slug, key: "admin" }}
        icon={<Settings className="w-4 h-4" />}
        label="Admin y procesos"
        active={pathname.startsWith(`/w/${slug}/internal/categories/admin`)}
      />
      {perms.has("internal_manage") && (
        <>
          <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Gestión
          </div>
          <SidebarLink
            to="/w/$workspaceSlug/internal/settings"
            params={params}
            icon={<Settings className="w-4 h-4" />}
            label="Ajustes"
            active={startsWith("/settings")}
          />
        </>
      )}
    </div>
  );
}


function FinanceNav({
  workspace,
  pathname,
}: {
  workspace: WsLite;
  pathname: string;
}) {
  const slug = workspace.slug;
  const params = { workspaceSlug: slug };
  const startsWith = (p: string) => pathname.startsWith(`/w/${slug}/finance${p}`);
  const perms = usePermissions(workspace.id);

  return (
    <div className="mt-2 space-y-0.5">
      <SidebarLink
        to="/w/$workspaceSlug/finance"
        params={params}
        icon={<DollarSign className="w-4 h-4" />}
        label="Resumen"
        active={pathname === `/w/${slug}/finance`}
      />
      <SidebarLink
        to="/w/$workspaceSlug/accounts"
        params={params}
        icon={<Building2 className="w-4 h-4" />}
        label="Clientes"
        active={pathname.startsWith(`/w/${slug}/accounts`)}
      />
      <SidebarLink
        to="/w/$workspaceSlug/finance/payments"
        params={params}
        icon={<Receipt className="w-4 h-4" />}
        label="Facturación"
        active={startsWith("/payments")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/finance/contracts"
        params={params}
        icon={<FileText className="w-4 h-4" />}
        label="Contratos $$"
        active={startsWith("/contracts")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/finance/renewals"
        params={params}
        icon={<RefreshCcw className="w-4 h-4" />}
        label="Renovaciones"
        active={startsWith("/renewals")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/finance/commissions"
        params={params}
        icon={<Percent className="w-4 h-4" />}
        label="Comisiones"
        active={startsWith("/commissions")}
      />
      <SidebarLink
        to="/w/$workspaceSlug/finance/currencies"
        params={params}
        icon={<ArrowLeftRight className="w-4 h-4" />}
        label="Tipos de cambio"
        active={startsWith("/currencies")}
      />
      <ReportsSidebarLink
        workspaceId={workspace.id}
        slug={slug}
        active={pathname.startsWith(`/w/${slug}/reports`)}
      />
      {perms.hasAny(["admin_settings", "finance_manage"]) && (
        <SidebarLink
          to="/w/$workspaceSlug/finance/settings"
          params={params}
          icon={<Settings className="w-4 h-4" />}
          label="Ajustes"
          active={startsWith("/settings")}
        />
      )}
    </div>
  );
}



function AppShellSkeleton() {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="px-4 h-12 flex items-center gap-2 border-b border-sidebar-border">
          <div className="w-6 h-6 rounded bg-primary/20" />
          <div className="h-3 w-16 rounded bg-muted/40" />
        </div>
        <div className="p-2 space-y-2">
          <div className="h-3 w-20 rounded bg-muted/30 mx-2" />
          <div className="h-7 rounded-md bg-sidebar-accent/60" />
        </div>
        <div className="px-2 mt-2 space-y-1 flex-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-7 rounded-md bg-muted/20" />
          ))}
        </div>
        <div className="border-t border-sidebar-border p-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20" />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-20 rounded bg-muted/40" />
            <div className="h-2 w-28 rounded bg-muted/25" />
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-12 border-b border-border px-4 flex items-center gap-3">
          <div className="h-3 w-32 rounded bg-muted/30" />
        </div>
        <div className="p-6 space-y-3">
          <div className="h-5 w-48 rounded bg-muted/30" />
          <div className="h-4 w-72 rounded bg-muted/20" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted/15 border border-border/40" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ClientFilter({ workspaceSlug }: { workspaceId: string; workspaceSlug: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { q?: string } });
  const accountsBase = `/w/${workspaceSlug}/accounts`;
  const onAccountsList = pathname === accountsBase || pathname === `${accountsBase}/`;
  const q = onAccountsList ? (currentSearch.q ?? "") : "";
  const [localQ, setLocalQ] = useState(q);
  useEffect(() => {
    if (onAccountsList) setLocalQ(currentSearch.q ?? "");
  }, [onAccountsList, currentSearch.q]);

  const update = (value: string) => {
    setLocalQ(value);
    if (onAccountsList) {
      navigate({
        to: "/w/$workspaceSlug/accounts",
        params: { workspaceSlug },
        search: { q: value || undefined },
        replace: true,
      });
    } else {
      navigate({
        to: "/w/$workspaceSlug/accounts",
        params: { workspaceSlug },
        search: { q: value || undefined },
      });
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-sidebar-border/50 bg-sidebar-accent/20 focus-within:border-sidebar-border focus-within:bg-sidebar-accent/40 transition-colors">
      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <input
        value={localQ}
        onChange={(e) => update(e.target.value)}
        placeholder="Filtrar clientes..."
        className="flex-1 bg-transparent outline-none text-xs placeholder:text-muted-foreground min-w-0"
      />
      {localQ && (
        <button
          type="button"
          onClick={() => update("")}
          className="text-[10px] text-muted-foreground hover:text-foreground"
          aria-label="Limpiar"
        >
          ✕
        </button>
      )}
    </div>
  );
}



function UserMenuFooter({
  initial,
  fullName,
  email,
  onLogout,
}: {
  initial: string;
  fullName: string | null;
  email: string | null;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const fetchAdmin = useServerFn(amISuperAdminFn);
  const adminQ = useQuery({
    queryKey: ["am-i-super-admin"],
    queryFn: () => fetchAdmin(),
    staleTime: 60_000,
  });
  const isSuper = adminQ.data?.isSuperAdmin ?? false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full border-t border-sidebar-border p-2 flex items-center gap-2 hover:bg-sidebar-accent/40 transition-colors text-left">
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">
              {fullName ?? "Mi cuenta"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {email}
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-[15rem]">
        <DropdownMenuItem onSelect={() => navigate({ to: "/me/settings" })}>
          <Settings className="w-3.5 h-3.5 mr-2" />
          Mi perfil
        </DropdownMenuItem>
        {isSuper && (
          <DropdownMenuItem onSelect={() => navigate({ to: "/admin" })}>
            <Shield className="w-3.5 h-3.5 mr-2" />
            Ajustes del sistema
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut className="w-3.5 h-3.5 mr-2" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
