import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { myTasksQO } from "@/lib/api/tasko.queries";
import { MyTasksSkeleton } from "@/components/tasko/Skeletons";
import { RouteError } from "@/components/tasko/RouteError";
import { MyTasksList } from "@/components/tasko/MyTasksList";

export const Route = createFileRoute("/_authenticated/my-tasks")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mis tareas · Riel" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(myTasksQO());
    return null;
  },
  pendingComponent: () => (
    <div className="p-6 max-w-3xl">
      <MyTasksSkeleton />
    </div>
  ),
  errorComponent: RouteError,
  component: MyTasksPage,
});

function MyTasksPage() {
  const { data: tasks } = useSuspenseQuery(myTasksQO());
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <div>
          <h1 className="text-sm font-semibold">Mis tareas</h1>
          <p className="text-xs text-muted-foreground">
            Todo lo que tienes asignado, en todos tus espacios.
          </p>
        </div>
      </header>
      <div className="flex-1 overflow-auto px-6 pb-8 pt-2 w-full">
        <MyTasksList tasks={tasks} showWorkspace />
      </div>
    </div>
  );
}
