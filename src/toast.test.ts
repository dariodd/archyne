import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pauseToasts, resumeToasts, toast, useToasts } from "./toast";

/**
 * WCAG 2.2.2: a message that removes itself on a timer has to be pausable,
 * or a reader slower than the timer never finishes it.
 */
beforeEach(() => {
  vi.useFakeTimers();
  useToasts.setState({ toasts: [] });
});

afterEach(() => {
  // Leave nothing armed for the next test.
  resumeToasts();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const count = () => useToasts.getState().toasts.length;

describe("toast dismissal", () => {
  it("clears itself once its time is up", () => {
    toast("toast.saved");
    expect(count()).toBe(1);
    vi.advanceTimersByTime(2600);
    expect(count()).toBe(0);
  });

  it("stays while paused, however long the pause lasts", () => {
    toast("toast.saved");
    pauseToasts();
    vi.advanceTimersByTime(60_000);
    expect(count()).toBe(1);
  });

  it("resumes with the time it had left, not a fresh timer", () => {
    toast("toast.saved");
    vi.advanceTimersByTime(2000); // 600ms left
    pauseToasts();
    vi.advanceTimersByTime(10_000);
    resumeToasts();

    vi.advanceTimersByTime(500);
    expect(count()).toBe(1); // not yet
    vi.advanceTimersByTime(200);
    expect(count()).toBe(0); // the remaining 600ms, not another 2600
  });

  it("holds a message that arrives during a pause", () => {
    pauseToasts();
    toast("toast.saved");
    vi.advanceTimersByTime(60_000);
    expect(count()).toBe(1);

    resumeToasts();
    vi.advanceTimersByTime(2600);
    expect(count()).toBe(0);
  });

  it("can still be dismissed by hand while paused", () => {
    const id = toast("toast.saved");
    pauseToasts();
    useToasts.getState().dismiss(id);
    expect(count()).toBe(0);
  });

  it("gives errors longer than confirmations", () => {
    toast("toast.saved");
    toast("toast.saveFailed", "error");
    vi.advanceTimersByTime(2600);
    expect(count()).toBe(1); // the error is still there
    vi.advanceTimersByTime(3400);
    expect(count()).toBe(0);
  });
});
