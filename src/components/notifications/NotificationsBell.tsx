import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/api/notifications.functions";

const KIND_ICON: Record<string, string> = {
  mention: "💬",
  assignment_added: "📌",
  assignment_removed: "🗑️",
  status_change: "🔄",
  due_soon: "⏰",
  overdue: "🚨",
  ticket_new: "🎫",
  ticket_client_reply: "💌",
};

export function NotificationsBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const lastNotifiedRef = useRef<Set<string>>(new Set());

  const listFn = useServerFn(listNotifications);
  const countFn = useServerFn(countUnreadNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  // Session user id — required before any fetch so we never show another user's cache
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const listQ = useQuery({
    queryKey: ["notifications", "list", userId],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
    enabled: !!userId,
  });
  const countQ = useQuery({
    queryKey: ["notifications", "unread", userId],
    queryFn: () => countFn(),
    refetchInterval: 30_000,
    enabled: !!userId,
  });

  // Request desktop permission once (silently)
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Don't auto-prompt — wait until user opens the popover so it's contextual
    }
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          if (lastNotifiedRef.current.has(n.id)) return;
          lastNotifiedRef.current.add(n.id);

          // In-app toast
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.url
              ? {
                  label: "Ver",
                  onClick: () => navigate({ to: n.url! }),
                }
              : undefined,
          });

          // Desktop notification (if tab focused or granted)
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              const notif = new Notification(n.title, {
                body: n.body ?? "",
                icon: "/favicon.ico",
                tag: n.id,
              });
              notif.onclick = () => {
                window.focus();
                if (n.url) navigate({ to: n.url });
                notif.close();
              };
            } catch {
              /* ignore */
            }
          }

          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, navigate, qc]);

  const unread = countQ.data?.count ?? 0;
  const items = listQ.data ?? [];

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          /* ignore */
        }
      }
    }
  };

  const handleItemClick = async (n: AppNotification) => {
    if (!n.read_at) {
      await markReadFn({ data: { id: n.id } });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.url) navigate({ to: n.url });
    setOpen(false);
  };

  const handleMarkAll = async () => {
    await markAllFn();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full flex items-center justify-center"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-sm">Notificaciones</div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAll} className="h-7 text-xs">
                <CheckCheck className="h-3 w-3 mr-1" />
                Marcar leídas
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                navigate({ to: "/me/settings/notifications" });
              }}
              className="h-7 text-xs"
            >
              Ajustes
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[480px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No tienes notificaciones
            </div>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors flex gap-3 ${
                    !n.read_at ? "bg-accent/30" : ""
                  }`}
                >
                  <div className="text-lg leading-none pt-0.5">{KIND_ICON[n.kind] ?? "🔔"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    {n.body && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.body}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </div>
                  </div>
                  {!n.read_at && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
