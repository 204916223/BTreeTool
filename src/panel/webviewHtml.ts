import * as vscode from "vscode";
import { readFileSync } from "node:fs";
import { BtUserSettings } from "../userSettings";

export type GetWebviewHtmlOptions = {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  hasDocument: boolean;
  initialSettings?: BtUserSettings;
};

export function getWebviewHtml(options: GetWebviewHtmlOptions): string {
  const { webview, extensionUri, hasDocument, initialSettings } = options;
    const styleUris = [
      "tokens.css",
      "chrome.css",
      "tree-surface.css",
      "workspace.css",
      "assistant.css",
      "catalog.css",
      "canvas.css",
      "menus.css",
      "settings.css",
      "editors.css",
      "responsive.css"
    ].map((fileName) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "styles", fileName)));
    const i18nScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "i18n.js"));
    const iconsScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "runtime", "icons.js"));
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
      "assistant-whitelist-dialog.js",
      "node-atlas-dialog.js",
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
    const editAssistantScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "edit", "edit-assistant.js")
    );
    const editControllerScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "media", "runtime", "edit", "edit-controller.js")
    );
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "main.js"));
    const nonce = getNonce();
    const initialTheme = initialSettings?.themePreset || "default";
    const initialLanguage = initialSettings?.language || "en-US";
    const initialSettingsScript = stringifyScriptJson(
      initialSettings || {
        themePreset: initialTheme,
        language: initialLanguage
      }
    );
    const atlasNodesJson = readExtensionTextFile(
      vscode.Uri.joinPath(extensionUri, "node-library", "atlas", "nodes.json").fsPath,
      "{}\n"
    );
    const atlasVariablesJson = readExtensionTextFile(
      vscode.Uri.joinPath(extensionUri, "node-library", "atlas", "variables.json").fsPath,
      "{}\n"
    );

    return `<!DOCTYPE html>
<html lang="${initialLanguage}" data-btree-theme="${initialTheme}">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BTreeTool Preview</title>
${styleUris.map((uri) => `    <link rel="stylesheet" href="${uri}" />`).join("\n")}
  </head>
  <body>
    <script nonce="${nonce}">
      window.BTreeToolInitialMode = ${JSON.stringify(hasDocument ? "edit" : "playback")};
      window.BTreeToolInitialSettings = ${initialSettingsScript};
      window.BTreeToolAtlasNodesJson = ${stringifyScriptJson(atlasNodesJson)};
      window.BTreeToolAtlasVariablesJson = ${stringifyScriptJson(atlasVariablesJson)};
    </script>
    <main class="app-shell">
      <section class="card tree-card">
        <div class="card-title-row tree-topbar">
          <div class="tree-topbar-main">
            <button
              id="open-node-atlas"
              class="mode-toggle-btn catalog-atlas-button"
              type="button"
              title="Open node atlas"
              aria-label="Open node atlas"
            >
              ${iconHtml("atlas")}
            </button>
            <button
              id="mode-edit"
              class="mode-toggle-btn is-active"
              type="button"
              title="Edit mode"
              aria-label="Edit mode"
            >
              ${iconHtml("editMode")}
            </button>
            <button
              id="mode-playback"
              class="mode-toggle-btn"
              type="button"
              title="Playback mode"
              aria-label="Playback mode"
            >
              ${iconHtml("playbackMode")}
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
              ${iconHtml("add")}
            </button>
            <button id="toggle-split-view" class="canvas-btn icon-btn" type="button" title="Split view" aria-label="Split view">
              ${iconHtml("split")}
            </button>
            <button id="open-settings" class="canvas-btn icon-btn" type="button" title="Open BTreeTool settings" aria-label="Open BTreeTool settings">
              ${iconHtml("settings")}
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
          <button
            id="toggle-edit-assistant"
            class="panel-edge-toggle panel-edge-toggle-right"
            type="button"
            title="Show or hide the behavior tree assistant"
            aria-label="Show or hide the behavior tree assistant"
          ></button>
          <aside id="catalog-panel" class="catalog-card" hidden>
            <div class="catalog-header">
              <div class="catalog-title-row">
                <strong id="catalog-eyebrow" class="catalog-title">Node Palette</strong>
              </div>
              <div class="catalog-search-row">
                <button
                  id="add-node-model"
                  class="canvas-btn icon-btn"
                  type="button"
                  title="Add TreeNodesModel node definition"
                  aria-label="Add TreeNodesModel node definition"
                >
                  ${iconHtml("add")}
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
                  ${iconHtml("search")}
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
                <button id="tree-search-close" class="canvas-btn icon-btn subtle tree-search-close" type="button">
                  ${iconHtml("close")}
                </button>
              </div>
              <div class="tree-search-input-row">
                <input
                  id="tree-search-input"
                  class="panel-search tree-search-input"
                  type="text"
                  placeholder="Search node names"
                  spellcheck="false"
                />
                <button id="tree-search-advanced-toggle" class="canvas-btn icon-btn subtle tree-search-action" type="button">
                  ${iconHtml("search")}
                </button>
              </div>
              <div id="tree-search-options" class="tree-search-options">
                <label class="settings-checkbox tree-search-option">
                  <input id="tree-search-node" type="checkbox" />
                  <span id="tree-search-node-label">Node</span>
                </label>
                <label class="settings-checkbox tree-search-option">
                  <input id="tree-search-description" type="checkbox" />
                  <span id="tree-search-description-label">Description</span>
                </label>
                <label class="settings-checkbox tree-search-option">
                  <input id="tree-search-attributes" type="checkbox" />
                  <span id="tree-search-attributes-label">Attributes</span>
                </label>
              </div>
              <div class="tree-search-toolbar">
                <span id="tree-search-count" class="tree-search-count">0 / 0</span>
                <div class="tree-search-nav">
                  <button id="tree-search-prev" class="canvas-btn icon-btn subtle tree-search-nav-btn" type="button">
                    ${iconHtml("arrowUp")}
                  </button>
                  <button id="tree-search-next" class="canvas-btn icon-btn subtle tree-search-nav-btn" type="button">
                    ${iconHtml("arrowDown")}
                  </button>
                </div>
              </div>
              <div id="tree-search-results" class="tree-search-results"></div>
            </aside>
            <div id="tree-content" class="tree-content">
              <p class="empty-state">Open an XML file and run the preview command.</p>
            </div>
            <aside id="main-tree-locator" class="main-tree-locator" hidden></aside>
          </div>
          <div id="edit-assistant-resizer" class="panel-resizer" hidden></div>
          <aside id="edit-assistant-panel" class="edit-assistant-panel" hidden></aside>
        </div>
      </section>
    </main>
    <script nonce="${nonce}" src="${i18nScriptUri}"></script>
    <script nonce="${nonce}" src="${iconsScriptUri}"></script>
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
<script nonce="${nonce}" src="${editAssistantScriptUri}"></script>
<script nonce="${nonce}" src="${editControllerScriptUri}"></script>
<script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

function stringifyScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function readExtensionTextFile(filePath: string, fallback: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch (_error) {
    return fallback;
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

function iconHtml(name: string): string {
  const paths: Record<string, string[]> = {
    add: [
      "M896 469.333333h-341.333333V128a42.666667 42.666667 0 0 0-85.333334 0v341.333333H128a42.666667 42.666667 0 0 0 0 85.333334h341.333333v341.333333a42.666667 42.666667 0 0 0 85.333334 0v-341.333333h341.333333a42.666667 42.666667 0 0 0 0-85.333334z"
    ],
    atlas: [
      "M148.09 981.053c-57.154 0-103.648-46.494-103.648-103.644V658.775c0-57.15 46.494-103.644 103.649-103.644h218.64c57.149 0 103.643 46.495 103.643 103.644v218.634c0 57.15-46.494 103.644-103.644 103.644H148.09z m0-364.39c-23.218 0-42.111 18.888-42.111 42.112v218.634c0 23.22 18.893 42.112 42.112 42.112h218.64c23.218 0 42.111-18.887 42.111-42.112V658.775c0-23.22-18.887-42.112-42.112-42.112H148.09z m510.158 364.39c-57.155 0-103.65-46.494-103.65-103.644V658.775c0-57.15 46.495-103.644 103.65-103.644h218.629c57.154 0 103.65 46.495 103.65 103.644v218.634c0 57.15-46.496 103.644-103.65 103.644h-218.63z m0-364.39c-23.22 0-42.117 18.888-42.117 42.112v218.634c0 23.22 18.892 42.112 42.117 42.112h218.629c23.219 0 42.117-18.887 42.117-42.112V658.775c0-23.22-18.893-42.112-42.117-42.112h-218.63zM149.053 470.907c-57.149 0-103.644-46.5-103.644-103.65V148.619c0-57.154 46.495-103.649 103.644-103.649h218.64c57.15 0 103.65 46.495 103.65 103.65v218.633c0 57.155-46.5 103.65-103.65 103.65h-218.64z m0-364.396c-23.219 0-42.112 18.893-42.112 42.112v218.635c0 23.219 18.888 42.112 42.112 42.112h218.635c23.219 0 42.112-18.888 42.112-42.112v-218.64c0-23.219-18.893-42.112-42.112-42.112H149.053z m523.853 155.382a26.977 26.977 0 0 1-26.946-26.936c0-50.811 41.339-92.155 92.15-92.155a26.972 26.972 0 0 1 26.946 26.936c0 7.199-2.806 13.962-7.89 19.052s-11.848 7.89-19.046 7.89c-21.11 0-38.293 17.172-38.293 38.277a26.957 26.957 0 0 1-26.92 26.936z",
      "M963.026 488.028a28.006 28.006 0 0 1-19.948-8.217l-79.022-79.028-3.906 2.786a196.116 196.116 0 0 1-114.427 36.592c-108.949 0-197.591-88.642-197.591-197.596s88.642-197.59 197.59-197.596c108.954 0.005 197.602 88.648 197.602 197.596 0 41.278-12.662 80.845-36.598 114.422l-2.785 3.906 79.032 79.028a28.237 28.237 0 0 1 0 39.89 28.006 28.006 0 0 1-19.947 8.217zM745.718 101.386c-77.85 0-141.18 63.335-141.18 141.184s63.335 141.184 141.185 141.184c77.844 0 141.179-63.34 141.179-141.184 0-37.652-14.7-73.093-41.395-99.789-26.686-26.695-62.127-41.395-99.79-41.395z"
    ],
    close: [
      "M853.333333 896c-10.666667 0-21.333333-4.266667-29.866666-12.8l-682.666667-682.666667c-17.066667-17.066667-17.066667-42.666667 0-59.733333 17.066667-17.066667 42.666667-17.066667 59.733333 0l682.666667 682.666667c17.066667 17.066667 17.066667 42.666667 0 59.733333-8.533333 8.533333-19.2 12.8-29.866667 12.8z",
      "M170.666667 896c-10.666667 0-21.333333-4.266667-29.866667-12.8-17.066667-17.066667-17.066667-42.666667 0-59.733333l682.666667-682.666667c17.066667-17.066667 42.666667-17.066667 59.733333 0 17.066667 17.066667 17.066667 42.666667 0 59.733333l-682.666667 682.666667c-8.533333 8.533333-19.2 12.8-29.866666 12.8z"
    ],
    arrowUp: [
      "M554.666667 895.658667V230.656l225.834666 225.834667a42.666667 42.666667 0 0 0 60.330667-60.330667l-298.666667-298.666667a42.666667 42.666667 0 0 0-60.330666 0l-298.666667 298.666667a42.666667 42.666667 0 0 0 60.330667 60.330667L469.333333 230.656v665.002667a42.666667 42.666667 0 0 0 85.333334 0z"
    ],
    arrowDown: [
      "M469.333333 128.341333v665.002667l-225.834666-225.834667a42.666667 42.666667 0 0 0-60.330667 60.330667l298.666667 298.666667a42.666667 42.666667 0 0 0 60.330666 0l298.666667-298.666667a42.666667 42.666667 0 0 0-60.330667-60.330667L554.666667 793.344V128.341333a42.666667 42.666667 0 0 0-85.333334 0z"
    ],
    editMode: [
      "M763.733333 981.333333H85.333333c-23.466667 0-42.666667-19.2-42.666666-42.666666V262.4c0-23.466667 19.2-42.666667 42.666666-42.666667h279.466667c23.466667 0 42.666667 19.2 42.666667 42.666667s-19.2 42.666667-42.666667 42.666667H128V896h590.933333V620.8c0-23.466667 19.2-42.666667 42.666667-42.666667s42.666667 19.2 42.666667 42.666667V938.666667c2.133333 23.466667-17.066667 42.666667-40.533334 42.666666z",
      "M347.733333 718.933333c-10.666667 0-21.333333-4.266667-29.866666-12.8-10.666667-10.666667-14.933333-23.466667-12.8-36.266666l32-200.533334c2.133333-8.533333 6.4-17.066667 12.8-23.466666L740.266667 55.466667c17.066667-17.066667 42.666667-17.066667 59.733333 0l168.533333 168.533333c17.066667 17.066667 17.066667 42.666667 0 59.733333L578.133333 674.133333c-6.4 6.4-14.933333 10.666667-23.466666 12.8l-200.533334 32h-6.4z m200.533334-74.666666z m-128-147.2l-19.2 128 128-21.333334 349.866666-352-108.8-106.666666-349.866666 352z",
      "M823.466667 398.933333c-10.666667 0-21.333333-4.266667-29.866667-12.8l-155.733333-155.733333c-17.066667-17.066667-17.066667-42.666667 0-59.733333 17.066667-17.066667 42.666667-17.066667 59.733333 0l155.733333 155.733333c17.066667 17.066667 17.066667 42.666667 0 59.733333-8.533333 8.533333-19.2 12.8-29.866666 12.8z"
    ],
    playbackMode: [
      "M1010 657.8l-131.4-131.7c-9-9.1-21.3-14.2-34.2-14.2L630 511.9c-29.8 0-54 24.1-54 53.8L576 968.2c0 29.7 24.2 53.8 54 53.8l340 0c29.8 0 54-24.1 54-53.8L1024 691.6C1024 679 1019 666.8 1010 657.8zM960 958l-320 0 0-382 197.9 0L960 698.3 960 958z",
      "M691.7 704l91.9 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-91.9 0c-17.7 0-32 14.3-32 32S674 704 691.7 704z",
      "M659.7 768c0 17.7 14.3 32 32 32l206.9 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-206.9 0C674 736 659.7 750.3 659.7 768z",
      "M898.6 832l-206.9 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l206.9 0c17.7 0 32-14.3 32-32S916.2 832 898.6 832z",
      "M484 704l-68 0 0-64 64.9 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L100.8 576c-20.3 0-36.8-16.5-36.8-36.8l0-374.5c0-20.3 16.5-36.8 36.8-36.8l566.5 0c20.3 0 36.8 16.5 36.8 36.8L704.1 418.5c0 17.7 14.3 32 32 32s32-14.3 32-32l0-253.8c0-55.6-45.2-100.8-100.8-100.8L100.8 63.9C45.2 64 0 109.2 0 164.7L0 539.2c0 55.6 45.2 100.8 100.8 100.8L352 640l0 64L224 704c-17.7 0-32 14.3-32 32s14.3 32 32 32l260 0c17.7 0 32-14.3 32-32S501.7 704 484 704z"
    ],
    search: [
      "M917.333333 981.333333c-10.666667 0-21.333333-4.266667-29.866666-12.8l-228.266667-234.666666c-17.066667-17.066667-17.066667-44.8 0-59.733334 17.066667-17.066667 44.8-17.066667 59.733333 0l228.266667 234.666667c17.066667 17.066667 17.066667 44.8 0 59.733333-8.533333 8.533333-19.2 12.8-29.866667 12.8z",
      "M454.4 814.933333C238.933333 814.933333 64 642.133333 64 428.8S238.933333 42.666667 454.4 42.666667c215.466667 0 390.4 172.8 390.4 386.133333s-174.933333 386.133333-390.4 386.133333z m0-686.933333C285.866667 128 149.333333 262.4 149.333333 428.8s136.533333 300.8 305.066667 300.8 305.066667-134.4 305.066667-300.8S622.933333 128 454.4 128z"
    ],
    settings: [
      "M512 678.4c-89.6 0-162.133333-72.533333-162.133333-162.133333s72.533333-162.133333 162.133333-162.133334 162.133333 72.533333 162.133333 162.133334-72.533333 162.133333-162.133333 162.133333z m0-238.933333c-42.666667 0-76.8 34.133333-76.8 76.8s34.133333 76.8 76.8 76.8 76.8-34.133333 76.8-76.8-34.133333-76.8-76.8-76.8z",
      "M595.2 981.333333h-157.866667c-40.533333 0-66.133333-44.8-66.133333-76.8v-46.933333c-21.333333-8.533333-40.533333-19.2-59.733333-32L275.2 853.333333c-14.933333 10.666667-29.866667 14.933333-46.933333 10.666667-17.066667-2.133333-29.866667-12.8-40.533334-25.6l-91.733333-130.133333c-19.2-27.733333-12.8-66.133333 14.933333-87.466667l36.266667-25.6c-6.4-29.866667-10.666667-59.733333-10.666667-89.6 0-27.733333 2.133333-55.466667 8.533334-83.2l-42.666667-29.866667c-27.733333-19.2-36.266667-59.733333-14.933333-87.466666l91.733333-130.133334c8.533333-12.8 21.333333-23.466667 38.4-25.6 17.066667-2.133333 32 0 46.933333 10.666667l40.533334 29.866667c21.333333-14.933333 42.666667-25.6 64-34.133334v-64l6.4-10.666666c10.666667-14.933333 32-38.4 61.866666-38.4h157.866667c38.4 0 57.6 21.333333 57.6 61.866666v49.066667c23.466667 8.533333 44.8 21.333333 66.133333 34.133333l38.4-27.733333c12.8-8.533333 29.866667-12.8 46.933334-10.666667 17.066667 2.133333 29.866667 12.8 40.533333 25.6l91.733333 130.133334c19.2 27.733333 12.8 66.133333-14.933333 87.466666l-36.266667 25.6c6.4 29.866667 10.666667 57.6 10.666667 87.466667 0 29.866667-4.266667 59.733333-10.666667 87.466667l29.866667 21.333333c12.8 10.666667 23.466667 23.466667 25.6 40.533333 2.133333 17.066667 0 32-10.666667 46.933334L840.533333 832c-19.2 27.733333-59.733333 34.133333-87.466666 14.933333l-34.133334-23.466666c-21.333333 12.8-42.666667 25.6-66.133333 34.133333v46.933333c2.133333 38.4-19.2 76.8-57.6 76.8z m-140.8-85.333333h113.066667v-98.133333L597.333333 789.333333c34.133333-10.666667 66.133333-27.733333 93.866667-49.066666l25.6-19.2 66.133333 44.8 66.133334-93.866667-61.866667-44.8 10.666667-29.866667c10.666667-29.866667 14.933333-61.866667 14.933333-91.733333 0-32-4.266667-61.866667-14.933333-91.733333l-12.8-29.866667 68.266666-49.066667-64-91.733333-70.4 49.066667-25.6-19.2c-27.733333-21.333333-59.733333-38.4-93.866666-49.066667l-29.866667-8.533333V128h-113.066667v87.466667l-29.866666 8.533333c-32 10.666667-64 27.733333-93.866667 51.2l-25.6 19.2-72.533333-51.2-64 91.733333 74.666666 53.333334-10.666666 29.866666c-8.533333 27.733333-12.8 57.6-12.8 89.6s4.266667 61.866667 14.933333 93.866667l10.666667 29.866667-68.266667 49.066666 66.133333 91.733334 66.133334-49.066667 25.6 19.2c32 23.466667 57.6 38.4 89.6 46.933333l29.866666 8.533334V896z m347.733333-117.333333z m66.133334-93.866667zM155.733333 354.133333z m650.666667-123.733333z"
    ],
    split: [
      "M416 64H128c-35.2 0-64 28.8-64 64v768c0 35.2 28.8 64 64 64h288c35.2 0 64-28.8 64-64V128c0-35.2-28.8-64-64-64z m0 800c0 19.2-12.8 32-32 32H160c-19.2 0-32-12.8-32-32V160c0-19.2 12.8-32 32-32h224c19.2 0 32 12.8 32 32v704zM896 64H608c-35.2 0-64 28.8-64 64v768c0 35.2 28.8 64 64 64h288c35.2 0 64-28.8 64-64V128c0-35.2-28.8-64-64-64z m0 800c0 19.2-12.8 32-32 32H640c-19.2 0-32-12.8-32-32V160c0-19.2 12.8-32 32-32h224c19.2 0 32 12.8 32 32v704z"
    ]
  };
  return `<svg class="app-icon app-icon-${name}" viewBox="0 0 1024 1024" aria-hidden="true">${(paths[name] || []).map((path) => `<path d="${path}"></path>`).join("")}</svg>`;
}
