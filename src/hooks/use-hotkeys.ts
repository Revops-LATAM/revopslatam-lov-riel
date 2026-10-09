import { useEffect, useRef } from "react";

/**
 * Returns true when the focused element is a text input (so hotkeys should be ignored).
 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

type Handler = (e: KeyboardEvent) => void;

/**
 * Single-key hotkey (ignored while typing in inputs). Use `allowInInputs` to override.
 */
export function useHotkey(
  key: string,
  handler: Handler,
  options: { allowInInputs?: boolean; enabled?: boolean } = {},
) {
  const { allowInInputs = false, enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!allowInInputs && isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() === key.toLowerCase()) handlerRef.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, allowInInputs, enabled]);
}

/**
 * Sequence hotkey, e.g. `["g", "p"]`. Sequence resets after 1.2s.
 */
export function useHotkeySequence(
  sequence: string[],
  handler: () => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || sequence.length === 0) return;
    let idx = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reset = () => {
      idx = 0;
      if (timer) clearTimeout(timer);
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return reset();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const expected = sequence[idx].toLowerCase();
      if (e.key.toLowerCase() === expected) {
        idx++;
        if (idx === sequence.length) {
          handlerRef.current();
          reset();
        } else {
          if (timer) clearTimeout(timer);
          timer = setTimeout(reset, 1200);
        }
      } else {
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [sequence, enabled]);
}
