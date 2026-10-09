import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  listTaskComments,
  addTaskComment,
  deleteTaskComment,
  listTaskActivity,
  registerTaskAttachment,
  listTaskAttachments,
  type ActivityItem,
} from "@/lib/api/tasko.functions";
import { supabase } from "@/integrations/supabase/client";
import { currentProfileQO } from "@/lib/api/auth.queries";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "./MemberAvatar";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/tasko-constants";
import {
  Send,
  X,
  MessageSquare,
  AtSign,
  Paperclip,
  CircleDot,
  UserCircle2,
  CalendarDays,
  Flag,
  Type as TypeIcon,
  Sparkles,
  Eye,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type Filter = "all" | "comments" | "events";

type MemberProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
} | null;

type Member = {
  user_id: string;
  profile: MemberProfile;
};

// Mention token format stored in body: @[Full Name](uuid)
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;

export function CommentsTab({
  taskId,
  focusComposerSignal,
  members = [],
  isTicket = false,
}: {
  taskId: string;
  focusComposerSignal?: number;
  members?: Member[];
  isTicket?: boolean;
}) {
  const qc = useQueryClient();
  const fetchActivity = useServerFn(listTaskActivity);
  const addComment = useServerFn(addTaskComment);
  const delComment = useServerFn(deleteTaskComment);

  const activityQuery = useQuery({
    queryKey: ["activity", taskId],
    queryFn: () => fetchActivity({ data: { taskId } }),
  });

  const fetchAttachments = useServerFn(listTaskAttachments);
  const attachmentsQuery = useQuery({
    queryKey: ["attachments", taskId],
    queryFn: () => fetchAttachments({ data: { taskId } }),
  });
  const attachmentLinks = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attachmentsQuery.data ?? []) {
      const url = a.downloadUrl ?? a.url;
      if (url && !m.has(a.file_name)) m.set(a.file_name, url);
    }
    return m;
  }, [attachmentsQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["activity", taskId] });
    qc.invalidateQueries({ queryKey: ["comments", taskId] });
  };

  const [commentBody, setCommentBody] = useState("");
  // Tickets: internal by default (security); team must opt in to client visibility.
  const [clientVisible, setClientVisible] = useState<boolean>(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusComposerSignal && composerRef.current) {
      composerRef.current.focus();
    }
  }, [focusComposerSignal]);

  // Current user for composer avatar (shared cache across tabs)
  const { data: me = null } = useQuery(currentProfileQO());

  // ===== Attachments from composer =====
  const fileInputRef = useRef<HTMLInputElement>(null);
  const registerAtt = useServerFn(registerTaskAttachment);
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${taskId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("task-attachments")
        .upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      await registerAtt({
        data: {
          taskId,
          filePath: path,
          fileName: file.name,
          size: file.size,
          mimeType: file.type,
        },
      });
      return file.name;
    },
    onSuccess: (name) => {
      setCommentBody((b) => (b ? `${b}\n📎 ${name}` : `📎 ${name}`));
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
      toast.success("Archivo adjuntado", {
        description: "Disponible en la pestaña Adjuntos",
      });
      composerRef.current?.focus();
    },
    onError: (e: Error) => toast.error("No se pudo adjuntar", { description: e.message }),
    onSettled: () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const addMut = useMutation({
    mutationFn: (body: string) =>
      addComment({ data: { taskId, body, isClientVisible: isTicket && clientVisible } }),
    onSuccess: () => {
      setCommentBody("");
      setClientVisible(false);
      invalidate();
    },
    onError: (e: Error) => toast.error("No se pudo enviar comentario", { description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (commentId: string) => delComment({ data: { commentId } }),
    onSuccess: () => {
      toast.success("Comentario eliminado");
      invalidate();
    },
    onError: (e: Error) => toast.error("No se pudo eliminar", { description: e.message }),
  });

  const [filter, setFilter] = useState<Filter>("all");

  const items = activityQuery.data ?? [];
  const filtered = useMemo(
    () =>
      items.filter((i) =>
        filter === "all" ? true : filter === "comments" ? i.kind === "comment" : i.kind === "event",
      ),
    [items, filter],
  );

  // Group by day
  const groups = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const it of filtered) {
      const key = it.created_at.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // ===== Mention autocomplete =====
  const [mention, setMention] = useState<{
    active: boolean;
    query: string;
    startIdx: number;
    selected: number;
  }>({ active: false, query: "", startIdx: -1, selected: 0 });

  const memberCandidates = useMemo(() => {
    const list = members.filter((m) => m.profile);
    if (!mention.active) return list;
    const q = mention.query.toLowerCase();
    return list
      .filter((m) => {
        const p = m.profile!;
        return (
          (p.full_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [members, mention.active, mention.query]);

  const detectMention = useCallback((value: string, caret: number) => {
    // Walk back from caret to find a '@' that starts a mention token
    let i = caret - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        const prev = i > 0 ? value[i - 1] : " ";
        if (/\s|^/.test(prev) || i === 0) {
          const query = value.slice(i + 1, caret);
          if (/^[\p{L}\p{N}_.\- ]*$/u.test(query)) {
            return { startIdx: i, query };
          }
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }, []);

  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setCommentBody(value);
    const caret = e.target.selectionStart ?? value.length;
    const m = detectMention(value, caret);
    if (m) {
      setMention({ active: true, query: m.query, startIdx: m.startIdx, selected: 0 });
    } else {
      setMention((s) => (s.active ? { ...s, active: false } : s));
    }
  };

  const insertMention = (member: Member) => {
    if (!member.profile) return;
    const ta = composerRef.current;
    if (!ta) return;
    const name = member.profile.full_name ?? member.profile.email ?? "Usuario";
    const token = `@[${name}](${member.user_id}) `;
    const before = commentBody.slice(0, mention.startIdx);
    const caret = ta.selectionStart ?? commentBody.length;
    const after = commentBody.slice(caret);
    const next = before + token + after;
    setCommentBody(next);
    setMention({ active: false, query: "", startIdx: -1, selected: 0 });
    requestAnimationFrame(() => {
      const pos = (before + token).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const triggerMentionFromButton = () => {
    const ta = composerRef.current;
    if (!ta) return;
    ta.focus();
    const caret = ta.selectionStart ?? commentBody.length;
    const needsSpace = caret > 0 && !/\s/.test(commentBody[caret - 1] ?? "");
    const insert = needsSpace ? " @" : "@";
    const next = commentBody.slice(0, caret) + insert + commentBody.slice(caret);
    setCommentBody(next);
    const newCaret = caret + insert.length;
    requestAnimationFrame(() => {
      ta.setSelectionRange(newCaret, newCaret);
      setMention({ active: true, query: "", startIdx: newCaret - 1, selected: 0 });
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.active && memberCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((s) => ({ ...s, selected: (s.selected + 1) % memberCandidates.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((s) => ({
          ...s,
          selected: (s.selected - 1 + memberCandidates.length) % memberCandidates.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(memberCandidates[mention.selected]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention((s) => ({ ...s, active: false }));
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (commentBody.trim()) addMut.mutate(commentBody.trim());
    }
  };

  return (
    <div className="flex flex-col">
      {/* Filter chips */}
      <div className="flex items-center gap-1 mb-4">
        {(
          [
            { v: "all", label: "Todo" },
            { v: "comments", label: "Comentarios" },
            { v: "events", label: "Cambios" },
          ] as { v: Filter; label: string }[]
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filter === f.v
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="space-y-6 pb-4">
        {groups.length === 0 && (
          <div className="flex flex-col items-center text-center py-10 text-muted-foreground">
            <MessageSquare className="w-6 h-6 mb-2 opacity-50" aria-hidden="true" />
            <span className="text-sm">Aún no hay actividad</span>
            <span className="text-xs mt-1 opacity-70">Sé el primero en comentar</span>
          </div>
        )}
        {groups.map(([day, dayItems]) => (
          <section key={day} className="space-y-3">
            <DayDivider date={day} />
            {dayItems.map((it) =>
              it.kind === "comment" ? (
                <CommentItem
                  key={`c-${it.id}`}
                  item={it}
                  canDelete={me?.id === it.author_id}
                  onDelete={() => deleteMut.mutate(it.id)}
                  currentUserId={me?.id ?? null}
                  attachmentLinks={attachmentLinks}
                />
              ) : (
                <EventItem key={`e-${it.id}`} item={it} members={members} />
              ),
            )}
          </section>
        ))}
      </div>

      {/* Sticky composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (commentBody.trim()) addMut.mutate(commentBody.trim());
        }}
        className="sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 pt-3 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border"
      >
        <div className="flex gap-3 items-start">
          <MemberAvatar profile={me} size={32} />
          <div className="flex-1 min-w-0 relative">
            {/* Mention popover */}
            {mention.active && memberCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-border bg-popover shadow-md overflow-hidden z-10">
                <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  Mencionar miembro
                </div>
                <ul className="max-h-56 overflow-y-auto py-1">
                  {memberCandidates.map((m, idx) => {
                    const p = m.profile!;
                    const name = p.full_name ?? p.email ?? "Usuario";
                    const active = idx === mention.selected;
                    return (
                      <li key={m.user_id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(m);
                          }}
                          onMouseEnter={() => setMention((s) => ({ ...s, selected: idx }))}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                            active ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                          }`}
                        >
                          <MemberAvatar profile={p} size={22} />
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{name}</div>
                            {p.email && p.full_name && (
                              <div className="truncate text-[11px] text-muted-foreground">
                                {p.email}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-border bg-card focus-within:border-primary/40 transition-colors">
              <Textarea
                ref={composerRef}
                value={commentBody}
                onChange={handleComposerChange}
                onSelect={(e) => {
                  const ta = e.currentTarget;
                  const m = detectMention(ta.value, ta.selectionStart ?? 0);
                  if (m) {
                    setMention((s) => ({
                      active: true,
                      query: m.query,
                      startIdx: m.startIdx,
                      selected: s.active ? s.selected : 0,
                    }));
                  } else if (mention.active) {
                    setMention((s) => ({ ...s, active: false }));
                  }
                }}
                placeholder="Escribe un comentario... usa @ para mencionar"
                rows={2}
                onKeyDown={handleKeyDown}
                className="border-0 shadow-none focus-visible:ring-0 resize-none bg-transparent text-sm min-h-[60px]"
              />
              <div className="flex items-center justify-between px-2 pb-1.5">
                <div className="flex items-center gap-0.5 text-muted-foreground">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadMut.mutate(f);
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMut.isPending}
                    aria-label="Adjuntar archivo"
                    title="Adjuntar archivo"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    onClick={triggerMentionFromButton}
                    aria-label="Mencionar miembro"
                    title="Mencionar (@)"
                    disabled={members.length === 0}
                  >
                    <AtSign className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    disabled
                    aria-label="Sugerencia IA (próximamente)"
                    title="Próximamente"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {isTicket && (
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={clientVisible}
                        onCheckedChange={(v) => setClientVisible(v === true)}
                        className="h-3.5 w-3.5"
                      />
                      <Eye className="w-3 h-3" />
                      Visible para el cliente
                    </label>
                  )}
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    ⌘+Enter
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-7"
                    disabled={!commentBody.trim() || addMut.isPending}
                  >
                    <Send className="w-3 h-3 mr-1" /> Comentar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function DayDivider({ date }: { date: string }) {
  const d = parseISO(date);
  let label: string;
  if (isToday(d)) label = "Hoy";
  else if (isYesterday(d)) label = "Ayer";
  else label = format(d, "d 'de' MMMM yyyy", { locale: es });
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px bg-border flex-1" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <div className="h-px bg-border flex-1" />
    </div>
  );
}

/** Turns "📎 filename" lines into download links when the attachment is known. */
function renderTextWithAttachments(
  text: string,
  attachmentLinks: Map<string, string>,
  keyPrefix: string,
) {
  if (!text.includes("📎")) return [text];
  const out: React.ReactNode[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) out.push("\n");
    const m = line.match(/^\s*📎\s*(.+?)\s*$/);
    const url = m ? attachmentLinks.get(m[1]) : undefined;
    if (m && url) {
      out.push(
        <a
          key={`${keyPrefix}-a-${i}`}
          href={url}
          download={m[1]}
          className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-80"
        >
          <Paperclip className="w-3 h-3" />
          {m[1]}
        </a>,
      );
    } else {
      out.push(line);
    }
  });
  return out;
}

/** Renders comment body with @[Name](uuid) tokens highlighted. */
function renderBodyWithMentions(
  body: string,
  currentUserId: string | null,
  attachmentLinks: Map<string, string>,
) {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  let key = 0;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIdx) {
      parts.push(
        ...renderTextWithAttachments(body.slice(lastIdx, match.index), attachmentLinks, `t${key}`),
      );
    }
    const name = match[1];
    const uuid = match[2];
    const isMe = currentUserId === uuid;
    parts.push(
      <span
        key={`m-${key++}`}
        className={`inline-flex items-baseline rounded px-1 -mx-0.5 font-medium ${
          isMe ? "bg-primary/15 text-primary" : "bg-accent/60 text-accent-foreground"
        }`}
      >
        @{name}
      </span>,
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < body.length)
    parts.push(...renderTextWithAttachments(body.slice(lastIdx), attachmentLinks, "tz"));
  return parts;
}

function CommentItem({
  item,
  canDelete,
  onDelete,
  currentUserId,
  attachmentLinks,
}: {
  item: Extract<ActivityItem, { kind: "comment" }>;
  canDelete: boolean;
  onDelete: () => void;
  currentUserId: string | null;
  attachmentLinks: Map<string, string>;
}) {
  return (
    <article className="flex gap-3 group">
      <MemberAvatar profile={item.author} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {item.author?.full_name ?? item.author?.email ?? item.client_author_email ?? "Usuario"}
          </span>
          <span className="text-muted-foreground">
            {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true, locale: es })}
          </span>
          {item.is_client_visible && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
              <Eye className="w-3 h-3" />
              Visible al cliente
            </span>
          )}
          {canDelete && (
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Eliminar comentario"
              onClick={onDelete}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
        <div
          className={`mt-1 rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            item.is_client_visible ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted/40"
          }`}
        >
          {renderBodyWithMentions(item.body, currentUserId, attachmentLinks)}
        </div>
      </div>
    </article>
  );
}

function EventItem({
  item,
  members,
}: {
  item: Extract<ActivityItem, { kind: "event" }>;
  members: Member[];
}) {
  const actorName = item.actor?.full_name ?? item.actor?.email ?? "Alguien";
  const { icon, sentence } = describeEvent(item, members);
  return (
    <div className="flex gap-3 items-center text-xs text-muted-foreground">
      <div className="w-8 flex justify-center shrink-0">
        <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground/80">{actorName}</span> <span>{sentence}</span>
        <span className="mx-1">·</span>
        <span>
          {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true, locale: es })}
        </span>
      </div>
    </div>
  );
}

function memberName(members: Member[], userId: string | null): string {
  if (!userId) return "—";
  const m = members.find((x) => x.user_id === userId);
  return m?.profile?.full_name ?? m?.profile?.email ?? "Usuario";
}

function humanize(v: string | null): string {
  if (!v) return "—";
  return v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function describeEvent(
  e: Extract<ActivityItem, { kind: "event" }>,
  members: Member[],
): {
  icon: React.ReactNode;
  sentence: React.ReactNode;
} {
  switch (e.event_kind) {
    case "status": {
      const from =
        STATUS_OPTIONS.find((o) => o.value === e.from_value)?.label ?? humanize(e.from_value);
      const to = STATUS_OPTIONS.find((o) => o.value === e.to_value)?.label ?? humanize(e.to_value);
      return {
        icon: <CircleDot className="w-3 h-3" />,
        sentence: (
          <>
            cambió el estado de <strong className="text-foreground">{from}</strong> →{" "}
            <strong className="text-foreground">{to}</strong>
          </>
        ),
      };
    }
    case "priority": {
      const from =
        PRIORITY_OPTIONS.find((o) => o.value === e.from_value)?.label ?? humanize(e.from_value);
      const to =
        PRIORITY_OPTIONS.find((o) => o.value === e.to_value)?.label ?? humanize(e.to_value);
      return {
        icon: <Flag className="w-3 h-3" />,
        sentence: (
          <>
            cambió la prioridad: <strong className="text-foreground">{from}</strong> →{" "}
            <strong className="text-foreground">{to}</strong>
          </>
        ),
      };
    }
    case "assignee":
      return {
        icon: <UserCircle2 className="w-3 h-3" />,
        sentence: e.to_value ? (
          <>
            asignó la tarea a{" "}
            <strong className="text-foreground">{memberName(members, e.to_value)}</strong>
          </>
        ) : (
          <>quitó el asignado</>
        ),
      };
    case "due_date":
      return {
        icon: <CalendarDays className="w-3 h-3" />,
        sentence: e.to_value ? (
          <>
            cambió la fecha límite a <strong className="text-foreground">{e.to_value}</strong>
          </>
        ) : (
          <>eliminó la fecha límite</>
        ),
      };
    case "title":
      return {
        icon: <TypeIcon className="w-3 h-3" />,
        sentence: <>renombró la tarea</>,
      };
    case "created":
      return {
        icon: <Sparkles className="w-3 h-3" />,
        sentence: <>creó esta tarea</>,
      };
    case "time_started":
      return {
        icon: <CircleDot className="w-3 h-3" />,
        sentence: <>inició el timer</>,
      };
    case "time_stopped":
      return {
        icon: <CircleDot className="w-3 h-3" />,
        sentence: e.to_value ? (
          <>
            detuvo el timer (<strong className="text-foreground">{e.to_value} min</strong>)
          </>
        ) : (
          <>detuvo el timer</>
        ),
      };
    default:
      return {
        icon: <CircleDot className="w-3 h-3" />,
        sentence: <>actualizó la tarea ({humanize(e.event_kind)})</>,
      };
  }
}

export function useCommentsCount(taskId: string) {
  const fetchComments = useServerFn(listTaskComments);
  return useQuery({
    queryKey: ["comments", taskId],
    queryFn: () => fetchComments({ data: { taskId } }),
    select: (rows) => rows.length,
  });
}
