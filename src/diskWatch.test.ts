import { beforeEach, describe, expect, it } from "vitest";
import { pollDisk, readIfChanged, resetWatched } from "./diskWatch";
import { useGraphStore } from "./store";
import { useFileStore } from "./files";
import { INDEX_KEY, readDocCode, useWorkspace, writeDocCode } from "./workspace";
import { useToasts } from "./toast";

/**
 * Noticing that an open file changed underneath the editor.
 *
 * The rule the whole thing hangs on: a document with unsaved changes is never
 * overwritten. Everything else is bookkeeping around that.
 */

const ONE = 'flowchart TD\n  a["One"] --> b["Two"]\n';
const TWO = 'flowchart TD\n  a["Changed"] --> b["Two"]\n';

/** A stand-in for `FileSystemFileHandle` — only two methods are ever used. */
function fakeHandle(content: string, lastModified: number) {
  const state = { content, lastModified };
  return {
    handle: {
      name: "diagram.mmd",
      getFile: () =>
        Promise.resolve({
          lastModified: state.lastModified,
          text: () => Promise.resolve(state.content),
        }),
    } as unknown as FileSystemFileHandle,
    /** Simulate something else writing to the file. */
    write(next: string, at: number) {
      state.content = next;
      state.lastModified = at;
    },
  };
}

/** One file-backed document, already opened and in sync with disk. */
async function openDocument(content: string, at: number) {
  const file = fakeHandle(content, at);
  await useGraphStore.getState().applyCode(content);
  const code = useGraphStore.getState().code;
  writeDocCode("d1", code);
  useWorkspace.setState({
    activeId: "d1",
    docs: [
      {
        id: "d1",
        name: "diagram.mmd",
        updatedAt: 1,
        path: null,
        handle: file.handle,
        savedCode: code,
      },
    ],
  });
  useFileStore.setState({
    name: "diagram.mmd",
    path: null,
    handle: file.handle,
    savedCode: code,
  });
  // The first pass records where the file started; opening is not changing.
  await pollDisk();
  return file;
}

const toastTexts = () => useToasts.getState().toasts.map((t) => t.text);

beforeEach(() => {
  resetWatched();
  localStorage.clear();
  localStorage.setItem(INDEX_KEY, JSON.stringify({ v: 1, activeId: "", docs: [] }));
  useToasts.setState({ toasts: [] });
  useGraphStore.setState({ unsupported: null, parseError: null, warning: null });
});

describe("reading a file only when it changed", () => {
  it("says nothing when the file is no newer than what was seen", async () => {
    const { handle } = fakeHandle(ONE, 1000);
    expect(await readIfChanged({ path: null, handle }, 1000)).toBeNull();
  });

  it("returns the new text once it is newer", async () => {
    const file = fakeHandle(ONE, 1000);
    file.write(TWO, 2000);
    expect(await readIfChanged({ path: null, handle: file.handle }, 1000)).toEqual({
      stamp: 2000,
      content: TWO,
    });
  });

  it("says nothing when there is no file behind the document", async () => {
    expect(await readIfChanged({ path: null, handle: null }, 0)).toBeNull();
  });

  it("says nothing rather than throwing when the file cannot be read", async () => {
    const handle = {
      getFile: () => Promise.reject(new Error("gone")),
    } as unknown as FileSystemFileHandle;
    // Catching a file mid-write, moved or deleted is normal, not reportable.
    expect(await readIfChanged({ path: null, handle }, 0)).toBeNull();
  });
});

describe("a file that changed under a clean document", () => {
  it("loads the new version onto the canvas", async () => {
    const file = await openDocument(ONE, 1000);
    file.write(TWO, 2000);
    await pollDisk();
    expect(useGraphStore.getState().code).toContain("Changed");
  });

  it("counts as saved, so the change is not offered back as unsaved work", async () => {
    const file = await openDocument(ONE, 1000);
    file.write(TWO, 2000);
    await pollDisk();
    expect(useFileStore.getState().savedCode).toBe(useGraphStore.getState().code);
  });

  it("says what happened", async () => {
    const file = await openDocument(ONE, 1000);
    file.write(TWO, 2000);
    await pollDisk();
    expect(toastTexts().join(" ")).toContain("diagram.mmd");
  });

  it("does nothing at all on the pass that first sees the file", async () => {
    await openDocument(ONE, 1000);
    // `openDocument` already polled once; opening a file is not a change.
    expect(toastTexts()).toEqual([]);
  });

  it("catches a file that had already changed when it was first looked at", async () => {
    const file = fakeHandle(ONE, 1000);
    await useGraphStore.getState().applyCode(ONE);
    const code = useGraphStore.getState().code;
    writeDocCode("d1", code);
    useWorkspace.setState({
      activeId: "d1",
      docs: [
        {
          id: "d1",
          name: "diagram.mmd",
          updatedAt: 1,
          path: null,
          handle: file.handle,
          savedCode: code,
        },
      ],
    });
    useFileStore.setState({
      name: "diagram.mmd",
      path: null,
      handle: file.handle,
      savedCode: code,
    });
    // Rewritten before the watcher ever ran — in the two seconds after the
    // file was opened, or while the app was closed.
    file.write(TWO, 2000);
    await pollDisk();
    expect(useGraphStore.getState().code).toContain("Changed");
  });

  it("ignores a write that produced the same text", async () => {
    const file = await openDocument(ONE, 1000);
    file.write(useGraphStore.getState().code, 3000);
    await pollDisk();
    // This is what the app's own save looks like from here.
    expect(toastTexts()).toEqual([]);
  });

  it("stops repeating itself once it has caught up", async () => {
    const file = await openDocument(ONE, 1000);
    file.write(TWO, 2000);
    await pollDisk();
    await pollDisk();
    await pollDisk();
    expect(toastTexts()).toHaveLength(1);
  });
});

describe("a file that changed under unsaved work", () => {
  it("keeps what is on the canvas", async () => {
    const file = await openDocument(ONE, 1000);
    useGraphStore.getState().updateNodeData("a", { label: "Mine" });
    const mine = useGraphStore.getState().code;
    file.write(TWO, 2000);
    await pollDisk();
    expect(useGraphStore.getState().code).toBe(mine);
  });

  it("says so, rather than losing the change quietly", async () => {
    const file = await openDocument(ONE, 1000);
    useGraphStore.getState().updateNodeData("a", { label: "Mine" });
    file.write(TWO, 2000);
    await pollDisk();
    expect(toastTexts().join(" ")).toContain("diagram.mmd");
    expect(useToasts.getState().toasts[0].tone).toBe("error");
  });

  it("warns once, not every two seconds", async () => {
    const file = await openDocument(ONE, 1000);
    useGraphStore.getState().updateNodeData("a", { label: "Mine" });
    file.write(TWO, 2000);
    await pollDisk();
    await pollDisk();
    await pollDisk();
    expect(toastTexts()).toHaveLength(1);
  });
});

describe("a file behind a document that is not on screen", () => {
  it("refreshes it in place without stealing the canvas", async () => {
    const file = await openDocument(ONE, 1000);
    // Switch the workspace to a second document, leaving d1 in the background.
    useWorkspace.setState({
      activeId: "d2",
      docs: [
        ...useWorkspace.getState().docs,
        { id: "d2", name: "other", updatedAt: 2, path: null, handle: null, savedCode: null },
      ],
    });
    const onScreen = useGraphStore.getState().code;

    file.write(TWO, 2000);
    await pollDisk();

    expect(readDocCode("d1")).toContain("Changed");
    // The canvas still shows the document the user is looking at.
    expect(useGraphStore.getState().code).toBe(onScreen);
  });
});
