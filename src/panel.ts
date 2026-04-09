import * as vscode from "vscode";

type PreviewPayload = {
  fileName: string;
  languageId: string;
  source: string;
  hasDocument: boolean;
};

export class BehaviorTreePreviewPanel {
  private static currentPanel: BehaviorTreePreviewPanel | undefined;
  private static readonly emptyPayload: PreviewPayload = {
    fileName: "No active document",
    languageId: "unknown",
    source: "",
    hasDocument: false
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
  private webviewReady = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.cleanup(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string }) => {
        if (message.type === "ready") {
          this.webviewReady = true;
          this.postLatestPayload();
        }
      },
      null,
      this.disposables
    );
  }

  private pushDocument(document: vscode.TextDocument | undefined): void {
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

  private toPayload(document: vscode.TextDocument | undefined): PreviewPayload {
    if (!document) {
      return BehaviorTreePreviewPanel.emptyPayload;
    }

    return {
      fileName: document.fileName,
      languageId: document.languageId,
      source: document.getText(),
      hasDocument: true
    };
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
      <section class="topbar">
        <div class="topbar-brand">
          <span class="eyebrow">BT Preview</span>
          <strong class="topbar-title">BTreeTool</strong>
        </div>
        <div class="topbar-file-wrap">
          <strong id="file-name" class="topbar-file">No active document</strong>
          <span id="file-path" class="topbar-path">Open an XML file to inspect its behavior tree.</span>
        </div>
        <div class="topbar-stats">
          <span class="topbar-stat"><label>Lang</label><strong id="language-id">unknown</strong></span>
          <span class="topbar-stat"><label>Trees</label><strong id="tree-count">0</strong></span>
          <span class="topbar-stat"><label>Models</label><strong id="model-count">0</strong></span>
          <span class="topbar-stat"><label>Active</label><strong id="active-tree">none</strong></span>
          <span id="doc-badge" class="badge">Waiting</span>
        </div>
      </section>

      <section class="card tree-card">
        <div class="card-title-row">
          <h2>Tree Flow</h2>
          <div class="tree-actions">
            <button id="zoom-out" class="canvas-btn" type="button" title="Zoom out">-</button>
            <span id="zoom-level" class="zoom-level">100%</span>
            <button id="zoom-in" class="canvas-btn" type="button" title="Zoom in">+</button>
            <button id="zoom-fit" class="canvas-btn" type="button" title="Fit canvas">Fit</button>
            <span class="badge subtle">prototype</span>
          </div>
        </div>
        <div class="tree-toolbar">
          <div id="tree-switcher" class="tree-switcher"></div>
          <p id="tree-hint" class="tree-hint">
            Select a tree to inspect its flow canvas. Drag the board to move around, and use SubTree nodes to jump.
          </p>
        </div>
        <div id="tree-root" class="tree-root">
          <p class="empty-state">Open an XML file and run the preview command.</p>
        </div>
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
