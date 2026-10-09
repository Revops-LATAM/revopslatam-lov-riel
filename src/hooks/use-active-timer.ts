import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveTimer, startTimer, stopTimer } from "@/lib/api/tasko.functions";
import { authUserQO } from "@/lib/api/auth.queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Unified active-timer state. Single source of truth for the global pill,
 * task drawers, and anywhere else that needs to read/start/stop a timer.
 *
 * - 1 query key, 1 realtime subscription (filtered by user_id), 1 tick loop.
 * - Optimistic invalidate on start/stop.
 * - `switchTask` cleanly stops + starts in one click.
 */
export function useActiveTimer() {
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveTimer);
  const startFn = useServerFn(startTimer);
  const stopFn = useServerFn(stopTimer);
  const { data: uid } = useQuery(authUserQO());

  const activeQ = useQuery({
    queryKey: ["active-timer"],
    queryFn: () => fetchActive(),
    enabled: !!uid,
    refetchInterval: 30000,
  });

  // Tick once per second only when a timer is active
  const [, force] = useState(0);
  useEffect(() => {
    if (!activeQ.data) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeQ.data]);

  // Realtime: scope to current user
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`active-timer-shared-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `user_id=eq.${uid}` },
        () => qc.invalidateQueries({ queryKey: ["active-timer"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, uid]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["active-timer"] });
    qc.invalidateQueries({ queryKey: ["my-time"] });
    qc.invalidateQueries({ queryKey: ["workload"] });
  };

  const startMut = useMutation({
    mutationFn: (taskId: string) => startFn({ data: { taskId } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Timer iniciado");
    },
    onError: (e: Error) => toast.error("No se pudo iniciar", { description: e.message }),
  });

  const stopMut = useMutation({
    mutationFn: () => stopFn(),
    onSuccess: () => {
      invalidateAll();
      toast.success("Timer detenido");
    },
    onError: (e: Error) => toast.error("No se pudo detener", { description: e.message }),
  });

  const switchMut = useMutation({
    mutationFn: async (taskId: string) => {
      await stopFn().catch(() => {});
      await startFn({ data: { taskId } });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Cambio de tarea");
    },
    onError: (e: Error) => toast.error("No se pudo cambiar", { description: e.message }),
  });

  const elapsedSecs = activeQ.data
    ? Math.max(0, Math.floor((Date.now() - new Date(activeQ.data.started_at).getTime()) / 1000))
    : 0;

  return {
    entry: activeQ.data,
    elapsedSecs,
    isLoading: activeQ.isLoading,
    start: (taskId: string) => startMut.mutate(taskId),
    stop: () => stopMut.mutate(),
    switchTask: (taskId: string) => switchMut.mutate(taskId),
    isMutating: startMut.isPending || stopMut.isPending || switchMut.isPending,
  };
}
