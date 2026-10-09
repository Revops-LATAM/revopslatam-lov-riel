import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPreferences, updateMyPreferences } from "@/lib/api/me.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/me/settings/preferences")({
  component: MePreferences,
});

function MePreferences() {
  const qc = useQueryClient();
  const fetchPrefs = useServerFn(getMyPreferences);
  const updatePrefs = useServerFn(updateMyPreferences);
  const prefs = useQuery({
    queryKey: ["my-preferences"],
    queryFn: () => fetchPrefs(),
  });

  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [language, setLanguage] = useState("es");
  const [emailMentions, setEmailMentions] = useState(true);
  const [emailAssignments, setEmailAssignments] = useState(true);
  const [emailTickets, setEmailTickets] = useState(true);

  useEffect(() => {
    if (!prefs.data) return;
    setTheme(prefs.data.theme ?? "system");
    setLanguage(prefs.data.language ?? "es");
    setEmailMentions(prefs.data.notifications?.email_mentions ?? true);
    setEmailAssignments(prefs.data.notifications?.email_assignments ?? true);
    setEmailTickets(prefs.data.notifications?.email_ticket_updates ?? true);
  }, [prefs.data]);

  const mut = useMutation({
    mutationFn: () =>
      updatePrefs({
        data: {
          theme,
          language,
          notifications: {
            email_mentions: emailMentions,
            email_assignments: emailAssignments,
            email_ticket_updates: emailTickets,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Preferencias guardadas");
      qc.invalidateQueries({ queryKey: ["my-preferences"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <section className="border border-border rounded-md p-4 space-y-4">
        <h2 className="text-sm font-semibold">Interfaz</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tema</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Oscuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Idioma</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="border border-border rounded-md p-4 space-y-4">
        <h2 className="text-sm font-semibold">Notificaciones por email</h2>
        <div className="space-y-3">
          <PrefRow
            label="Cuando me mencionan en comentarios"
            value={emailMentions}
            onChange={setEmailMentions}
          />
          <PrefRow
            label="Cuando me asignan una tarea o ticket"
            value={emailAssignments}
            onChange={setEmailAssignments}
          />
          <PrefRow
            label="Actualizaciones de mis tickets"
            value={emailTickets}
            onChange={setEmailTickets}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          Guardar preferencias
        </Button>
      </div>
    </div>
  );
}

function PrefRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
