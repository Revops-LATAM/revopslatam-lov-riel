import { useState } from "react";
import { Plus, Megaphone, FileText, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateCampaignDialog } from "./CreateCampaignDialog";
import { CreatePieceDialog } from "./CreatePieceDialog";
import { CreateMarketingProjectDialog } from "./CreateMarketingProjectDialog";

type Mode = null | "campaign" | "piece" | "project";

export function CreateMarketingItemMenu({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Crear
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => setMode("campaign")} className="py-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-md bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Campaña</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Iniciativa con lanzamiento, KPIs y varias piezas coordinadas.
                </div>
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode("piece")} className="py-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Pieza de contenido</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Un post, blog, video, email o ad. Puede ir sola o dentro de una campaña.
                </div>
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode("project")} className="py-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-md bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                <Folder className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Proyecto</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Iniciativa interna sin fecha de publicación (rediseño web, workshops, etc).
                </div>
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "campaign" && (
        <CreateCampaignDialog
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          onClose={() => setMode(null)}
        />
      )}
      {mode === "piece" && (
        <CreatePieceDialog
          workspaceId={workspaceId}
          onClose={() => setMode(null)}
        />
      )}
      {mode === "project" && (
        <CreateMarketingProjectDialog
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}
