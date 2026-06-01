import * as vscode from "vscode";
import { parseBehaviorTreeDocument } from "./core/parse";
import { BehaviorTreePreviewPanel } from "./panel";
import { createPreviewStatusBarController } from "./extension/statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("btreeTool");

  const isBehaviorTreeDocument = (document: vscode.TextDocument | undefined): boolean => {
    if (!document) {
      return false;
    }

    return document.languageId === "xml" || document.uri.fsPath.toLowerCase().endsWith(".xml");
  };

  const previewButton = createPreviewStatusBarController(isBehaviorTreeDocument);

  const buildRange = (document: vscode.TextDocument): vscode.Range => {
    if (document.lineCount === 0) {
      return new vscode.Range(0, 0, 0, 0);
    }

    const firstLineLength = document.lineAt(0).text.length;
    return new vscode.Range(0, 0, 0, Math.max(1, firstLineLength));
  };

  const updateDiagnostics = (document: vscode.TextDocument): void => {
    if (!isBehaviorTreeDocument(document)) {
      diagnostics.delete(document.uri);
      return;
    }

    const range = buildRange(document);

    try {
      const parsed = parseBehaviorTreeDocument(document.getText());
      const items = parsed.warnings.map(
        (warning) =>
          new vscode.Diagnostic(
            range,
            warning.message,
            warning.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
          )
      );

      items.forEach((item, index) => {
        item.source = "BTreeTool";
        item.code = parsed.warnings[index]?.code;
      });

      diagnostics.set(document.uri, items);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = "BTreeTool";
      diagnostic.code = "xml_parse_error";
      diagnostics.set(document.uri, [diagnostic]);
    }
  };

  const resolveBehaviorTreeDocument = async (
    resource: vscode.Uri | undefined
  ): Promise<vscode.TextDocument | undefined> => {
    if (resource) {
      if (resource.scheme !== "file") {
        return undefined;
      }

      const document = await vscode.workspace.openTextDocument(resource);
      if (!isBehaviorTreeDocument(document)) {
        return undefined;
      }

      await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false
      });
      return document;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    return isBehaviorTreeDocument(editor.document) ? editor.document : undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("btreeTool.openPreview", async (resource?: vscode.Uri) => {
      const document = await resolveBehaviorTreeDocument(resource);

      if (!document) {
        await BehaviorTreePreviewPanel.createOrShow(context.extensionUri, context.globalStorageUri, undefined);
        return;
      }

      await BehaviorTreePreviewPanel.createOrShow(context.extensionUri, context.globalStorageUri, document);
    })
  );
  const shortcutCommands: Array<[string, "copy" | "pasteSmart" | "undo" | "pasteAsChild" | "pasteBefore" | "pasteAfter"]> = [
    ["btreeTool.copyNode", "copy"],
    ["btreeTool.pasteNodeSmart", "pasteSmart"],
    ["btreeTool.undoEdit", "undo"],
    ["btreeTool.pasteNodeAsChild", "pasteAsChild"],
    ["btreeTool.pasteNodeBefore", "pasteBefore"],
    ["btreeTool.pasteNodeAfter", "pasteAfter"]
  ];

  shortcutCommands.forEach(([command, action]) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        BehaviorTreePreviewPanel.getActivePanel()?.postShortcutAction(action);
      })
    );
  });

  context.subscriptions.push(previewButton.item);
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      previewButton.update(editor);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateDiagnostics(event.document);
      BehaviorTreePreviewPanel.refreshIfAttached(event.document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      updateDiagnostics(document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      BehaviorTreePreviewPanel.refreshIfAttached(document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
    })
  );

  previewButton.update(vscode.window.activeTextEditor);
  vscode.workspace.textDocuments.forEach((document) => updateDiagnostics(document));
}

export function deactivate(): void {
  BehaviorTreePreviewPanel.disposeAll();
}
