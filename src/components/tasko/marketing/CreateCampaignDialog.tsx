import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCampaign } from "@/lib/api/marketing-campaigns.functions";
import {
  applyCampaignTemplate,
  listCampaignTemplates,
} from "@/lib/api/marketing-templates.functions";

export function CreateCampaignDialog({
  workspaceId,
  workspaceSlug,
  onClose,
}: {
  workspaceId: string;
  workspaceSlug: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listTemplatesFn = useServerFn(listCampaignTemplates);
  const applyTemplateFn = useServerFn(applyCampaignTemplate);
  const createFn = useServerFn(createCampaign);

  const templatesQ = useQuery({
    queryKey: ["campaign-templates", workspaceId],
    queryFn: () => listTemplatesFn({ data: { workspaceId } }),
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null); // null = "en blanco"
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [launchDate, setLaunchDate] = useState(today);

  const createMut = useMutation({
    mutationFn: async () => {
      if (selectedTemplateId) {
        return applyTemplateFn({
          data: {
            workspaceId,
            templateId: selectedTemplateId,
            name,
            launchDate,
            objective: objective || undefined,
          },
        });
      }
      const c = await createFn({
        data: {
          workspaceId,
          name,
          objective: objective || undefined,
          launchDate,
          status: "planning",
        },
      });
      return { campaignId: c.id };
    },
    onSuccess: ({ campaignId }) => {
      qc.invalidateQueries({ queryKey: ["campaigns", workspaceId] });
      qc.invalidateQueries({ queryKey: ["marketing-dashboard", workspaceId] });
      toast.success("Campaña creada");
      onClose();
      navigate({
        to: "/w/$workspaceSlug/marketing/campaigns/$campaignId",
        params: { workspaceSlug, campaignId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva campaña</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Empezar desde
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <TemplateCard
                selected={selectedTemplateId === null}
                onClick={() => setSelectedTemplateId(null)}
                title="En blanco"
                desc="Solo la campaña, sin piezas prellenadas."
              />
              {(templatesQ.data ?? []).map((t) => (
                <TemplateCard
                  key={t.id}
                  selected={selectedTemplateId === t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  title={t.name}
                  desc={t.description ?? undefined}
                  badge={`${(t.pieces_json as unknown[])?.length ?? 0} piezas`}
                  isSystem={t.is_system}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="camp-name" className="text-xs">
                Nombre
              </Label>
              <Input
                id="camp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Lanzamiento producto Q3"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="camp-launch" className="text-xs">
                Fecha de lanzamiento
              </Label>
              <Input
                id="camp-launch"
                type="date"
                value={launchDate}
                onChange={(e) => setLaunchDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="camp-obj" className="text-xs">
              Objetivo (opcional)
            </Label>
            <Textarea
              id="camp-obj"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ej: Generar 200 MQLs y 30 demos calificadas"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>
            {createMut.isPending ? "Creando…" : "Crear campaña"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  selected,
  onClick,
  title,
  desc,
  badge,
  isSystem,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
  badge?: string;
  isSystem?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border p-3 transition-colors ${
        selected ? "border-pink-500 bg-pink-500/10" : "border-border bg-card hover:bg-accent/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium truncate">{title}</div>
        {badge && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {badge}
          </span>
        )}
      </div>
      {desc && (
        <div className="text-[11px] text-muted-foreground leading-snug mt-1 line-clamp-2">
          {desc}
        </div>
      )}
      {isSystem && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-pink-400">
          <Sparkles className="w-2.5 h-2.5" /> Template Riel
        </div>
      )}
    </button>
  );
}
