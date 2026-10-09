import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getNotificationPreferences,
  saveNotificationPreference,
  getMyNotificationProfile,
  updateMyNotificationProfile,
} from "@/lib/api/notifications.functions";

export const Route = createFileRoute("/_authenticated/me/settings/notifications")({
  head: () => ({ meta: [{ title: "Notificaciones · Riel" }] }),
  component: NotificationsSettingsPage,
});

const CHANNELS = [
  { key: "desktop", label: "Desktop" },
  { key: "in_app", label: "En la app" },
  { key: "email", label: "Email" },
  { key: "slack", label: "Slack DM" },
] as const;

function NotificationsSettingsPage() {
  const qc = useQueryClient();
  const prefsFn = useServerFn(getNotificationPreferences);
  const saveFn = useServerFn(saveNotificationPreference);
  const profileFn = useServerFn(getMyNotificationProfile);
  const updateProfileFn = useServerFn(updateMyNotificationProfile);

  const prefsQ = useQuery({ queryKey: ["notif-prefs"], queryFn: () => prefsFn() });
  const profileQ = useQuery({ queryKey: ["notif-profile"], queryFn: () => profileFn() });

  const [handle, setHandle] = useState("");
  const [slackId, setSlackId] = useState("");
  const [desktopPerm, setDesktopPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );

  useEffect(() => {
    if (profileQ.data) {
      setHandle(profileQ.data.handle ?? "");
      setSlackId(profileQ.data.slack_user_id ?? "");
    }
  }, [profileQ.data]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setDesktopPerm("unsupported");
    } else {
      setDesktopPerm(Notification.permission);
    }
  }, []);

  const toggleChannel = async (
    kind: string,
    row: { desktop: boolean; in_app: boolean; email: boolean; slack: boolean },
    channel: "desktop" | "in_app" | "email" | "slack",
    value: boolean,
  ) => {
    await saveFn({
      data: {
        kind: kind as never,
        desktop: channel === "desktop" ? value : row.desktop,
        in_app: channel === "in_app" ? value : row.in_app,
        email: channel === "email" ? value : row.email,
        slack: channel === "slack" ? value : row.slack,
      },
    });
    qc.invalidateQueries({ queryKey: ["notif-prefs"] });
  };

  const saveProfile = async () => {
    try {
      await updateProfileFn({ data: { handle, slack_user_id: slackId } });
      toast.success("Perfil actualizado");
      qc.invalidateQueries({ queryKey: ["notif-profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    }
  };

  const requestDesktop = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setDesktopPerm(p);
    if (p === "granted") toast.success("Notificaciones de escritorio activadas");
    else toast.error("Permiso denegado — habilítalo desde el navegador");
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tu identidad en menciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="handle">Handle (@)</Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">@</span>
              <Input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                placeholder="ariel"
                maxLength={32}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Otros te mencionan escribiendo <code>@{handle || "tuhandle"}</code> en cualquier
              comentario.
            </p>
          </div>
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="slack">Slack user ID (opcional)</Label>
            <Input
              id="slack"
              value={slackId}
              onChange={(e) => setSlackId(e.target.value)}
              placeholder="U01ABC2DEF"
            />
            <p className="text-xs text-muted-foreground">
              Por defecto tu Slack se resuelve por tu email ({profileQ.data?.email}). Configura
              este ID solo si tu email de Slack es diferente.
            </p>
          </div>
          <Button onClick={saveProfile} size="sm">
            Guardar perfil
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificaciones de escritorio</CardTitle>
        </CardHeader>
        <CardContent>
          {desktopPerm === "unsupported" && (
            <p className="text-sm text-muted-foreground">
              Tu navegador no soporta notificaciones de escritorio.
            </p>
          )}
          {desktopPerm === "granted" && (
            <p className="text-sm text-green-600">✓ Permitidas en este navegador</p>
          )}
          {desktopPerm === "denied" && (
            <p className="text-sm text-destructive">
              Bloqueadas — habilítalas desde la configuración del sitio en tu navegador.
            </p>
          )}
          {desktopPerm === "default" && (
            <Button onClick={requestDesktop} size="sm">
              Activar notificaciones de escritorio
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué notificaciones recibir</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium py-2 pr-4">Evento</th>
                  {CHANNELS.map((c) => (
                    <th key={c.key} className="text-center font-medium py-2 px-2 w-20">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(prefsQ.data ?? []).map((p) => (
                  <tr key={p.kind} className="border-b last:border-0">
                    <td className="py-2 pr-4">{p.label}</td>
                    {CHANNELS.map((c) => (
                      <td key={c.key} className="text-center py-2 px-2">
                        <Switch
                          checked={p[c.key]}
                          onCheckedChange={(v) => toggleChannel(p.kind, p, c.key, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
