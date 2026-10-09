import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { workspacesQO, myTasksQO } from "@/lib/api/tasko.queries";
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

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Inicio</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-8 max-w-5xl">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Hola 👋</h2>
          <p className="text-sm text-muted-foreground">
            Tienes <span className="text-foreground font-medium">{tasks.length}</span> tareas
            asignadas
            {overdue > 0 && (
              <>
                {" · "}
                <span className="text-destructive font-medium">{overdue} atrasadas</span>
              </>
            )}
            {dueToday > 0 && (
              <>
                {" · "}
                <span className="text-foreground font-medium">{dueToday} para hoy</span>
              </>
            )}
            .
          </p>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Tus espacios
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workspaces.map((w) => (
              <Link
                key={w.id}
                to="/w/$workspaceSlug"
                params={{ workspaceSlug: w.slug }}
                preload="intent"
                className="border border-border rounded-md p-4 hover:border-primary/50 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: w.color ?? "#8b5cf6" }}
                  />
                  <span className="text-sm font-medium flex-1 truncate">{w.name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {w.kind === "operations" ? "Ops" : "Int"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
