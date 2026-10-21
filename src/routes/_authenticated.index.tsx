import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { workspacesQO, myTasksQO, profileQO } from "@/lib/api/tasko.queries";
import { CheckSquare, ChevronRight, AlertTriangle, CalendarDays } from "lucide-react";
import { RouteError } from "@/components/tasko/RouteError";
import { MyTasksSkeleton } from "@/components/tasko/Skeletons";

export const Route = createFileRoute("/_authenticated/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Inicio · Riel" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(workspacesQO()),
      context.queryClient.ensureQueryData(myTasksQO()),
    ]);
    return null;
  },
  pendingComponent: () => (
    <div className="p-6 max-w-5xl">
      <MyTasksSkeleton />
    </div>
  ),
  errorComponent: RouteError,
  component: GlobalHome,
});

function GlobalHome() {
  const { data: workspaces } = useSuspenseQuery(workspacesQO());
  const { data: tasks } = useSuspenseQuery(myTasksQO());

  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today).length;
  const dueToday = tasks.filter((t) => t.due_date === today).length;

  const { data: profile } = useQuery(profileQO());
  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ?? profile?.email?.split("@")[0] ?? "";
  const dateLabel = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const stats = [
    { label: "Asignadas", value: tasks.length, icon: CheckSquare, tone: "" },
    {
      label: "Atrasadas",
      value: overdue,
      icon: AlertTriangle,
      tone: overdue > 0 ? "text-destructive" : "",
    },
    { label: "Para hoy", value: dueToday, icon: CalendarDays, tone: "" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Inicio</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-8 w-full max-w-5xl">
        <section>
          <p className="text-xs text-muted-foreground capitalize mb-1">{dateLabel}</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Hola{firstName ? `, ${firstName}` : ""} 👋
          </h2>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map((st) => (
            <Link
              key={st.label}
              to="/my-tasks"
              className="group border border-border bg-card rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{st.label}</span>
                <st.icon className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className={`mt-2 text-3xl font-semibold tabular-nums ${st.tone}`}>
                {st.value}
              </div>
            </Link>
          ))}
        </section>

        <section>
          <h3 className="section-label mb-3">Tus espacios</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workspaces.map((w) => (
              <Link
                key={w.id}
                to="/w/$workspaceSlug"
                params={{ workspaceSlug: w.slug }}
                preload="intent"
                className="group flex items-center gap-3 border border-border bg-card rounded-lg p-4 hover:border-primary/50 transition-colors"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: w.color ?? "#8b5cf6" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {w.kind === "operations" ? "Operaciones" : "Interno"}
                  </div>
                </div>
                <ChevronRight
                  className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
