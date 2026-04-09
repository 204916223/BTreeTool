import * as vscode from "vscode";
import { BehaviorTreePreviewPanel } from "./panel";

export function activate(context: vscode.ExtensionContext): void {
  const previewButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  previewButton.command = "btreeTool.openPreview";
  previewButton.name = "BTreeTool Preview";
  previewButton.text = "$(preview) Visualize BT";
  previewButton.tooltip = "Open the BTreeTool visualization for the current XML file";

  const isBehaviorTreeDocument = (document: vscode.TextDocument | undefined): boolean => {
    if (!document) {
      return false;
    }

    return document.languageId === "xml" || document.uri.fsPath.toLowerCase().endsWith(".xml");
  };

  const updatePreviewButton = (editor: vscode.TextEditor | undefined): void => {
    if (isBehaviorTreeDocument(editor?.document)) {
      previewButton.show();
      return;
    }

    previewButton.hide();
  };

  const syncPreview = (editor: vscode.TextEditor | undefined): void => {
    updatePreviewButton(editor);

    if (!BehaviorTreePreviewPanel.isOpen()) {
      return;
    }

    if (!editor?.document) {
      return;
    }

    BehaviorTreePreviewPanel.updateForDocument(editor.document);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("btreeTool.openPreview", async (resource?: vscode.Uri) => {
      let editor = vscode.window.activeTextEditor;

      if (resource) {
        const document = await vscode.workspace.openTextDocument(resource);
        editor = await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: false
        });
      }

      BehaviorTreePreviewPanel.createOrShow(context.extensionUri);
      syncPreview(editor);
    })
  );

  context.subscriptions.push(previewButton);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      syncPreview(editor);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const activeDocument = vscode.window.activeTextEditor?.document;

      if (!activeDocument || activeDocument !== event.document) {
        return;
      }

      syncPreview(vscode.window.activeTextEditor);
    })
  );

  updatePreviewButton(vscode.window.activeTextEditor);
}

export function deactivate(): void {
  BehaviorTreePreviewPanel.disposeCurrent();
}
