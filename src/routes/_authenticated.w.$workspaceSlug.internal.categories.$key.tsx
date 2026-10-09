import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Folder } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { listInternalCategories, listInternalProjects } from "@/lib/api/internal.functions";
import { createProject } from "@/lib/api/projects.functions";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RouteError } from "@/components/tasko/RouteError";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceSlug/internal/categories/$key",
)({
  ssr: false,
  head: () => ({ meta: [{ title: "Categoría interna · Riel" }] }),
  errorComponent: RouteError,
  component: InternalCategoryPage,
});

function InternalCategoryPage() {
  const { workspaceSlug, key } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchCats = useServerFn(listInternalCategories);
  const fetchProjects = useServerFn(listInternalProjects);
  const createProj = useServerFn(createProject);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const perms = usePermissions(wsQ.data?.id);
  const canManage = perms.has("internal_manage");

  const catsQ = useQuery({
    queryKey: ["internal-cats", wsQ.data?.id],
    queryFn: () => fetchCats({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });
  const category = (catsQ.data ?? []).find((c) => c.key === key);

  const projsQ = useQuery({
    queryKey: ["internal-projects", wsQ.data?.id, category?.id ?? null],
    queryFn: () =>
      fetchProjects({
        data: { workspaceId: wsQ.data!.id, categoryId: category!.id },
      }),
    enabled: !!wsQ.data?.id && !!category?.id,
  });

  const [newName, setNewName] = useState("");
  const createMut = useMutation({
    mutationFn: () =>
      createProj({
        data: {
          workspaceId: wsQ.data!.id,
          name: newName.trim(),
          area: "internal",
          internalCategoryId: category!.id,
          color: category!.color ?? "#0ea5e9",
        },
      }),
    onSuccess: (proj) => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["internal-projects"] });
      toast.success("Proyecto creado");
      navigate({
        to: "/w/$workspaceSlug/internal/projects/$projectId",
        params: { workspaceSlug, projectId: proj!.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-3">
        <Link
          to="/w/$workspaceSlug/internal"
          params={{ workspaceSlug }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Interno
        </Link>
        <span className="text-muted-foreground">›</span>
        <h1 className="text-sm font-semibold">{category?.name ?? key}</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-5 max-w-3xl">
        {canManage && category && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim().length === 0) return;
              createMut.mutate();
            }}
          >
            <Input
              placeholder={`Nuevo proyecto en ${category.name}...`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={createMut.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Crear
            </Button>
          </form>
        )}

        {(projsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Aún no hay proyectos en esta categoría.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {(projsQ.data ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  to="/w/$workspaceSlug/internal/projects/$projectId"
                  params={{ workspaceSlug, projectId: p.id }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <Folder className="w-4 h-4 shrink-0" style={{ color: p.color ?? "#0ea5e9" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {p.description && (
                      <div className="text-[11px] text-muted-foreground truncate">{p.description}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
