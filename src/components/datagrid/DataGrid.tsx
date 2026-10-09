import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Columns3, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type ColumnDef<TRow> = {
  id: string;
  header: string;
  /** Plain accessor, used for sorting + global search */
  accessor?: (row: TRow) => string | number | null | undefined;
  /** Custom cell renderer; falls back to accessor */
  cell?: (row: TRow) => React.ReactNode;
  width?: number | string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Hide by default; user can toggle via Columns menu */
  defaultHidden?: boolean;
  /** Cannot be hidden (e.g. primary name column) */
  required?: boolean;
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

type ViewState = {
  hidden: Record<string, boolean>;
  sort: SortState;
  q: string;
  widths?: Record<string, number>;
};

const VIEW_PREFIX = "riel:datagrid:";

function loadView(key: string): Partial<ViewState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEW_PREFIX + key);
    return raw ? (JSON.parse(raw) as Partial<ViewState>) : null;
  } catch {
    return null;
  }
}
function saveView(key: string, state: ViewState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_PREFIX + key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export type DataGridProps<TRow> = {
  /** Unique key used to persist view state in localStorage */
  viewKey: string;
  columns: ColumnDef<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  /** Click → select row (single click). */
  onRowClick?: (row: TRow) => void;
  /** Double click / Enter → open detail */
  onRowOpen?: (row: TRow) => void;
  /** Optional rightmost actions slot per row */
  rowActions?: (row: TRow) => React.ReactNode;
  /** Show search input in toolbar */
  searchable?: boolean;
  /** Extra toolbar content (filters etc.) */
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  empty?: React.ReactNode;
  /** Default sort if user has no persisted sort */
  defaultSort?: SortState;
  /** Show leading "#" row-number column (default: true) */
  showRowNumbers?: boolean;
  /** Show leading selection checkbox column (default: true) */
  selectable?: boolean;
  /** Optional callback whenever selection changes (set of row keys) */
  onSelectionChange?: (selectedKeys: string[]) => void;
  /** Optional toolbar slot rendered when selection is non-empty */
  renderSelectionActions?: (selectedRows: TRow[]) => React.ReactNode;
  /** Hide the entire toolbar (search + columns menu). Used when a parent renders a shared toolbar. */
  hideToolbar?: boolean;
  /** Controlled column visibility map. When provided, DataGrid becomes controlled and calls onHiddenChange. */
  hidden?: Record<string, boolean>;
  onHiddenChange?: (next: Record<string, boolean>) => void;
  /** Hide the column header row (thead). Used when a parent renders a shared header. */
  hideHeader?: boolean;
  /** Render at natural height without an internal scroll container or virtualization.
   *  Use when the grid is stacked inside a scrollable parent (e.g. grouped sections). */
  autoHeight?: boolean;
  /** Make rows draggable and expose native HTML5 drag events. */
  rowDraggable?: boolean;
  onRowDragStart?: (row: TRow, e: React.DragEvent<HTMLTableRowElement>) => void;
  onRowDragEnd?: (row: TRow, e: React.DragEvent<HTMLTableRowElement>) => void;
};

export function DataGrid<TRow>({
  viewKey,
  columns,
  rows,
  rowKey,
  onRowClick,
  onRowOpen,
  rowActions,
  searchable = true,
  toolbarLeft,
  toolbarRight,
  empty,
  defaultSort = null,
  showRowNumbers = true,
  selectable = true,
  onSelectionChange,
  renderSelectionActions,
  hideToolbar = false,
  hidden: hiddenProp,
  onHiddenChange,
  hideHeader = false,
  autoHeight = false,
  rowDraggable = false,
  onRowDragStart,
  onRowDragEnd,
}: DataGridProps<TRow>) {
  const persisted = React.useMemo(() => loadView(viewKey), [viewKey]);
  const [hiddenState, setHiddenState] = React.useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const c of columns) if (c.defaultHidden) base[c.id] = true;
    return { ...base, ...(persisted?.hidden ?? {}) };
  });
  const hidden = hiddenProp ?? hiddenState;
  const setHidden: React.Dispatch<React.SetStateAction<Record<string, boolean>>> = (updater) => {
    if (hiddenProp && onHiddenChange) {
      const next =
        typeof updater === "function"
          ? (updater as (h: Record<string, boolean>) => Record<string, boolean>)(hiddenProp)
          : updater;
      onHiddenChange(next);
    } else {
      setHiddenState(updater);
    }
  };
  const [sort, setSort] = React.useState<SortState>(persisted?.sort ?? defaultSort);
  const [q, setQ] = React.useState<string>(persisted?.q ?? "");
  // Debounced value used for filtering — avoids re-filtering large lists on every keystroke.
  const [qDebounced, setQDebounced] = React.useState<string>(q);
  React.useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 150);
    return () => window.clearTimeout(t);
  }, [q]);
  const [widths, setWidths] = React.useState<Record<string, number>>(() => persisted?.widths ?? {});
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    saveView(viewKey, { hidden, sort, q, widths });
  }, [viewKey, hidden, sort, q, widths]);

  // Column resize: pointer-driven, persists width by column id.
  const resizingRef = React.useRef<{ id: string; startX: number; startW: number } | null>(null);
  const onResizeStart = (
    e: React.PointerEvent<HTMLDivElement>,
    colId: string,
    currentW: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizingRef.current = { id: colId, startX: e.clientX, startW: currentW };
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizingRef.current;
    if (!r) return;
    const next = Math.max(60, r.startW + (e.clientX - r.startX));
    setWidths((w) => ({ ...w, [r.id]: next }));
  };
  const onResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizingRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      resizingRef.current = null;
    }
  };

  React.useEffect(() => {
    onSelectionChange?.(Array.from(selected));
  }, [selected, onSelectionChange]);

  const visibleColumns = React.useMemo(
    () => columns.filter((c) => !hidden[c.id]),
    [columns, hidden],
  );

  const filtered = React.useMemo(() => {
    if (!qDebounced.trim()) return rows;
    const needle = qDebounced.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((c) => {
        const v = c.accessor?.(row);
        if (v == null) return false;
        return String(v).toLowerCase().includes(needle);
      }),
    );
  }, [rows, columns, qDebounced]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.accessor) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sort, columns]);

  const toggleSelectedKey = React.useCallback((key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Row virtualization — only render rows near the visible viewport.
  // Row height matches CSS var(--table-row-h) (36px in Riel design tokens).
  const ROW_HEIGHT = 36;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleSort = (col: ColumnDef<TRow>) => {
    if (!col.sortable) return;
    setSort((prev) => {
      if (!prev || prev.id !== col.id) return { id: col.id, dir: "asc" };
      if (prev.dir === "asc") return { id: col.id, dir: "desc" };
      return null;
    });
  };

  return (
    <div className={cn("flex flex-col", autoHeight ? "" : "h-full")}>
      {!hideToolbar && (
        <div className="border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
          {searchable && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className="h-7 w-56 pl-7 pr-7 text-xs"
              />
              {q && (
                <button
                  aria-label="Limpiar búsqueda"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {toolbarLeft}
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <span className="text-[11px] text-muted-foreground">
                  {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
                </span>
                {renderSelectionActions?.(sorted.filter((r) => selected.has(rowKey(r))))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelected(new Set())}
                >
                  Limpiar
                </Button>
              </>
            )}
            {toolbarRight}
            <span className="text-[11px] text-muted-foreground">
              {sorted.length} {sorted.length === 1 ? "fila" : "filas"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Columns3 className="w-3.5 h-3.5" /> Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Mostrar columnas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!hidden[c.id]}
                    disabled={c.required}
                    onCheckedChange={(checked) => setHidden((h) => ({ ...h, [c.id]: !checked }))}
                    className="text-xs"
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <div ref={scrollRef} className={autoHeight ? "" : "flex-1 overflow-auto"}>
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {empty ?? "Sin resultados."}
          </div>
        ) : (
          <table
            className="w-full border-separate border-spacing-0"
            style={{
              fontFamily: "var(--font-table)",
              fontSize: "13px",
              lineHeight: "20px",
              color: "var(--table-text)",
            }}
          >
            {!hideHeader && (
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  {selectable && (
                    <th
                      className="px-2 align-middle bg-background"
                      style={{
                        height: "var(--table-header-h)",
                        width: 32,
                        borderBottom: "1px solid var(--table-divider)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        aria-label="Seleccionar todo"
                        checked={sorted.length > 0 && sorted.every((r) => selected.has(rowKey(r)))}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              for (const r of sorted) next.add(rowKey(r));
                            } else {
                              for (const r of sorted) next.delete(rowKey(r));
                            }
                            return next;
                          });
                        }}
                      />
                    </th>
                  )}
                  {showRowNumbers && (
                    <th
                      className="px-2 text-right align-middle font-normal bg-background select-none"
                      style={{
                        height: "var(--table-header-h)",
                        width: 40,
                        fontSize: "12px",
                        color: "var(--table-text-muted)",
                        borderBottom: "1px solid var(--table-divider)",
                      }}
                    >
                      #
                    </th>
                  )}
                  {visibleColumns.map((c) => {
                    const isSorted = sort?.id === c.id;
                    const baseW =
                      widths[c.id] ?? (typeof c.width === "number" ? c.width : undefined);
                    return (
                      <th
                        key={c.id}
                        style={{
                          width: baseW ?? c.width,
                          minWidth: 60,
                          height: "var(--table-header-h)",
                          color: "var(--table-text-muted)",
                          borderBottom: "1px solid var(--table-divider)",
                          fontSize: "12px",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                        className={cn(
                          "relative px-2 text-left align-middle bg-background select-none",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                          c.sortable && "cursor-pointer hover:text-foreground",
                        )}
                        onClick={() => toggleSort(c)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {c.header}
                          {c.sortable &&
                            (isSorted ? (
                              sort.dir === "asc" ? (
                                <ArrowUp className="w-3 h-3" />
                              ) : (
                                <ArrowDown className="w-3 h-3" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            ))}
                        </span>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Redimensionar columna ${c.header}`}
                          title="Arrastra para redimensionar"
                          onPointerDown={(e) => {
                            const measured =
                              baseW ??
                              (e.currentTarget.parentElement as HTMLElement)?.offsetWidth ??
                              120;
                            onResizeStart(e, c.id, measured);
                          }}
                          onPointerMove={onResizeMove}
                          onPointerUp={onResizeEnd}
                          onPointerCancel={onResizeEnd}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setWidths((w) => {
                              const next = { ...w };
                              delete next[c.id];
                              return next;
                            });
                          }}
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40 active:bg-primary/60"
                        />
                      </th>
                    );
                  })}
                  {rowActions && (
                    <th
                      className="bg-background"
                      style={{
                        height: "var(--table-header-h)",
                        width: 40,
                        borderBottom: "1px solid var(--table-divider)",
                      }}
                    />
                  )}
                </tr>
              </thead>
            )}
            <tbody>
              {(() => {
                if (autoHeight) {
                  return sorted.map((row, idx) => {
                    const key = rowKey(row);
                    return (
                      <DataGridRow
                        key={key}
                        rowKey={key}
                        row={row}
                        idx={idx}
                        isSelected={selected.has(key)}
                        visibleColumns={visibleColumns}
                        widths={widths}
                        selectable={selectable}
                        showRowNumbers={showRowNumbers}
                        rowActions={rowActions}
                        onRowClick={onRowClick}
                        onRowOpen={onRowOpen}
                        onToggleSelected={toggleSelectedKey}
                        draggable={rowDraggable}
                        onDragStart={onRowDragStart}
                        onDragEnd={onRowDragEnd}
                      />
                    );
                  });
                }
                const items = virtualizer.getVirtualItems();
                const total = virtualizer.getTotalSize();
                const paddingTop = items.length > 0 ? items[0].start : 0;
                const paddingBottom = items.length > 0 ? total - items[items.length - 1].end : 0;
                return (
                  <>
                    {paddingTop > 0 && (
                      <tr aria-hidden style={{ height: paddingTop }}>
                        <td />
                      </tr>
                    )}
                    {items.map((v) => {
                      const row = sorted[v.index];
                      const key = rowKey(row);
                      return (
                        <DataGridRow
                          key={key}
                          rowKey={key}
                          row={row}
                          idx={v.index}
                          isSelected={selected.has(key)}
                          visibleColumns={visibleColumns}
                          widths={widths}
                          selectable={selectable}
                          showRowNumbers={showRowNumbers}
                          rowActions={rowActions}
                          onRowClick={onRowClick}
                          onRowOpen={onRowOpen}
                          onToggleSelected={toggleSelectedKey}
                          draggable={rowDraggable}
                          onDragStart={onRowDragStart}
                          onDragEnd={onRowDragEnd}
                        />
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr aria-hidden style={{ height: paddingBottom }}>
                        <td />
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type DataGridRowProps<TRow> = {
  rowKey: string;
  row: TRow;
  idx: number;
  isSelected: boolean;
  visibleColumns: ColumnDef<TRow>[];
  widths: Record<string, number>;
  selectable: boolean;
  showRowNumbers: boolean;
  rowActions?: (row: TRow) => React.ReactNode;
  onRowClick?: (row: TRow) => void;
  onRowOpen?: (row: TRow) => void;
  onToggleSelected: (key: string, checked: boolean) => void;
  draggable?: boolean;
  onDragStart?: (row: TRow, e: React.DragEvent<HTMLTableRowElement>) => void;
  onDragEnd?: (row: TRow, e: React.DragEvent<HTMLTableRowElement>) => void;
};

function DataGridRowInner<TRow>({
  rowKey,
  row,
  idx,
  isSelected,
  visibleColumns,
  widths,
  selectable,
  showRowNumbers,
  rowActions,
  onRowClick,
  onRowOpen,
  onToggleSelected,
  draggable,
  onDragStart,
  onDragEnd,
}: DataGridRowProps<TRow>) {
  return (
    <tr
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(row, e) : undefined}
      onDragEnd={onDragEnd ? (e) => onDragEnd(row, e) : undefined}
      onClick={() => onRowClick?.(row)}
      onDoubleClick={() => onRowOpen?.(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (onRowOpen ?? onRowClick)?.(row);
        }
      }}
      className={cn(
        "group focus-visible:outline-none",
        (onRowClick || onRowOpen) && "cursor-pointer",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
      style={{
        height: "var(--table-row-h)",
        backgroundColor: isSelected ? "var(--table-hover)" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "var(--table-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "";
      }}
    >
      {selectable && (
        <td
          className="px-2 align-middle"
          style={{
            height: "var(--table-row-h)",
            width: 32,
            borderBottom: "1px solid var(--table-divider)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            aria-label={`Seleccionar fila ${idx + 1}`}
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelected(rowKey, !!checked)}
          />
        </td>
      )}
      {showRowNumbers && (
        <td
          className="px-2 text-right align-middle tabular-nums"
          style={{
            height: "var(--table-row-h)",
            width: 40,
            fontSize: "12px",
            color: "var(--table-text-muted)",
            borderBottom: "1px solid var(--table-divider)",
          }}
        >
          {idx + 1}
        </td>
      )}
      {visibleColumns.map((c) => {
        const w = widths[c.id] ?? c.width;
        return (
          <td
            key={c.id}
            style={{
              width: w,
              maxWidth: w,
              height: "var(--table-row-h)",
              borderBottom: "1px solid var(--table-divider)",
            }}
            className={cn(
              "px-2 align-middle truncate",
              c.align === "right" && "text-right",
              c.align === "center" && "text-center",
            )}
          >
            {c.cell ? c.cell(row) : (c.accessor?.(row) ?? "—")}
          </td>
        );
      })}
      {rowActions && (
        <td
          className="px-1 align-middle w-10 text-right"
          style={{
            height: "var(--table-row-h)",
            borderBottom: "1px solid var(--table-divider)",
          }}
        >
          <span
            className="inline-flex opacity-0 group-hover:opacity-100 focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {rowActions(row)}
          </span>
        </td>
      )}
    </tr>
  );
}

const DataGridRow = React.memo(DataGridRowInner) as typeof DataGridRowInner;
