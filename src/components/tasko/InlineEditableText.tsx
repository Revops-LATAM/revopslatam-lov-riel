import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Min chars after trim. Default 1. */
  minLength?: number;
  /** Max chars. Default 200. */
  maxLength?: number;
  /** Render the display element as. Default span. */
  as?: "span" | "p" | "h1" | "h2";
  /** Disable editing. */
  disabled?: boolean;
  /**
   * When true (default), the text itself does NOT enter edit mode on click —
   * clicks bubble up so the surrounding row can open the detail drawer.
   * A pencil button (visible on hover / focus) and F2 trigger edit.
   * Same pattern used by ClickUp, Asana, Linear.
   */
  editViaButton?: boolean;
};

/**
 * Inline editable text — ClickUp/Asana/Linear style.
 *
 * Default behavior (editViaButton=true): clicking the text bubbles to the
 * parent row (opens task). A small pencil button appears on hover/focus and
 * enters edit mode without conflicting with the row click. F2 also enters
 * edit mode when the text is keyboard-focused.
 *
 * In edit mode: Enter or blur saves; Esc cancels. Empty/invalid values are
 * reverted to the previous value.
 */
export function InlineEditableText({
  value,
  onSave,
  className,
  inputClassName,
  placeholder = "Sin título",
  ariaLabel,
  minLength = 1,
  maxLength = 200,
  as: As = "span",
  disabled = false,
  editViaButton = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next.length < minLength || next.length > maxLength) {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (next !== value) {
      onSave(next);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const enterEdit = (e?: MouseEvent | KeyboardEvent) => {
    if (disabled) return;
    e?.stopPropagation();
    e?.preventDefault();
    setEditing(true);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        maxLength={maxLength}
        aria-label={ariaLabel}
        className={cn(
          "bg-background border border-primary/40 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-primary/40 w-full",
          inputClassName ?? className,
        )}
      />
    );
  }

  return (
    <span className={cn("group/inline inline-flex items-center gap-1 max-w-full min-w-0", className)}>
      <As
        tabIndex={disabled ? undefined : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "F2") enterEdit(e);
        }}
        onClick={(e) => {
          // editViaButton=false → click on text edits (used in drawer/details).
          // editViaButton=true (default) → let click bubble so the row opens.
          if (disabled || editViaButton) return;
          enterEdit(e);
        }}
        className={cn(
          "truncate min-w-0",
          !disabled && "rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
        )}
      >
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </As>
      {!disabled && editViaButton && (
        <button
          type="button"
          aria-label={ariaLabel ? `Editar ${ariaLabel}` : "Editar"}
          title="Editar (F2)"
          onClick={enterEdit}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground opacity-0 group-hover/inline:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 transition-opacity"
        >
          <Pencil className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
