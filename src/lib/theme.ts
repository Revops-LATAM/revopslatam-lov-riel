import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "riel-theme";

export function getStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* almacenamiento bloqueado: se usa el tema del sistema */
  }
  return "system";
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  const resolved = resolveTheme(pref);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function setThemePreference(pref: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* sin almacenamiento: el cambio vale solo para esta sesión */
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent("riel-theme-change"));
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => {
      const pref = getStoredTheme();
      setPreference(pref);
      setResolved(resolveTheme(pref));
    };
    sync();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
        sync();
      }
    };
    mql.addEventListener("change", onSystemChange);
    window.addEventListener("riel-theme-change", sync);
    return () => {
      mql.removeEventListener("change", onSystemChange);
      window.removeEventListener("riel-theme-change", sync);
    };
  }, []);

  const setTheme = useCallback((pref: ThemePreference) => setThemePreference(pref), []);
  return { preference, resolved, setTheme };
}

// Se inyecta en <head> antes de pintar para evitar el parpadeo claro → oscuro.
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");var d=p==="dark"||((p!=="light")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
