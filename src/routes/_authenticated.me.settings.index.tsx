import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { profileQO } from "@/lib/api/tasko.queries";
import { updateMyProfile } from "@/lib/api/me.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me/settings/")({
  component: MePersonal,
});

function MePersonal() {
  const qc = useQueryClient();
  const profile = useQuery(profileQO());
  const update = useServerFn(updateMyProfile);

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (profile.data) {
      setFullName(profile.data.full_name ?? "");
      setAvatarUrl(profile.data.avatar_url ?? "");
    }
  }, [profile.data]);

  const mut = useMutation({
    mutationFn: () =>
      update({
        data: {
          full_name: fullName.trim() || undefined,
          avatar_url: avatarUrl.trim() ? avatarUrl.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Perfil actualizado");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <section className="border border-border rounded-md p-4 space-y-4">
        <h2 className="text-sm font-semibold">Datos personales</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              Email
            </Label>
            <Input id="email" value={profile.data?.email ?? ""} disabled />
            <p className="text-[11px] text-muted-foreground">
              El email se gestiona desde tu cuenta de autenticación.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-xs">
              Nombre completo
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Cómo quieres que te vean en Riel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatarUrl" className="text-xs">
              URL de avatar
            </Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
              Guardar cambios
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
