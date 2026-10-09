import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MarketingPhaseDialog,
  type MarketingPhaseFormValue,
} from "./MarketingPhaseDialog";

export type MarketingPhase = {
  id: string;
  name: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
};

export function MarketingPhasesBar({
  phases,
  members,
  selectedPhaseId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  saving,
}: {
  phases: MarketingPhase[];
  members: Array<{ user_id: string; profile: { id: string; full_name?: string | null; email?: string | null } | null }>;
  selectedPhaseId: string | null | "_none";
  onSelect: (id: string | null | "_none") => void;
  onCreate: (v: MarketingPhaseFormValue) => void;
  onUpdate: (id: string, v: MarketingPhaseFormValue) => void;
  onDelete: (id: string) => void;
  saving?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<MarketingPhase | null>(null);

  const openNew = () => {
    setEditingPhase(null);
    setDialogOpen(true);
  };
  const openEdit = (p: MarketingPhase) => {
    setEditingPhase(p);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPhase(null);
  };

  return (
    <div className="border-b border-border px-6 py-2 flex items-center gap-1.5 overflow-x-auto">
      <ChipButton
        active={selectedPhaseId === null}
        onClick={() => onSelect(null)}
        label="Todas"
      />
      {phases.map((p) => (
        <div key={p.id} className="group relative">
          <ChipButton
            active={selectedPhaseId === p.id}
            onClick={() => onSelect(p.id)}
            label={p.name}
            color={p.color}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(p);
            }}
            className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            aria-label="Editar fase"
          >
            <Pencil className="w-2 h-2" />
          </button>
        </div>
      ))}
      <ChipButton
        active={selectedPhaseId === "_none"}
        onClick={() => onSelect("_none")}
        label="Sin fase"
        muted
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={openNew}
      >
        <Plus className="w-3 h-3 mr-1" /> Nueva fase
      </Button>

      {dialogOpen && (
        <MarketingPhaseDialog
          open
          initial={
            editingPhase
              ? {
                  id: editingPhase.id,
                  name: editingPhase.name,
                  color: editingPhase.color,
                  startDate: editingPhase.start_date,
                  endDate: editingPhase.end_date,
                  ownerId: editingPhase.owner_id,
                }
              : null
          }
          members={members}
          saving={saving}
          onClose={closeDialog}
          onDelete={
            editingPhase
              ? () => {
                  onDelete(editingPhase.id);
                  closeDialog();
                }
              : undefined
          }
          onSave={(v) => {
            if (editingPhase) onUpdate(editingPhase.id, v);
            else onCreate(v);
            closeDialog();
          }}
        />
      )}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  label,
  color,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | null;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 px-2.5 rounded-full text-[11px] font-medium border transition-colors flex items-center gap-1.5 shrink-0 ${
        active
          ? "bg-pink-500/15 border-pink-500/40 text-foreground"
          : muted
            ? "bg-transparent border-dashed border-border/60 text-muted-foreground hover:text-foreground"
            : "bg-muted/40 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
      )}
      {label}
    </button>
  );
}
