import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const authUserQO = () =>
  queryOptions({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return data.user.id;
    },
    staleTime: 60_000,
  });

export type CurrentProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
} | null;

export const currentProfileQO = () =>
  queryOptions({
    queryKey: ["current-profile"],
    queryFn: async (): Promise<CurrentProfile> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", u.user.id)
        .maybeSingle();
      return p ?? null;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
