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
  dismiss: (id) => {
    clearTimer(id);
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  },
}));

/**
 * Dismissal timers, held outside React state.
 *
 * A message that removes itself on a timer is auto-updating content, and
 * WCAG 2.2.2 asks for a way to pause it — a reader who is slower than the
 * timer, or who was looking elsewhere when it appeared, otherwise never gets
 * to finish it. Hovering the stack or moving focus into it holds every
 * message; leaving resumes each one with the time it had left rather than
 * restarting it, so pausing cannot be used to make a toast permanent by
 * accident.
 */
const timers = new Map<number, { handle: ReturnType<typeof setTimeout>; endsAt: number }>();
let paused = false;

function arm(id: number, ms: number) {
  const handle = setTimeout(() => {
    timers.delete(id);
    useToasts.getState().dismiss(id);
  }, ms);
  timers.set(id, { handle, endsAt: Date.now() + ms });
}

function clearTimer(id: number) {
  const timer = timers.get(id);
  if (!timer) return;
  clearTimeout(timer.handle);
  timers.delete(id);
}

/** Hold every message on screen. Safe to call when already held. */
export function pauseToasts() {
  if (paused) return;
  paused = true;
  const now = Date.now();
  for (const [id, timer] of timers) {
    clearTimeout(timer.handle);
    // The entry stays, with `endsAt` rewritten as the remaining time so
    // `resumeToasts` can restore it.
    timers.set(id, { handle: timer.handle, endsAt: Math.max(0, timer.endsAt - now) });
  }
}

/** Let them expire again, each with whatever time it had left. */
export function resumeToasts() {
  if (!paused) return;
  paused = false;
  for (const [id, timer] of [...timers]) arm(id, timer.endsAt);
}

function show(text: string, tone: ToastTone) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
  // A message that arrives while the stack is held waits with the rest,
  // rather than being the one that vanishes mid-read.
  if (paused) timers.set(id, { handle: 0 as never, endsAt: DURATION[tone] });
  else arm(id, DURATION[tone]);
  return id;
}

/**
 * Show a transient message.
 *
 * Confirmations and failures used to land only inside the code panel, which
 * is hidden on the Preview tab and while working on the canvas — so a failed
 * save or export produced no visible feedback at all.
 *
 * Errors stay up more than twice as long as confirmations, because they
 * usually need reading.
 */
export function toast(
  key: MessageKey,
  tone: ToastTone = "info",
  params?: Record<string, string>,
) {
  return show(t(key, params), tone);
}

/** Report a thrown value without needing a message key for every failure. */
export function toastError(prefix: MessageKey, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  return show(`${t(prefix)}: ${detail}`, "error");
}
