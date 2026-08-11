import * as vscode from "vscode";
import { ArchyneEditorProvider } from "./editor";

/**
 * The extension is a shell around the editor that already exists: it hands a
 * VS Code `TextDocument` to the same bundle the web app and the desktop app
 * run, and hands the edits back. What it adds is where it runs — beside the
 * file, in the tool the diagram is already committed from.
 */
export function activate(context: vscode.ExtensionContext): void {
  const appRoot = vscode.Uri.joinPath(context.extensionUri, "media", "app");

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ArchyneEditorProvider.viewType,
      new ArchyneEditorProvider(appRoot),
      {
        // The canvas holds a parsed graph, a layout and an undo stack, none of
        // which survive the panel being torn down — and switching tabs is not
        // meant to be a way of discarding your history.
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("archyne.open", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showInformationMessage("Open a .mmd file first.");
        return;
      }
      await vscode.commands.executeCommand(
        "vscode.openWith",
        target,
        ArchyneEditorProvider.viewType,
      );
    }),
  );
}

export function deactivate(): void {}
