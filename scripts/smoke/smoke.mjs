// Prueba de humo en un navegador real contra una instancia ya levantada.
// Uso: node scripts/smoke/smoke.mjs http://127.0.0.1:8787   (CHROME_PATH opcional)
// Protege contra la "pantalla en blanco": /login debe renderizar y una ruta protegida sin sesión
// debe redirigir a /login, sin bucles ni errores de página.
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox"],
});
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "OK  " : "FALLA"} ${msg}`);
  if (!ok) failed = true;
};

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
const resp = await page.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 30000 });
const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check(resp.status() === 200, "/login responde 200");
check(text.includes("Continuar con Google"), "/login muestra el botón de Google");
check(errors.length === 0, `/login sin errores de página ${errors[0] ?? ""}`);

const guarded = await browser.newPage();
await guarded.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
await guarded.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
check(
  guarded.url().includes("/login"),
  `ruta protegida redirige a /login (${guarded.url().replace(base, "")})`,
);

const deep = await browser.newPage();
await deep.goto(`${base}/w/demo/projects`, { waitUntil: "domcontentloaded", timeout: 30000 });
await deep.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
check(
  deep.url().includes("/login") && deep.url().includes("redirect="),
  "ruta profunda redirige a /login conservando ?redirect",
);

const health = await fetch(`${base}/api/public/health`);
const hj = await health.json().catch(() => ({}));
check(
  health.status === 200 &&
    Array.isArray(hj.missing) &&
    hj.missing.length === 0 &&
    !("ok" in hj && hj.ok === undefined),
  `/api/public/health responde y no faltan variables obligatorias (${JSON.stringify(hj.missing)})`,
);

const cron = await fetch(`${base}/api/public/cron/asana-sync`, { method: "POST" });
check(cron.status === 401, "los endpoints cron exigen clave (401)");
const missing = await fetch(`${base}/ruta-que-no-existe`);
check(missing.status === 404, "ruta inexistente responde 404");

await browser.close();
process.exit(failed ? 1 : 0);
