// Se ejecuta antes de `npm run build` (prebuild). Aborta el build si una variable VITE_* —que se incrusta en el
// JavaScript público del navegador— contiene algo que parece un secreto, o si la clave publishable no tiene
// formato de clave de Supabase. Sin variables VITE_* definidas (p. ej. en el CI) no hace nada.
const fail = [];
const env = process.env;

const pub = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (pub) {
  const looksOk = /^sb_publishable_[\w-]+$/.test(pub) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(pub);
  if (!looksOk) {
    const known = /^GOCSPX-/.test(pub)
      ? "parece un secreto de cliente de Google (empieza por GOCSPX-)"
      : /^sb_secret_/.test(pub)
        ? "es una clave SECRETA de Supabase (sb_secret_...)"
        : "no tiene formato de clave de Supabase (debe empezar por sb_publishable_ o ser el JWT anon)";
    fail.push(`VITE_SUPABASE_PUBLISHABLE_KEY ${known}.`);
  } else if (pub.startsWith("eyJ")) {
    try {
      const role = JSON.parse(Buffer.from(pub.split(".")[1], "base64url").toString()).role;
      if (role !== "anon")
        fail.push(`VITE_SUPABASE_PUBLISHABLE_KEY es un JWT con rol "${role}", no "anon".`);
    } catch {
      fail.push("VITE_SUPABASE_PUBLISHABLE_KEY no es un JWT legible.");
    }
  }
}
const url = env.VITE_SUPABASE_URL;
if (url && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
  fail.push("VITE_SUPABASE_URL no tiene la forma https://<proyecto>.supabase.co");
}
for (const [k, v] of Object.entries(env)) {
  if (k.startsWith("VITE_") && /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN)/i.test(k) && v) {
    fail.push(
      `${k}: las variables VITE_* son públicas (van dentro del JavaScript del navegador); no pongas secretos ahí.`,
    );
  }
}

if (fail.length) {
  console.error(
    "\n✗ Configuración de variables inválida: el build se detiene para no publicar un secreto.\n",
  );
  for (const f of fail) console.error("  - " + f);
  console.error(
    "\n  Corrige la variable en Vercel (Settings → Environment Variables) y vuelve a desplegar.\n",
  );
  process.exit(1);
}
