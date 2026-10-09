import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  listHubspotSocialChannels,
  listMarketingChannelsWithHubspot,
  setChannelHubspotId,
} from "@/lib/api/hubspot-grilla.functions";

export function HubspotConfigDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listChannelsFn = useServerFn(listMarketingChannelsWithHubspot);
  const listHubspotFn = useServerFn(listHubspotSocialChannels);
  const setMapFn = useServerFn(setChannelHubspotId);

  const chQ = useQuery({
    queryKey: ["mkt-channels-hs", workspaceId],
    queryFn: () => listChannelsFn({ data: { workspaceId } }),
  });
  const hsQ = useQuery({
    queryKey: ["hubspot-social-channels"],
    queryFn: () => listHubspotFn(),
    retry: false,
  });

  const mut = useMutation({
    mutationFn: setMapFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-channels-hs", workspaceId] });
      toast.success("Mapeo guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hsChannels = hsQ.data ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Conectar canales con HubSpot
          </DialogTitle>
          <DialogDescription>
            Elegí qué cuenta social de HubSpot corresponde a cada canal de la grilla. Las piezas se
            programarán en HubSpot usando esta correspondencia.
          </DialogDescription>
        </DialogHeader>

        {hsQ.isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : hsQ.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            No se pudo leer HubSpot: {(hsQ.error as Error).message}
            <div className="text-xs text-muted-foreground mt-1">
              Verificá que tu cuenta HubSpot tenga Marketing Hub Professional o Enterprise y que las
              redes sociales estén conectadas allí.
            </div>
          </div>
        ) : hsChannels.length === 0 ? (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            No encontramos cuentas de Instagram, LinkedIn o Facebook conectadas en HubSpot.
            Conectalas desde HubSpot → Marketing → Social. TikTok no está disponible en HubSpot.
          </div>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground -mt-1 mb-1">
              HubSpot solo permite programar Facebook, Instagram y LinkedIn. TikTok y YouTube se
              muestran pero no se pueden sincronizar por esta vía.
            </div>
            <div className="space-y-3 max-h-[420px] overflow-auto">
              {(chQ.data ?? [])
                .map((ch) => {
                  const k = (ch.key ?? "").toLowerCase();
                  const supported =
                    k.includes("instagram") || k.includes("linkedin") || k.includes("facebook");
                  const unsupportedHubspot = k.includes("tiktok") || k.includes("youtube");
                  return { ch, supported, unsupportedHubspot };
                })
                .filter((x) => x.supported || x.unsupportedHubspot)
                .map(({ ch, supported }) => (
                  <div
                    key={ch.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                    style={{ borderColor: "var(--border)", opacity: supported ? 1 : 0.55 }}
                  >
                    <div
                      className="w-2 h-8 rounded-sm"
                      style={{ background: ch.color ?? "#e5e7eb" }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{ch.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {supported ? ch.key : "No soportado por HubSpot"}
                      </div>
                    </div>
                    {supported ? (
                      <Select
                        value={ch.hubspot_channel_id ?? "__none__"}
                        onValueChange={(v) =>
                          mut.mutate({
                            data: {
                              channelId: ch.id,
                              hubspotChannelId: v === "__none__" ? null : v,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="w-64 h-9 text-xs">
                          <SelectValue placeholder="Sin conectar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Sin conectar —</SelectItem>
                          {hsChannels.map((hc) => (
                            <SelectItem key={hc.channelGuid} value={hc.channelGuid}>
                              {hc.name} {hc.type ? `· ${hc.type}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="w-64 h-9 text-xs flex items-center justify-center rounded-md border border-dashed text-muted-foreground">
                        No disponible en HubSpot
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={onClose}>
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
