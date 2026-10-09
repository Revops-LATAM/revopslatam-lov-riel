import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getPieceDetails,
  updatePiece,
  upsertCarouselSlide,
  upsertVideoSection,
  upsertPoll,
  upsertChannelCopy,
  PIECE_CHANNELS,
} from "@/lib/api/grilla.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Plus, X } from "lucide-react";

const SLIDE_ROLE_LABEL: Record<string, string> = {
  portada: "Portada",
  contexto: "Contexto",
  punto1: "Punto 1",
  punto2: "Punto 2",
  punto3: "Punto 3",
  cierre_cta: "Cierre + CTA",
};
const SECTION_LABEL: Record<string, string> = {
  hook: "Hook",
  desarrollo: "Desarrollo",
  cierre: "Cierre",
};
const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export function PieceEditorSheet({
  pieceId,
  open,
  onClose,
}: {
  pieceId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getDetailsFn = useServerFn(getPieceDetails);
  const updatePieceFn = useServerFn(updatePiece);
  const updateSlideFn = useServerFn(upsertCarouselSlide);
  const updateSectionFn = useServerFn(upsertVideoSection);
  const updatePollFn = useServerFn(upsertPoll);
  const updateCopyFn = useServerFn(upsertChannelCopy);

  const detailsQ = useQuery({
    queryKey: ["piece-details", pieceId],
    queryFn: () => getDetailsFn({ data: { pieceId: pieceId! } }),
    enabled: !!pieceId && open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["piece-details", pieceId] });
    qc.invalidateQueries({ queryKey: ["grid"] });
  };

  const slideMut = useMutation({
    mutationFn: updateSlideFn,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const sectionMut = useMutation({
    mutationFn: updateSectionFn,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const pollMut = useMutation({
    mutationFn: updatePollFn,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const copyMut = useMutation({
    mutationFn: updateCopyFn,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const pieceMut = useMutation({
    mutationFn: updatePieceFn,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const data = detailsQ.data;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="truncate">{data?.piece.title || "Sin título"}</SheetTitle>
        </SheetHeader>

        {detailsQ.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <Tabs defaultValue="general" className="mt-4">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="structure">Estructura</TabsTrigger>
              <TabsTrigger value="copies">Copies</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3 pt-4">
              <TitleInput
                initial={data.piece.title}
                onSave={(v) => pieceMut.mutate({ data: { pieceId: data.piece.id, title: v } })}
              />
              <div>
                <label className="text-xs text-muted-foreground">CTA</label>
                <TextField
                  initial={data.piece.cta ?? ""}
                  onSave={(v) =>
                    pieceMut.mutate({ data: { pieceId: data.piece.id, cta: v || null } })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Link asset (Canva / Drive)</label>
                <TextField
                  initial={data.piece.asset_url ?? ""}
                  onSave={(v) =>
                    pieceMut.mutate({ data: { pieceId: data.piece.id, assetUrl: v || null } })
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="structure" className="pt-4 space-y-3">
              {data.piece.format === "carrusel" && (
                <div className="space-y-2">
                  {data.slides.map((s) => (
                    <SlideEditor
                      key={s.id}
                      role={s.role}
                      index={s.slide_index}
                      initial={s.text}
                      onSave={(text) => slideMut.mutate({ data: { slideId: s.id, text } })}
                    />
                  ))}
                </div>
              )}
              {(data.piece.format === "reel" || data.piece.format === "video") && (
                <div className="space-y-2">
                  {data.sections.map((sec) => (
                    <SectionEditor
                      key={sec.id}
                      section={sec}
                      onSave={(patch) =>
                        sectionMut.mutate({ data: { sectionId: sec.id, ...patch } })
                      }
                    />
                  ))}
                </div>
              )}
              {data.piece.format === "encuesta" && (
                <PollEditor
                  pieceId={data.piece.id}
                  initial={data.poll}
                  onSave={(question, options) =>
                    pollMut.mutate({ data: { pieceId: data.piece.id, question, options } })
                  }
                />
              )}
              {(data.piece.format === "post" || data.piece.format === "demo") && (
                <div className="text-sm text-muted-foreground">
                  Formato "{data.piece.format}" — el contenido va directamente en los copies por
                  canal.
                </div>
              )}
            </TabsContent>

            <TabsContent value="copies" className="pt-4">
              {data.piece.channels.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Marca al menos un canal en la tabla para editar copies.
                </div>
              ) : (
                <Tabs defaultValue={data.piece.channels[0]}>
                  <TabsList>
                    {data.piece.channels.map((ch) => (
                      <TabsTrigger key={ch} value={ch}>
                        {CHANNEL_LABEL[ch] ?? ch}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {data.piece.channels.map((ch) => {
                    const existing = data.copies.find((c) => c.channel === ch);
                    return (
                      <TabsContent key={ch} value={ch} className="pt-3">
                        <CopyEditor
                          initialBody={existing?.body ?? ""}
                          initialHashtags={existing?.hashtags ?? []}
                          onSave={(body, hashtags) =>
                            copyMut.mutate({
                              data: { pieceId: data.piece.id, channel: ch, body, hashtags },
                            })
                          }
                        />
                      </TabsContent>
                    );
                  })}
                </Tabs>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TitleInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return (
    <div>
      <label className="text-xs text-muted-foreground">Título</label>
      <div className="flex gap-2">
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== initial && onSave(v)}
        />
      </div>
    </div>
  );
}

function TextField({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== initial && onSave(v)}
    />
  );
}

function SlideEditor({
  role,
  index,
  initial,
  onSave,
}: {
  role: string;
  index: number;
  initial: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const dirty = v !== initial;
  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">
          Slide {index} — {SLIDE_ROLE_LABEL[role] ?? role}
        </div>
        {dirty && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSave(v)}>
            <Save className="w-3 h-3 mr-1" /> Guardar
          </Button>
        )}
      </div>
      <Textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        rows={3}
        placeholder="Texto de la slide…"
      />
    </div>
  );
}

function SectionEditor({
  section,
  onSave,
}: {
  section: {
    id: string;
    section: string;
    start_ts: string | null;
    end_ts: string | null;
    script: string;
    recording_notes: string | null;
  };
  onSave: (patch: {
    script?: string;
    startTs?: string | null;
    endTs?: string | null;
    recordingNotes?: string | null;
  }) => void;
}) {
  const [start, setStart] = useState(section.start_ts ?? "");
  const [end, setEnd] = useState(section.end_ts ?? "");
  const [script, setScript] = useState(section.script);
  const [notes, setNotes] = useState(section.recording_notes ?? "");
  const dirty =
    start !== (section.start_ts ?? "") ||
    end !== (section.end_ts ?? "") ||
    script !== section.script ||
    notes !== (section.recording_notes ?? "");
  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">
          {SECTION_LABEL[section.section] ?? section.section}
        </div>
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() =>
              onSave({
                startTs: start || null,
                endTs: end || null,
                script,
                recordingNotes: notes || null,
              })
            }
          >
            <Save className="w-3 h-3 mr-1" /> Guardar
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Inicio 0:00"
          className="h-8 text-xs"
        />
        <Input
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          placeholder="Fin 0:15"
          className="h-8 text-xs"
        />
      </div>
      <Textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={3}
        placeholder="Guion / voz en off…"
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notas de grabación…"
      />
    </div>
  );
}

function PollEditor({
  pieceId,
  initial,
  onSave,
}: {
  pieceId: string;
  initial: { question: string; options: string[] } | null;
  onSave: (question: string, options: string[]) => void;
}) {
  const [q, setQ] = useState(initial?.question ?? "");
  const [opts, setOpts] = useState<string[]>(initial?.options ?? ["", ""]);
  useEffect(() => {
    setQ(initial?.question ?? "");
    setOpts(initial?.options ?? ["", ""]);
  }, [initial, pieceId]);
  const dirty =
    q !== (initial?.question ?? "") ||
    JSON.stringify(opts) !== JSON.stringify(initial?.options ?? ["", ""]);
  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Encuesta</div>
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onSave(q, opts.filter(Boolean))}
          >
            <Save className="w-3 h-3 mr-1" /> Guardar
          </Button>
        )}
      </div>
      <Textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="¿Cuál es tu pregunta?"
        rows={2}
      />
      <div className="space-y-1.5">
        {opts.map((o, i) => (
          <div key={i} className="flex gap-1">
            <Input
              value={o}
              onChange={(e) => setOpts((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Opción ${i + 1}`}
              className="h-8"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setOpts((arr) => arr.filter((_, j) => j !== i))}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setOpts((arr) => [...arr, ""])}
        >
          <Plus className="w-3 h-3 mr-1" /> Agregar opción
        </Button>
      </div>
    </div>
  );
}

function CopyEditor({
  initialBody,
  initialHashtags,
  onSave,
}: {
  initialBody: string;
  initialHashtags: string[];
  onSave: (body: string, hashtags: string[]) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [tags, setTags] = useState(initialHashtags.join(" "));
  useEffect(() => {
    setBody(initialBody);
    setTags(initialHashtags.join(" "));
  }, [initialBody, initialHashtags]);
  const parsedTags = tags
    .split(/\s+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
  const dirty = body !== initialBody || parsedTags.join(" ") !== initialHashtags.join(" ");
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">Texto</label>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder="Copy del post…"
      />
      <label className="text-xs text-muted-foreground">Hashtags (separados por espacio)</label>
      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="#IA #RevOps #Ventas"
      />
      {dirty && (
        <Button size="sm" onClick={() => onSave(body, parsedTags)}>
          <Save className="w-3.5 h-3.5 mr-1" /> Guardar
        </Button>
      )}
    </div>
  );
}
