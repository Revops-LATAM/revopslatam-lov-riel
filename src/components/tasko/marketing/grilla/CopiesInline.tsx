import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Instagram } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upsertChannelCopy } from "@/lib/api/grilla.functions";
import { CHANNEL_LABEL, CHANNEL_META, type PieceChannel } from "./constants";

export function CopiesInline({
  pieceId,
  channels,
  copies,
  onSaved,
}: {
  pieceId: string;
  channels: string[];
  copies: Record<string, { body: string; hashtags: string[] }>;
  onSaved?: () => void;
}) {
  const upsertFn = useServerFn(upsertChannelCopy);
  const mut = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => onSaved?.(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (channels.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        Sin canales seleccionados. Elegí uno o más canales para editar copies.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {channels.map((ch) => {
        const existing = copies[ch] ?? { body: "", hashtags: [] };
        return (
          <CopyCell
            key={ch}
            channel={ch}
            initialBody={existing.body}
            initialHashtags={existing.hashtags}
            onCommit={(body, hashtags) =>
              mut.mutate({ data: { pieceId, channel: ch as PieceChannel, body, hashtags } })
            }
          />
        );
      })}
    </div>
  );
}

function CopyCell({
  channel,
  initialBody,
  initialHashtags,
  onCommit,
}: {
  channel: string;
  initialBody: string;
  initialHashtags: string[];
  onCommit: (body: string, hashtags: string[]) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [tags, setTags] = useState(initialHashtags.join(" "));
  useEffect(() => setBody(initialBody), [initialBody]);
  useEffect(() => setTags(initialHashtags.join(" ")), [initialHashtags]);
  const meta = CHANNEL_META[channel];
  const Icon = meta?.icon ?? Instagram;

  const commit = () => {
    const nextTags = tags
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (body !== initialBody || nextTags.join(" ") !== initialHashtags.join(" ")) {
      onCommit(body, nextTags);
    }
  };

  return (
    <div
      className="rounded-lg border bg-white p-3 space-y-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: meta?.color }} />
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          {CHANNEL_LABEL[channel] ?? channel}
        </div>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={commit}
        placeholder="Texto del copy…"
        className="text-[12px] min-h-[80px] resize-y bg-transparent focus-visible:bg-background"
      />
      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onBlur={commit}
        placeholder="#hashtag1 #hashtag2"
        className="h-7 text-[11px] bg-transparent focus-visible:bg-background"
      />
    </div>
  );
}
