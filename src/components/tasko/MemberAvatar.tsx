import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
} | null;

// Paleta armonizada con la rampa de estados Riel (--st-*-text).
// Valores resueltos desde OKLCH del design system — garantizan contraste con inicial blanca.
const AVATAR_PALETTE = [
  "oklch(0.42 0.18 295)", // purple
  "oklch(0.44 0.13 245)", // blue
  "oklch(0.44 0.09 183)", // teal
  "oklch(0.44 0.17 355)", // magenta
  "oklch(0.50 0.15 45)",  // orange
  "oklch(0.51 0.12 75)",  // amber-text
  "oklch(0.48 0.18 25)",  // red
  "oklch(0.46 0.04 80)",  // stone
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}


export function MemberAvatar({
  profile,
  size = 24,
  className = "",
  shape = "square",
}: {
  profile: Profile;
  size?: number;
  className?: string;
  shape?: "square" | "circle";
}) {
  const initial = (profile?.full_name?.[0] ?? profile?.email?.[0] ?? "?").toUpperCase();
  const seed = profile?.id ?? profile?.email ?? "unknown";
  const bg = colorFor(seed);
  const radius = shape === "square" ? Math.max(4, Math.round(size * 0.22)) : size;
  return (
    <Avatar
      className={className}
      style={{ width: size, height: size, borderRadius: radius }}
      title={profile?.full_name ?? profile?.email ?? "Sin asignar"}
    >
      {profile?.avatar_url && (
        <AvatarImage src={profile.avatar_url} alt="" style={{ borderRadius: radius }} />
      )}
      <AvatarFallback
        className="font-semibold text-white"
        style={{
          backgroundColor: bg,
          borderRadius: radius,
          fontSize: Math.max(10, Math.round(size * 0.42)),
        }}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
