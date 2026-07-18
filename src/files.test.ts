import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDirty, useFileStore } from "./files";
import { useGraphStore } from "./store";

const FLOWCHART = 'flowchart TD\n  a["One"] --> b["Two"]\n';

/** Minimal stand-in for the Electron preload bridge. */
function fakeDesktop(files: Record<string, string>) {
  return {
    openedFile: vi.fn(async () => null),
    onOpenFile: vi.fn(),
    showOpen: vi.fn(async () => ({ path: "C:\\work\\arch.mmd", content: files["arch"] })),
    showSave: vi.fn(async (_name: string, content: string) => {
      files["saved"] = content;
      return "C:\\work\\new.mmd";
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files[path] = content;
    }),
  };
}

beforeEach(() => {
  useFileStore.setState({ name: null, path: null, handle: null, savedCode: null });
});

afterEach(() => {
  delete (globalThis as { archyne?: unknown }).archyne;
  vi.restoreAllMocks();
});

describe("dirty tracking", () => {
  it("is clean before anything has been opened", async () => {
    await useGraphStore.getState().applyCode(FLOWCHART);
    // A scratch diagram is autosaved to localStorage; warning about it would
    // be noise, so "no file yet" counts as clean.
    expect(isDirty()).toBe(false);
  });

  it("goes dirty after an edit and clean again after saving", async () => {
    const files: Record<string, string> = { arch: FLOWCHART };
    (globalThis as { archyne?: unknown }).archyne = fakeDesktop(files);

    await useFileStore.getState().open();
    expect(useFileStore.getState().name).toBe("arch.mmd");
    expect(isDirty()).toBe(false);

    useGraphStore.getState().addNode({ type: "shape", shape: "square" }, { x: 0, y: 0 });
    expect(isDirty()).toBe(true);

    await useFileStore.getState().save();
    expect(isDirty()).toBe(false);
  });
});

describe("desktop bridge", () => {
  it("opens through the native dialog and keeps the real path", async () => {
    const files: Record<string, string> = { arch: FLOWCHART };
    (globalThis as { archyne?: unknown }).archyne = fakeDesktop(files);

    await useFileStore.getState().open();
    const s = useFileStore.getState();
    expect(s.path).toBe("C:\\work\\arch.mmd");
    expect(s.name).toBe("arch.mmd");
    expect(useGraphStore.getState().code).toBe(FLOWCHART);
  });

  it("saves back to the file that was opened, not a new copy", async () => {
    const files: Record<string, string> = { arch: FLOWCHART };
    const bridge = fakeDesktop(files);
    (globalThis as { archyne?: unknown }).archyne = bridge;

    await useFileStore.getState().open();
    useGraphStore.getState().addNode({ type: "shape", shape: "square" }, { x: 0, y: 0 });
    await useFileStore.getState().save();

    // The regression this guards: Save used to always produce a fresh
    // download instead of writing back to the opened file.
    expect(bridge.writeFile).toHaveBeenCalledOnce();
    expect(bridge.showSave).not.toHaveBeenCalled();
    expect(files["C:\\work\\arch.mmd"]).toBe(useGraphStore.getState().code);
  });

  it("falls back to Save As when nothing is open yet", async () => {
    const files: Record<string, string> = { arch: FLOWCHART };
    const bridge = fakeDesktop(files);
    (globalThis as { archyne?: unknown }).archyne = bridge;

    await useGraphStore.getState().applyCode(FLOWCHART);
    await useFileStore.getState().save();

    expect(bridge.showSave).toHaveBeenCalledOnce();
    expect(useFileStore.getState().path).toBe("C:\\work\\new.mmd");
  });

  it("adopts a file the shell was launched with", async () => {
    (globalThis as { archyne?: unknown }).archyne = fakeDesktop({});
    await useFileStore.getState().adopt({ path: "/tmp/launch.mmd", content: FLOWCHART });

    expect(useFileStore.getState().name).toBe("launch.mmd");
    expect(useGraphStore.getState().code).toBe(FLOWCHART);
    expect(isDirty()).toBe(false);
  });
});

describe("browsers without a file picker", () => {
  it("signals that the caller should use the <input type=file> fallback", async () => {
    // No desktop bridge and no showSaveFilePicker in jsdom.
    await expect(useFileStore.getState().open()).rejects.toThrow("no-picker");
  });
});
