// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  // Destino de despliegue. Por defecto Vercel; se puede cambiar con NITRO_PRESET (p. ej. cloudflare-module).
  nitro: {
    preset: process.env.NITRO_PRESET || "vercel",
    // Hasta 60 s para la emisión de DTE y las tareas programadas. La región va en vercel.json.
    vercel: { functions: { maxDuration: 60 } },
    // El tipo del envoltorio de Lovable no declara la opción `vercel`, pero Nitro la aplica.
  } as unknown as NonNullable<Parameters<typeof defineConfig>[0]>["nitro"],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
  },
});
