import * as vscode from "vscode";
import { parseBehaviorTreeDocument } from "./core/parse";
import { serializeBehaviorTreeDocument } from "./core/serialize";
import { BehaviorTreePreviewPanel } from "./panel";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("btreeTool");
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

  const openDocumentForResource = async (
    resource: vscode.Uri | undefined
  ): Promise<{ document: vscode.TextDocument; editor: vscode.TextEditor | undefined } | undefined> => {
    if (resource) {
      const document = await vscode.workspace.openTextDocument(resource);
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false
      });
      return { document, editor };
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    return {
      document: editor.document,
      editor
    };
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("btreeTool.openPreview", async (resource?: vscode.Uri) => {
      const target = await openDocumentForResource(resource);
      const editor = target?.editor;

      BehaviorTreePreviewPanel.createOrShow(context.extensionUri);
      syncPreview(editor);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("btreeTool.normalizeXml", async (resource?: vscode.Uri) => {
      const target = await openDocumentForResource(resource);
      const document = target?.document;

      if (!document || !isBehaviorTreeDocument(document)) {
        void vscode.window.showWarningMessage("Open a BehaviorTree XML document before running Normalize XML.");
        return;
      }

      try {
        const parsed = parseBehaviorTreeDocument(document.getText());
        const normalized = serializeBehaviorTreeDocument(parsed);

        if (normalized === document.getText()) {
          void vscode.window.showInformationMessage("BTreeTool: XML is already normalized.");
          return;
        }

        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );

        edit.replace(document.uri, fullRange, normalized);
        await vscode.workspace.applyEdit(edit);

        const warningCount = parsed.warnings.length;
        void vscode.window.showInformationMessage(
          warningCount > 0
            ? `BTreeTool: XML normalized. ${warningCount} warning${warningCount === 1 ? "" : "s"} remain in Problems.`
            : "BTreeTool: XML normalized."
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`BTreeTool: Normalize failed. ${message}`);
      }
    })
  );

  context.subscriptions.push(previewButton);
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      syncPreview(editor);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateDiagnostics(event.document);

      const activeDocument = vscode.window.activeTextEditor?.document;

      if (!activeDocument || activeDocument !== event.document) {
        return;
      }

      syncPreview(vscode.window.activeTextEditor);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      updateDiagnostics(document);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
    })
  );

  updatePreviewButton(vscode.window.activeTextEditor);
  vscode.workspace.textDocuments.forEach((document) => updateDiagnostics(document));
}

export function deactivate(): void {
  BehaviorTreePreviewPanel.disposeCurrent();
}
