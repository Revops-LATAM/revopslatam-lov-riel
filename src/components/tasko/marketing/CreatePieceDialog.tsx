import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPiece } from "@/lib/api/marketing-pieces.functions";
import { listMarketingChannels } from "@/lib/api/marketing-channels.functions";
import { listCampaigns } from "@/lib/api/marketing-campaigns.functions";

const FORMATS = [
  "post", "articulo", "video", "reel", "email", "landing", "ad", "live", "otro",
];

export function CreatePieceDialog({
  workspaceId,
  onClose,
  defaultCampaignId,
  defaultPublishAt,
}: {
  workspaceId: string;
  onClose: () => void;
  defaultCampaignId?: string;
  defaultPublishAt?: string; // ISO
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createPiece);
  const listChannelsFn = useServerFn(listMarketingChannels);
  const listCampaignsFn = useServerFn(listCampaigns);

  const channelsQ = useQuery({
    queryKey: ["marketing-channels", workspaceId, true],
    queryFn: () => listChannelsFn({ data: { workspaceId, onlyActive: true } }),
  });
  const campaignsQ = useQuery({
    queryKey: ["campaigns", workspaceId, "active-only"],
    queryFn: () => listCampaignsFn({ data: { workspaceId } }),
  });

  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<string>("");
  const [format, setFormat] = useState<string>("post");
  const defaultDate = defaultPublishAt
    ? defaultPublishAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [publishDate, setPublishDate] = useState(defaultDate);
  const [publishTime, setPublishTime] = useState("09:00");
  const [campaignId, setCampaignId] = useState<string>(defaultCampaignId ?? "__none__");

  const createMut = useMutation({
    mutationFn: () => {
      const publishAt = new Date(`${publishDate}T${publishTime}:00`).toISOString();
      return createFn({
        data: {
          workspaceId,
          title,
          channel,
          format,
          publishAt,
          campaignId: campaignId === "__none__" ? null : campaignId,
          statusEditorial: "idea",
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-pieces", workspaceId] });
      qc.invalidateQueries({ queryKey: ["marketing-dashboard", workspaceId] });
      toast.success("Pieza creada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva pieza de contenido</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="piece-title" className="text-xs">Título</Label>
            <Input
              id="piece-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Post LinkedIn — testimonio cliente"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue placeholder="Elegir canal" /></SelectTrigger>
                <SelectContent>
                  {(channelsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.key}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formato</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha publicación</Label>
              <Input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Campaña (opcional)</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Sin campaña" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin campaña</SelectItem>
                {(campaignsQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!title.trim() || !channel || createMut.isPending}
          >
            {createMut.isPending ? "Creando…" : "Crear pieza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
