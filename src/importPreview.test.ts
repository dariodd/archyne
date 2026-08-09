import { beforeEach, describe, expect, it } from "vitest";
import { offerOpened, placeOpened, usePendingImport } from "./documents";
import { openAsMermaid } from "./importFile";
import { useGraphStore } from "./store";
import { useFileStore } from "./files";
import type { PickedFile } from "./files";

const picked = (name: string, content: string): PickedFile => ({
  name,
  content,
  path: `C:/work/${name}`,
  handle: null,
});

const DOT = "digraph { alpha -> beta }";
const MERMAID = 'flowchart TD\n  only["Only"]\n';

beforeEach(async () => {
  usePendingImport.setState({ pending: null });
  await useGraphStore.getState().applyCode('flowchart TD\n  before["Before"]\n');
});

describe("a conversion is shown before it lands", () => {
  it("does not touch the canvas until the preview is accepted", async () => {
    // The whole point: an import is lossy, and finding that out after it has
    // replaced what was on screen is too late.
    await offerOpened(await openAsMermaid(picked("deps.dot", DOT)));

    expect(useGraphStore.getState().code).toContain("Before");
    expect(usePendingImport.getState().pending).not.toBeNull();
  });

  it("holds the converted document, ready to be placed", async () => {
    await offerOpened(await openAsMermaid(picked("deps.dot", DOT)));
    const pending = usePendingImport.getState().pending!;

    expect(pending.file.name).toBe("deps.mmd");
    expect(pending.file.content).toContain("alpha --> beta");
    expect(pending.imported).toMatchObject({ format: "dot", nodes: 2, edges: 1 });
  });

  it("places it once accepted, and clears the offer", async () => {
    await offerOpened(await openAsMermaid(picked("deps.dot", DOT)));
    await placeOpened(usePendingImport.getState().pending!);

    expect(useGraphStore.getState().code).toContain("alpha --> beta");
    // Unbound and unsaved, as every import is.
    expect(useFileStore.getState().path).toBeNull();
    expect(useFileStore.getState().savedCode).toBeNull();
  });

  it("leaves nothing behind when the offer is declined", async () => {
    await offerOpened(await openAsMermaid(picked("deps.dot", DOT)));
    usePendingImport.setState({ pending: null });

    expect(useGraphStore.getState().code).toContain("Before");
    expect(useGraphStore.getState().code).not.toContain("alpha");
  });
});

describe("a Mermaid file is not a conversion", () => {
  it("opens straight away, with nothing to confirm", async () => {
    // There is no lossy step to check, so a dialog would only be in the way.
    await offerOpened(await openAsMermaid(picked("plain.mmd", MERMAID)));

    expect(usePendingImport.getState().pending).toBeNull();
    expect(useGraphStore.getState().code).toContain("Only");
  });

  it("keeps its file binding, unlike an import", async () => {
    await offerOpened(await openAsMermaid(picked("plain.mmd", MERMAID)));
    expect(useFileStore.getState().path).toBe("C:/work/plain.mmd");
    expect(useFileStore.getState().savedCode).toBe(MERMAID);
  });
});
