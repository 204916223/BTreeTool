import * as vscode from "vscode";
import { deleteNode, insertNode, moveNode, replaceNodeAttributes } from "./core/edit";
import { parseBehaviorTreeDocument } from "./core/parse";
import { serializeBehaviorTreeDocument } from "./core/serialize";
import { BtPreviewDocument, buildPreviewDocument } from "./core/viewModel";

type PreviewPayload = {
  fileName: string;
  languageId: string;
  hasDocument: boolean;
  preview: BtPreviewDocument | null;
  parseError: string | null;
};

type WebviewMessage =
  | { type?: string }
  | {
      type: "updateNodeAttributes";
      payload?: {
        treeId?: string;
        nodePath?: string;
        attributes?: Record<string, string>;
      };
    }
  | {
      type: "revealTreeNodesModel";
    }
  | {
      type: "moveNode";
      payload?: {
        treeId?: string;
        sourceNodePath?: string;
        targetParentPath?: string;
        targetIndex?: number;
      };
    }
  | {
      type: "createNode";
      payload?: {
        treeId?: string;
        targetParentPath?: string;
        targetIndex?: number;
        nodeKey?: string;
        nodeCategory?: string;
      };
    }
  | {
      type: "deleteNode";
      payload?: {
        treeId?: string;
        nodePath?: string;
      };
    };

export class BehaviorTreePreviewPanel {
  private static currentPanel: BehaviorTreePreviewPanel | undefined;
  private static readonly emptyPayload: PreviewPayload = {
    fileName: "No active document",
    languageId: "unknown",
    hasDocument: false,
    preview: null,
    parseError: null
  };

  static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (BehaviorTreePreviewPanel.currentPanel) {
      BehaviorTreePreviewPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "btreeTool.preview",
      "BTreeTool Preview",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]
      }
    );

    BehaviorTreePreviewPanel.currentPanel = new BehaviorTreePreviewPanel(panel, extensionUri);
  }

  static isOpen(): boolean {
    return Boolean(BehaviorTreePreviewPanel.currentPanel);
  }

  static updateForDocument(document: vscode.TextDocument | undefined): void {
    BehaviorTreePreviewPanel.currentPanel?.pushDocument(document);
  }

  static disposeCurrent(): void {
    BehaviorTreePreviewPanel.currentPanel?.dispose();
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private latestPayload: PreviewPayload = BehaviorTreePreviewPanel.emptyPayload;
  private latestDocumentUri: vscode.Uri | null = null;
  private webviewReady = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.cleanup(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        if (message.type === "ready") {
          this.webviewReady = true;
          this.postLatestPayload();
          return;
        }

        if (message.type === "updateNodeAttributes" && "payload" in message) {
          void this.handleUpdateNodeAttributes(message.payload);
          return;
        }

        if (message.type === "revealTreeNodesModel") {
          void this.revealTreeNodesModel();
          return;
        }

        if (message.type === "moveNode" && "payload" in message) {
          void this.handleMoveNode(message.payload);
          return;
        }

        if (message.type === "createNode" && "payload" in message) {
          void this.handleCreateNode(message.payload);
          return;
        }

        if (message.type === "deleteNode" && "payload" in message) {
          void this.handleDeleteNode(message.payload);
          return;
        }
      },
      null,
      this.disposables
    );
  }

  private pushDocument(document: vscode.TextDocument | undefined): void {
    this.latestDocumentUri = document?.uri ?? null;
    this.latestPayload = this.toPayload(document);

    if (!this.webviewReady) {
      return;
    }

    this.postLatestPayload();
  }

  private postLatestPayload(): void {
    this.panel.webview.postMessage({
      type: "btreeDocument",
      payload: this.latestPayload
    });
  }

  private postEditResult(ok: boolean, message: string): void {
    this.panel.webview.postMessage({
      type: "editResult",
      payload: {
        ok,
        message
      }
    });
  }

  private async refreshPreviewFromUri(): Promise<void> {
    if (!this.latestDocumentUri) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
    this.latestPayload = this.toPayload(document);

    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  private toPayload(document: vscode.TextDocument | undefined): PreviewPayload {
    if (!document) {
      return BehaviorTreePreviewPanel.emptyPayload;
    }

    return {
      fileName: document.fileName,
      languageId: document.languageId,
      hasDocument: true,
      ...this.buildPayloadState(document.getText())
    };
  }

  private buildPayloadState(source: string): Pick<PreviewPayload, "preview" | "parseError"> {
    try {
      const ast = parseBehaviorTreeDocument(source);
      return {
        preview: buildPreviewDocument(ast),
        parseError: null
      };
    } catch (error) {
      return {
        preview: null,
        parseError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleUpdateNodeAttributes(
    payload: { treeId?: string; nodePath?: string; attributes?: Record<string, string> } | undefined
  ): Promise<void> {
    if (!this.latestDocumentUri) {
      this.postEditResult(false, "No XML document is currently attached to the preview.");
      return;
    }

    if (!payload?.treeId || !payload.nodePath || !payload.attributes) {
      this.postEditResult(false, "The webview sent an incomplete node edit request.");
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const parsed = parseBehaviorTreeDocument(document.getText());
      replaceNodeAttributes(parsed, payload.treeId, payload.nodePath, payload.attributes);
      const nextXml = serializeBehaviorTreeDocument(parsed);

      if (nextXml === document.getText()) {
        this.postEditResult(true, "Node attributes already match the current XML.");
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

      edit.replace(document.uri, fullRange, nextXml);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        throw new Error("VS Code rejected the XML update.");
      }

      await this.refreshPreviewFromUri();
      this.postEditResult(true, "Node attributes applied.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `Failed to apply node attributes. ${message}`);
    }
  }

  private async revealTreeNodesModel(): Promise<void> {
    if (!this.latestDocumentUri) {
      void vscode.window.showWarningMessage("BTreeTool: No XML document is attached to the preview.");
      return;
    }

    const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
    const source = document.getText();
    const modelOffset = source.indexOf("<TreeNodesModel");
    const rootOffset = source.indexOf("<root");
    const targetOffset = modelOffset >= 0 ? modelOffset : rootOffset >= 0 ? rootOffset : 0;
    const targetPosition = document.positionAt(targetOffset);

    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });

    editor.selection = new vscode.Selection(targetPosition, targetPosition);
    editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
  }

  private async handleMoveNode(
    payload: { treeId?: string; sourceNodePath?: string; targetParentPath?: string; targetIndex?: number } | undefined
  ): Promise<void> {
    if (!this.latestDocumentUri) {
      this.postEditResult(false, "No XML document is currently attached to the preview.");
      return;
    }

    const targetIndex = payload?.targetIndex;

    if (
      !payload?.treeId ||
      !payload.sourceNodePath ||
      !payload.targetParentPath ||
      typeof targetIndex !== "number" ||
      !Number.isInteger(targetIndex)
    ) {
      this.postEditResult(false, "The webview sent an incomplete node move request.");
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const parsed = parseBehaviorTreeDocument(document.getText());
      moveNode(parsed, payload.treeId, payload.sourceNodePath, payload.targetParentPath, targetIndex);
      const nextXml = serializeBehaviorTreeDocument(parsed);

      if (nextXml === document.getText()) {
        this.postEditResult(true, "Node order already matches the current XML.");
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
      edit.replace(document.uri, fullRange, nextXml);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        throw new Error("VS Code rejected the XML update.");
      }

      await this.refreshPreviewFromUri();
      this.postEditResult(true, "Node order updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `Failed to reorder node. ${message}`);
    }
  }

  private async handleCreateNode(
    payload:
      | {
          treeId?: string;
          targetParentPath?: string;
          targetIndex?: number;
          nodeKey?: string;
          nodeCategory?: string;
        }
      | undefined
  ): Promise<void> {
    if (!this.latestDocumentUri) {
      this.postEditResult(false, "No XML document is currently attached to the preview.");
      return;
    }

    const targetIndex = payload?.targetIndex;

    if (
      !payload?.treeId ||
      !payload.targetParentPath ||
      typeof targetIndex !== "number" ||
      !Number.isInteger(targetIndex) ||
      !payload.nodeKey ||
      !payload.nodeCategory
    ) {
      this.postEditResult(false, "The webview sent an incomplete node create request.");
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const parsed = parseBehaviorTreeDocument(document.getText());
      insertNode(parsed, payload.treeId, payload.targetParentPath, targetIndex, payload.nodeKey, payload.nodeCategory);
      const nextXml = serializeBehaviorTreeDocument(parsed);

      if (nextXml === document.getText()) {
        this.postEditResult(true, "Node already matches the target position.");
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
      edit.replace(document.uri, fullRange, nextXml);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        throw new Error("VS Code rejected the XML update.");
      }

      await this.refreshPreviewFromUri();
      this.postEditResult(true, "Node created.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `Failed to create node. ${message}`);
    }
  }

  private async handleDeleteNode(
    payload:
      | {
          treeId?: string;
          nodePath?: string;
        }
      | undefined
  ): Promise<void> {
    if (!this.latestDocumentUri) {
      this.postEditResult(false, "No XML document is currently attached to the preview.");
      return;
    }

    if (!payload?.treeId || !payload.nodePath) {
      this.postEditResult(false, "The webview sent an incomplete node delete request.");
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const parsed = parseBehaviorTreeDocument(document.getText());
      deleteNode(parsed, payload.treeId, payload.nodePath);
      const nextXml = serializeBehaviorTreeDocument(parsed);

      if (nextXml === document.getText()) {
        this.postEditResult(true, "Node was already removed.");
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
      edit.replace(document.uri, fullRange, nextXml);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        throw new Error("VS Code rejected the XML update.");
      }

      await this.refreshPreviewFromUri();
      this.postEditResult(true, "Node deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `Failed to delete node. ${message}`);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.js"));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BTreeTool Preview</title>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <main class="app-shell">
      <section class="card tree-card">
        <div class="card-title-row tree-topbar">
          <div class="tree-topbar-main">
            <div id="file-label" class="file-label">No active document</div>
            <div id="tree-switcher" class="tree-switcher"></div>
          </div>
          <div class="tree-actions">
            <button id="toggle-catalog" class="canvas-btn icon-btn" type="button" title="Show or hide the node palette" aria-label="Toggle node palette">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z"/></svg>
            </button>
            <button id="toggle-inspector" class="canvas-btn icon-btn" type="button" title="Show or hide the node inspector" aria-label="Toggle node inspector">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v3H5zm0 5h9v11H5zm11 0h3v11h-3z"/></svg>
            </button>
            <button id="toggle-simplify" class="canvas-btn icon-btn" type="button" title="Show a simplified tree flow with only node names and descriptions" aria-label="Toggle simplified tree flow">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v2H5zm0 5h10v2H5zm0 5h14v2H5z"/></svg>
            </button>
            <span id="zoom-level" class="zoom-level">100%</span>
          </div>
        </div>
        <div class="tree-workspace">
          <aside id="catalog-panel" class="catalog-card" hidden>
            <div class="catalog-header">
              <span class="eyebrow">Node Palette</span>
              <p class="catalog-summary">
                Built-in nodes, model-backed actions, and SubTree entries available in this XML.
              </p>
              <input
                id="catalog-search"
                class="panel-search"
                type="text"
                placeholder="Search nodes"
                spellcheck="false"
              />
              <div class="panel-actions">
                <button id="edit-node-definitions" class="canvas-btn subtle" type="button">
                  Edit XML
                </button>
              </div>
            </div>
            <div id="catalog-list" class="catalog-list"></div>
          </aside>
          <div id="catalog-resizer" class="panel-resizer" hidden></div>
          <div id="tree-root" class="tree-root">
            <p class="empty-state">Open an XML file and run the preview command.</p>
          </div>
          <div id="inspector-resizer" class="panel-resizer" hidden></div>
          <aside id="inspector-panel" class="inspector-card" hidden>
            <div class="inspector-header">
              <span class="eyebrow">Node Inspector</span>
              <div class="inspector-title-row">
                <strong id="inspector-title" class="inspector-title">No node selected</strong>
                <span id="inspector-kind" class="badge subtle">none</span>
              </div>
              <p id="inspector-summary" class="inspector-summary">
                Select a node in the canvas to inspect and edit its XML attributes.
              </p>
            </div>
            <div id="inspector-status" class="inspector-status" hidden></div>
            <div id="inspector-warnings" class="inspector-warning-list"></div>
            <div id="attribute-list" class="attribute-list"></div>
            <div class="inspector-actions">
              <button id="apply-attributes" class="canvas-btn accent" type="button">Apply</button>
            </div>
          </aside>
        </div>
        <div id="warning-list" class="warning-list"></div>
      </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private dispose(): void {
    this.panel.dispose();
  }

  private cleanup(): void {
    if (BehaviorTreePreviewPanel.currentPanel === this) {
      BehaviorTreePreviewPanel.currentPanel = undefined;
    }

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
