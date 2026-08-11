import * as vscode from "vscode";
import { findMermaidFences } from "./fences";

/** The command a lens runs. Takes the document and the line it was drawn over. */
export const OPEN_FENCE = "archyne.openFence";

/**
 * "Open on canvas", over every Mermaid block in a Markdown file.
 *
 * A CodeLens rather than a second custom editor, because the file is Markdown:
 * taking it over would mean replacing the editor for a document that is mostly
 * prose, and the diagram is one block inside it. A lens is additive — it
 * appears beside what you were already reading, and reaches Mermaid where most
 * of it actually lives.
 */
export class FenceLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private readonly watching: vscode.Disposable;

  constructor() {
    // VS Code re-asks on every document change by itself; the setting is the
    // one thing it cannot know has changed.
    this.watching = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("archyne.codeLens.enabled")) this.changed.fire();
    });
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration("archyne").get<boolean>("codeLens.enabled", true)) {
      return [];
    }
    return findMermaidFences(document.getText()).map(
      (fence) =>
        new vscode.CodeLens(new vscode.Range(fence.openLine, 0, fence.openLine, 0), {
          title: "Open on canvas",
          tooltip: "Edit this Mermaid block in Archyne",
          command: OPEN_FENCE,
          // The line, not the range. Between this lens being drawn and being
          // clicked the document may have changed, and a range would then
          // point into a document that no longer exists; the command re-scans
          // and locates the block itself. See `fenceAt`.
          arguments: [document.uri, fence.startLine],
        }),
    );
  }

  dispose(): void {
    this.watching.dispose();
    this.changed.dispose();
  }
}
