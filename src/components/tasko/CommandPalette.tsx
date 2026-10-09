import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  searchWorkspace,
  listProjects,
} from "@/lib/api/tasko.functions";
import { Folder, CheckSquare, Inbox, Users, Settings, Home, Building2 } from "lucide-react";

export function CommandPalette({
  workspaceId,
  workspaceSlug,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  workspaceSlug: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const searchFn = useServerFn(searchWorkspace);
  const projectsFn = useServerFn(listProjects);

  const projects = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsFn({ data: { workspaceId } }),
    enabled: open,
  });

  const results = useQuery({
    queryKey: ["search", workspaceId, q],
    queryFn: () => searchFn({ data: { workspaceId, q } }),
    enabled: open && q.trim().length > 0,
  });

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    setTimeout(fn, 50);
  };

  const projectById = new Map((projects.data ?? []).map((p) => [p.id, p]));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar clientes, proyectos, tareas..."
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        {q.trim() === "" && (
          <>
            <CommandGroup heading="Ir a">
              <CommandItem
                onSelect={() =>
                  go(() =>
                    navigate({
                      to: "/w/$workspaceSlug",
                      params: { workspaceSlug },
                    }),
                  )
                }
              >
                <Home className="w-4 h-4 mr-2" /> Inicio
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  go(() =>
                    navigate({
                      to: "/w/$workspaceSlug/my-tasks",
                      params: { workspaceSlug },
                    }),
                  )
                }
              >
                <Inbox className="w-4 h-4 mr-2" /> Mis tareas
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  go(() =>
                    navigate({
                      to: "/w/$workspaceSlug/projects",
                      params: { workspaceSlug },
                    }),
                  )
                }
              >
                <Folder className="w-4 h-4 mr-2" /> Proyectos
              </CommandItem>
              <CommandItem
                onSelect={() => go(() => navigate({ to: "/admin/users" }))}
              >
                <Users className="w-4 h-4 mr-2" /> Usuarios y permisos
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  go(() =>
                    navigate({
                      to: "/w/$workspaceSlug/settings",
                      params: { workspaceSlug },
                    }),
                  )
                }
              >
                <Settings className="w-4 h-4 mr-2" /> Ajustes
              </CommandItem>
            </CommandGroup>
            {projects.data && projects.data.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Proyectos">
                  {projects.data.slice(0, 8).map((p) => (
                    <CommandItem
                      key={p.id}
                      onSelect={() =>
                        go(() =>
                          navigate({
                            to: "/w/$workspaceSlug/projects/$projectId",
                            params: { workspaceSlug, projectId: p.id },
                          }),
                        )
                      }
                    >
                      <span
                        className="w-2 h-2 rounded-full mr-2"
                        style={{ background: p.color ?? "#8b5cf6" }}
                      />
                      {p.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}

        {q.trim() !== "" && results.data && (
          <>
            {results.data.accounts && results.data.accounts.length > 0 && (
              <CommandGroup heading="Clientes">
                {results.data.accounts.map((a) => (
                  <CommandItem
                    key={a.id}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/w/$workspaceSlug/accounts/$accountId",
                          params: { workspaceSlug, accountId: a.id },
                        }),
                      )
                    }
                  >
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.data.projects.length > 0 && (
              <CommandGroup heading="Proyectos">
                {results.data.projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/w/$workspaceSlug/projects/$projectId",
                          params: { workspaceSlug, projectId: p.id },
                        }),
                      )
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full mr-2"
                      style={{ background: p.color ?? "#8b5cf6" }}
                    />
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.data.tasks.length > 0 && (
              <CommandGroup heading="Tareas">
                {results.data.tasks.map((t) => {
                  const proj = projectById.get(t.project_id);
                  return (
                    <CommandItem
                      key={t.id}
                      onSelect={() =>
                        go(() =>
                          navigate({
                            to: "/w/$workspaceSlug/projects/$projectId",
                            params: { workspaceSlug, projectId: t.project_id },
                            search: { task: t.id },
                          }),
                        )
                      }
                    >
                      <CheckSquare className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="flex-1 truncate">{t.title}</span>
                      {proj && (
                        <span className="text-[11px] text-muted-foreground ml-2">
                          {proj.name}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
