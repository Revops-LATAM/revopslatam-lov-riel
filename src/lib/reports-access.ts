import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { canViewReports } from "@/lib/api/me.functions";

/** Reportes: sólo super_admin y el gerente de operaciones. */
export function useCanViewReports() {
  const fn = useServerFn(canViewReports);
  const q = useQuery({
    queryKey: ["can-view-reports"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  return q.data?.allowed ?? false;
}
