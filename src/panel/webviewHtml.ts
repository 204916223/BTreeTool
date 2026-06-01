import * as vscode from "vscode";
import { BtUserSettings } from "../userSettings";

export type GetWebviewHtmlOptions = {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  hasDocument: boolean;
  initialSettings?: Pick<BtUserSettings, "language" | "themePreset">;
};

export function getWebviewHtml(options: GetWebviewHtmlOptions): string {
  const { webview, extensionUri, hasDocument, initialSettings } = options;
    const styleUris = [
      "tokens.css",
      "chrome.css",
      "tree-surface.css",
      "workspace.css",
      "catalog.css",
      "canvas.css",
      "menus.css",
      "settings.css",
      "editors.css",
      "responsive.css"
    ].map((fileName) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "styles", fileName)));
    const i18nScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "i18n.js"));
    const modeRulesScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "mode-rules.js")
    );
    const catalogScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "catalog", "catalog.js"));
    const overlayPartScriptUris = [
      "shared.js",
      "context-menus.js",
      "delete-confirm.js",
      "node-picker.js",
      "settings-dialog.js",
      "behavior-tree-dialog.js",
      "tree-model-dialog.js",
      "node-editor-dialog.js"
    ].map((fileName) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "overlays", fileName))
    );
    const overlaysScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "overlays.js"));
    const treeNavigationScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "tree", "tree-navigation.js")
    );
    const treeSwitcherScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "tree", "tree-switcher.js")
    );
    const mainTreeLocatorScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "tree", "main-tree-locator.js")
    );
    const searchScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "search", "search.js"));
    const workspacePanelsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "workspace-panels.js")
    );
    const canvasScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "canvas.js"));
    const viewportScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "viewport", "viewport-layout.js")
    );
    const sharedMathScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "shared", "math.js")
    );
    const appStateScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "app", "app-state.js")
    );
    const domRefsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "app", "dom-refs.js")
    );
    const dragImageScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "app", "drag-image.js")
    );
    const chromeStateScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "app", "chrome-state.js")
    );
    const mainEventsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "app", "main-events.js")
    );
    const playbackConfigScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-config.js")
    );
    const treeRenderContextScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "tree", "tree-render-context.js")
    );
    const startupStateScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "app", "startup-state.js")
    );
    const playbackDataScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-data.js")
    );
    const playbackTimeScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-time.js")
    );
    const playbackTimelineTasksScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-timeline-tasks.js")
    );
    const playbackTransportScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-transport.js")
    );
    const playbackTransitionsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-transitions.js")
    );
    const playbackDurationTimelineScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-duration-timeline.js")
    );
    const playbackBlackboardScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-blackboard.js")
    );
    const playbackTraceScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-trace.js")
    );
    const playbackRightPanelScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-right-panel.js")
    );
    const playbackDashboardScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-dashboard.js")
    );
    const playbackControllerScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "playback", "playback-controller.js")
    );
    const editSplitViewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "edit", "edit-split-view.js")
    );
    const editControllerScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "edit", "edit-controller.js")
    );
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "main.js"));
    const nonce = getNonce();
    const initialTheme = initialSettings?.themePreset || "midnight";
    const initialLanguage = initialSettings?.language || "en-US";

    return `<!DOCTYPE html>
<html lang="${initialLanguage}" data-btree-theme="${initialTheme}">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BTreeTool Preview</title>
${styleUris.map((uri) => `    <link rel="stylesheet" href="${uri}" />`).join("\n")}
  </head>
  <body>
    <script nonce="${nonce}">
      window.BTreeToolInitialMode = ${JSON.stringify(hasDocument ? "edit" : "playback")};
      window.BTreeToolInitialSettings = ${JSON.stringify({
        themePreset: initialTheme,
        language: initialLanguage
      })};
    </script>
    <main class="app-shell">
      <section class="card tree-card">
        <div class="card-title-row tree-topbar">
          <div class="tree-topbar-main">
            <button
              id="mode-edit"
              class="mode-toggle-btn is-active"
              type="button"
              title="Edit mode"
              aria-label="Edit mode"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13z"/>
              </svg>
            </button>
            <button
              id="mode-playback"
              class="mode-toggle-btn"
              type="button"
              title="Playback mode"
              aria-label="Playback mode"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 13h3l1.4-5 3.1 10 2.3-8 1.4 3H20v2h-6.1l-.7-1.5-1.8 6.5H9.5L8.1 15H4v-2z"/>
              </svg>
            </button>
            <button
              id="save-document"
              class="save-indicator-btn"
              type="button"
              title="Save XML"
              aria-label="Save XML"
            ></button>
            <div id="file-label" class="file-label">No active document</div>
            <div id="tree-switcher" class="tree-switcher"></div>
          </div>
          <div class="tree-actions">
            <button id="add-behavior-tree" class="canvas-btn icon-btn" type="button" title="Add BehaviorTree" aria-label="Add BehaviorTree">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
            </button>
            <button id="toggle-split-view" class="canvas-btn icon-btn" type="button" title="Split view" aria-label="Split view">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4zm2 2v12h5V6H6zm7 0v12h5V6h-5z"/></svg>
            </button>
            <button id="open-settings" class="canvas-btn icon-btn" type="button" title="Open BTreeTool settings" aria-label="Open BTreeTool settings">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.96 7.96 0 0 0 .06-.94 7.96 7.96 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 7.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4Z"/></svg>
            </button>
          </div>
        </div>
        <div class="tree-workspace">
          <button
            id="toggle-catalog"
            class="panel-edge-toggle panel-edge-toggle-left"
            type="button"
            title="Show or hide the node palette"
            aria-label="Show or hide the node palette"
          ></button>
          <aside id="catalog-panel" class="catalog-card" hidden>
            <div class="catalog-header">
              <span id="catalog-eyebrow" class="eyebrow">Node Palette</span>
              <p id="catalog-summary" class="catalog-summary">
                Built-in nodes, model-backed actions, and SubTree entries available in this XML.
              </p>
              <div class="catalog-search-row">
                <button
                  id="add-node-model"
                  class="canvas-btn icon-btn"
                  type="button"
                  title="Add TreeNodesModel node definition"
                  aria-label="Add TreeNodesModel node definition"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
                </button>
                <input
                  id="catalog-search"
                  class="panel-search"
                  type="text"
                  placeholder="Search nodes"
                  spellcheck="false"
                />
                <button
                  id="catalog-search-button"
                  class="canvas-btn icon-btn subtle catalog-search-button"
                  type="button"
                  title="Search nodes"
                  aria-label="Search nodes"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.64 8.22 3.42 3.42-1.42 1.42-3.42-3.42 1.42-1.42Z"/></svg>
                </button>
              </div>
            </div>
            <div id="catalog-list" class="catalog-list"></div>
          </aside>
          <div id="catalog-resizer" class="panel-resizer" hidden></div>
          <div id="tree-root" class="tree-root">
            <aside id="tree-search-panel" class="tree-search-panel" hidden>
              <div class="tree-search-header">
                <strong id="tree-search-title" class="tree-search-title">Node Search</strong>
                <button id="tree-search-close" class="canvas-btn subtle tree-search-close" type="button">Close</button>
              </div>
              <div class="tree-search-input-row">
                <input
                  id="tree-search-input"
                  class="panel-search tree-search-input"
                  type="text"
                  placeholder="Search node names"
                  spellcheck="false"
                />
                <button id="tree-search-advanced-toggle" class="canvas-btn subtle tree-search-advanced-toggle" type="button">
                  Filters
                </button>
              </div>
              <div id="tree-search-options" class="tree-search-options" hidden>
                <label class="settings-checkbox">
                  <input id="tree-search-description" type="checkbox" />
                  <span id="tree-search-description-label">Description</span>
                </label>
                <label class="settings-checkbox">
                  <input id="tree-search-attributes" type="checkbox" />
                  <span id="tree-search-attributes-label">Attributes</span>
                </label>
              </div>
              <div class="tree-search-toolbar">
                <span id="tree-search-count" class="tree-search-count">0 / 0</span>
                <div class="tree-search-nav">
                  <button id="tree-search-prev" class="canvas-btn subtle" type="button">↑</button>
                  <button id="tree-search-next" class="canvas-btn subtle" type="button">↓</button>
                </div>
              </div>
              <div id="tree-search-results" class="tree-search-results"></div>
            </aside>
            <div id="tree-content" class="tree-content">
              <p class="empty-state">Open an XML file and run the preview command.</p>
            </div>
            <aside id="main-tree-locator" class="main-tree-locator" hidden></aside>
          </div>
        </div>
      </section>
    </main>
    <script nonce="${nonce}" src="${i18nScriptUri}"></script>
    <script nonce="${nonce}" src="${modeRulesScriptUri}"></script>
    <script nonce="${nonce}" src="${catalogScriptUri}"></script>
${overlayPartScriptUris.map((uri) => `    <script nonce="${nonce}" src="${uri}"></script>`).join("\n")}
    <script nonce="${nonce}" src="${overlaysScriptUri}"></script>
    <script nonce="${nonce}" src="${treeNavigationScriptUri}"></script>
    <script nonce="${nonce}" src="${treeSwitcherScriptUri}"></script>
    <script nonce="${nonce}" src="${mainTreeLocatorScriptUri}"></script>
    <script nonce="${nonce}" src="${searchScriptUri}"></script>
<script nonce="${nonce}" src="${workspacePanelsScriptUri}"></script>
<script nonce="${nonce}" src="${canvasScriptUri}"></script>
<script nonce="${nonce}" src="${viewportScriptUri}"></script>
<script nonce="${nonce}" src="${sharedMathScriptUri}"></script>
<script nonce="${nonce}" src="${appStateScriptUri}"></script>
<script nonce="${nonce}" src="${domRefsScriptUri}"></script>
<script nonce="${nonce}" src="${dragImageScriptUri}"></script>
<script nonce="${nonce}" src="${chromeStateScriptUri}"></script>
<script nonce="${nonce}" src="${mainEventsScriptUri}"></script>
<script nonce="${nonce}" src="${playbackConfigScriptUri}"></script>
<script nonce="${nonce}" src="${treeRenderContextScriptUri}"></script>
<script nonce="${nonce}" src="${startupStateScriptUri}"></script>
<script nonce="${nonce}" src="${playbackDataScriptUri}"></script>
<script nonce="${nonce}" src="${playbackTimeScriptUri}"></script>
<script nonce="${nonce}" src="${playbackTimelineTasksScriptUri}"></script>
<script nonce="${nonce}" src="${playbackTransportScriptUri}"></script>
<script nonce="${nonce}" src="${playbackTransitionsScriptUri}"></script>
<script nonce="${nonce}" src="${playbackDurationTimelineScriptUri}"></script>
<script nonce="${nonce}" src="${playbackBlackboardScriptUri}"></script>
<script nonce="${nonce}" src="${playbackTraceScriptUri}"></script>
<script nonce="${nonce}" src="${playbackRightPanelScriptUri}"></script>
<script nonce="${nonce}" src="${playbackDashboardScriptUri}"></script>
<script nonce="${nonce}" src="${playbackControllerScriptUri}"></script>
<script nonce="${nonce}" src="${editSplitViewScriptUri}"></script>
<script nonce="${nonce}" src="${editControllerScriptUri}"></script>
<script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
