import { create } from "zustand";
import { t, type MessageKey } from "./i18n";

export type ToastTone = "info" | "error";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  dismiss: (id: number) => void;
}

const DURATION = { info: 2600, error: 6000 };

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/**
 * Show a transient message.
 *
 * Confirmations and failures used to land only inside the code panel, which
 * is hidden on the Preview tab and while working on the canvas — so a failed
 * save or export produced no visible feedback at all.
 *
 * Errors stay up more than twice as long as confirmations and are dismissed
 * by hand rather than on a timer, because they usually need reading.
 */
export function toast(
  key: MessageKey,
  tone: ToastTone = "info",
  params?: Record<string, string>,
) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text: t(key, params), tone }] }));
  setTimeout(() => useToasts.getState().dismiss(id), DURATION[tone]);
  return id;
}

/** Report a thrown value without needing a message key for every failure. */
export function toastError(prefix: MessageKey, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  const id = nextId++;
  useToasts.setState((s) => ({
    toasts: [...s.toasts, { id, text: `${t(prefix)}: ${detail}`, tone: "error" }],
  }));
  setTimeout(() => useToasts.getState().dismiss(id), DURATION.error);
  return id;
}
