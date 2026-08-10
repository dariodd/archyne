import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { metaRuns } from "./metaFold";

const state = (doc: string) => EditorState.create({ doc });

/**
 * Which lines the editor offers to fold away. The folding itself is
 * CodeMirror's; what is ours is deciding where a machine-written section
 * starts and ends — and never swallowing a line somebody wrote.
 */
describe("metadata runs", () => {
  it("finds nothing in a diagram that carries no metadata", () => {
    expect(metaRuns(state("flowchart TD\n  a --> b\n"))).toEqual([]);
  });

  it("takes consecutive metadata lines as one section", () => {
    const doc =
      'flowchart TD\n  a --> b\n%% graph:positions {"a":1}\n%% graph:styles {"a":2}\n';
    const runs = metaRuns(state(doc));
    expect(runs).toHaveLength(1);
    expect(runs[0].names).toEqual(["positions", "styles"]);
    expect(doc.slice(runs[0].from, runs[0].to)).toBe(
      '%% graph:positions {"a":1}\n%% graph:styles {"a":2}',
    );
  });

  it("keeps sections apart when something sits between them", () => {
    const doc = "flowchart TD\n%% graph:positions {}\n  a --> b\n%% graph:styles {}\n";
    expect(metaRuns(state(doc)).map((r) => r.names)).toEqual([["positions"], ["styles"]]);
  });

  it("leaves an author's own comment alone", () => {
    // Only `%% graph:` is machine-written; `%% why this is here` is prose,
    // and folding somebody's note away would be taking their words off screen.
    const doc = "flowchart TD\n%% the happy path\n  a --> b\n";
    expect(metaRuns(state(doc))).toEqual([]);
  });
});
