import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore, loadInitialCode, SAMPLE } from "./store";
import { useFileStore } from "./files";
import {
  createDoc,
  deleteDoc,
  documentList,
  duplicateDoc,
  renameDoc,
  switchTo,
} from "./documents";
import { DOC_PREFIX, INDEX_KEY, LEGACY_KEY, loadWorkspace, useWorkspace } from "./workspace";

const FLOWCHART = `flowchart TD\n  a["A"] --> b["B"]\n`;
const OTHER = `flowchart LR\n  x["X"] --> y["Y"]\n`;

/** Boot the app the way `main.tsx` does, from whatever is in localStorage. */
async function boot() {
  const code = loadInitialCode();
  await useGraphStore.getState().applyCode(code, { record: false });
}

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ docs: [], activeId: "" });
  useFileStore.setState({ name: null, path: null, handle: null, savedCode: null });
});

describe("migration from the single-document era", () => {
  it("adopts an existing graph:code diagram instead of discarding it", async () => {
    localStorage.setItem(LEGACY_KEY, FLOWCHART);
    await boot();

    expect(useGraphStore.getState().code).toBe(FLOWCHART);
    expect(documentList()).toHaveLength(1);
    // The old key is cleared only once the document exists under the new one.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    const [doc] = documentList();
    expect(localStorage.getItem(DOC_PREFIX + doc.id)).toBe(FLOWCHART);
  });

  it("starts with one sample document when there is nothing stored", async () => {
    await boot();
    expect(documentList()).toHaveLength(1);
    expect(useGraphStore.getState().code).toBe(SAMPLE);
  });

  it("survives a corrupted index rather than failing to boot", async () => {
    localStorage.setItem(INDEX_KEY, "{not json");
    await boot();
    expect(documentList()).toHaveLength(1);
  });
});

describe("switching documents", () => {
  it("keeps each document's source separate", async () => {
    await boot();
    const [first] = documentList();

    useGraphStore.getState().setCodeFromEditor(FLOWCHART);
    await useGraphStore.getState().applyCode(FLOWCHART, { record: false });

    const second = await createDoc();
    await useGraphStore.getState().applyCode(OTHER, { record: false });
    expect(useGraphStore.getState().code).toBe(OTHER);

    await switchTo(first.id);
    expect(useGraphStore.getState().code).toBe(FLOWCHART);

    await switchTo(second);
    expect(useGraphStore.getState().code).toBe(OTHER);
  });

  it("does not let undo reach across documents", async () => {
    await boot();
    const first = useWorkspace.getState().activeId;

    // Build some history in the first document.
    await useGraphStore.getState().applyCode(FLOWCHART, { record: true });
    expect(useGraphStore.getState().canUndo).toBe(true);

    const second = await createDoc();
    // A fresh document starts with nothing to undo, so undo cannot replay a
    // snapshot belonging to the other one over it.
    expect(useGraphStore.getState().canUndo).toBe(false);
    await useGraphStore.getState().undo();
    expect(useGraphStore.getState().code).toBe(SAMPLE);

    // The first document's history is still there when we go back.
    await switchTo(first);
    expect(useGraphStore.getState().canUndo).toBe(true);
    void second;
  });

  it("carries the file binding with the document, not the window", async () => {
    await boot();
    const first = useWorkspace.getState().activeId;
    useFileStore.setState({
      name: "a.mmd",
      path: "/tmp/a.mmd",
      handle: null,
      savedCode: SAMPLE,
    });

    const second = await createDoc();
    // A new scratch document is not bound to the file the other one owns.
    expect(useFileStore.getState().path).toBeNull();
    expect(useFileStore.getState().name).toBeNull();

    await switchTo(first);
    expect(useFileStore.getState().path).toBe("/tmp/a.mmd");
    expect(useFileStore.getState().name).toBe("a.mmd");
    void second;
  });
});

describe("managing documents", () => {
  it("names new documents without colliding", async () => {
    await boot();
    await createDoc();
    await createDoc();
    const names = documentList()
      .map((d) => d.name)
      .sort();
    expect(new Set(names).size).toBe(3);
    expect(names).toContain("Untitled");
  });

  it("renames without touching the file on disk", async () => {
    await boot();
    const id = useWorkspace.getState().activeId;
    useFileStore.setState({
      name: "a.mmd",
      path: "/tmp/a.mmd",
      handle: null,
      savedCode: SAMPLE,
    });

    renameDoc(id, "  Architecture  ");
    expect(documentList()[0].name).toBe("Architecture");
    // The path is the file; the name is only a label.
    expect(useFileStore.getState().path).toBe("/tmp/a.mmd");
  });

  it("ignores an empty rename", async () => {
    await boot();
    const id = useWorkspace.getState().activeId;
    const before = documentList()[0].name;
    renameDoc(id, "   ");
    expect(documentList().find((d) => d.id === id)?.name).toBe(before);
  });

  it("duplicates the unsaved content, unbound from the original file", async () => {
    await boot();
    const id = useWorkspace.getState().activeId;
    useFileStore.setState({
      name: "a.mmd",
      path: "/tmp/a.mmd",
      handle: null,
      savedCode: SAMPLE,
    });
    await useGraphStore.getState().applyCode(FLOWCHART, { record: false });

    await duplicateDoc(id);
    expect(useGraphStore.getState().code).toBe(FLOWCHART);
    // Saving the copy must not overwrite the file the original owns.
    expect(useFileStore.getState().path).toBeNull();
    expect(documentList()).toHaveLength(2);
  });

  it("replaces the last document rather than leaving an empty workspace", async () => {
    await boot();
    const id = useWorkspace.getState().activeId;
    await deleteDoc(id);

    const docs = documentList();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).not.toBe(id);
    expect(localStorage.getItem(DOC_PREFIX + id)).toBeNull();
  });

  it("moves to another document when the active one is deleted", async () => {
    await boot();
    const first = useWorkspace.getState().activeId;
    const second = await createDoc();
    await useGraphStore.getState().applyCode(OTHER, { record: false });

    await deleteDoc(second);
    expect(useWorkspace.getState().activeId).toBe(first);
    expect(documentList()).toHaveLength(1);
  });

  it("leaves the active document alone when another is deleted", async () => {
    await boot();
    const first = useWorkspace.getState().activeId;
    const second = await createDoc();
    await useGraphStore.getState().applyCode(OTHER, { record: false });

    await deleteDoc(first);
    expect(useWorkspace.getState().activeId).toBe(second);
    expect(useGraphStore.getState().code).toBe(OTHER);
  });
});

describe("persistence", () => {
  it("reloads into the document that was open", async () => {
    await boot();
    await createDoc();
    await useGraphStore.getState().applyCode(OTHER, { record: false });
    const activeId = useWorkspace.getState().activeId;

    // Simulate a reload: same localStorage, fresh stores.
    useWorkspace.setState({ docs: [], activeId: "" });
    const reloaded = loadWorkspace(SAMPLE);
    expect(reloaded.state.activeId).toBe(activeId);
    expect(reloaded.code).toBe(OTHER);
    expect(reloaded.state.docs).toHaveLength(2);
  });

  it("does not persist file handles, which cannot survive JSON", async () => {
    await boot();
    const id = useWorkspace.getState().activeId;
    useFileStore.setState({
      name: "a.mmd",
      path: null,
      handle: {} as FileSystemFileHandle,
      savedCode: SAMPLE,
    });
    await createDoc(); // captures the active document on the way out

    const stored = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "{}") as {
      docs: Array<Record<string, unknown>>;
    };
    const entry = stored.docs.find((d) => d.id === id);
    expect(entry).toBeDefined();
    expect("handle" in (entry ?? {})).toBe(false);
  });
});
