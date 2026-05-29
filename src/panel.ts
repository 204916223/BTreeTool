import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import { BtNodeModel } from "./core/btAst";
import {
  createBehaviorTree,
  deleteBehaviorTree,
  deleteNode,
  insertNode,
  insertNodeCopy,
  moveNode,
  replaceNodeAttributes,
  replaceNodeModels
} from "./core/edit";
import { isBlockingWarning } from "./core/issueRules";
import { BtPlaybackLog, decodeBtlogFile } from "./core/btlog";
import {
  importTreeNodesModelToNodeLibrary,
  NodeLibraryImportConflict,
  restoreDefaultNodeLibrary
} from "./core/nodeLibraryImport";
import { loadNodeLibraryPresets } from "./core/nodeLibrary";
import { parseBehaviorTreeDocument } from "./core/parse";
import { serializeBehaviorTreeDocument } from "./core/serialize";
import { BtPreviewDocument, buildPreviewDocument } from "./core/viewModel";
import {
  BtUserSettings,
  cloneUserSettings,
  loadUserSettings,
  mergeRecommendedPresets,
  saveUserSettings
} from "./userSettings";
import { addTraceProvider, callTraceChat, getTraceConfigState, loadTraceConfig } from "./traceConfig";

type PreviewPayload = {
  fileName: string;
  languageId: string;
  hasDocument: boolean;
  isDirty: boolean;
  preview: BtPreviewDocument | null;
  parseError: string | null;
  settings: BtUserSettings;
  settingsFilePath: string;
};

type ShortcutAction = "copy" | "pasteSmart" | "undo" | "pasteAsChild" | "pasteBefore" | "pasteAfter";

type NodeCopyTemplateMessage = {
  tagName?: string;
  attributes?: Record<string, string>;
  children?: NodeCopyTemplateMessage[];
};

type NormalizedNodeCopyTemplate = {
  tagName: string;
  attributes: Record<string, string>;
  children: NormalizedNodeCopyTemplate[];
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
      type: "saveTreeNodeModels";
      payload?: BtNodeModel[];
    }
  | {
      type: "createBehaviorTree";
      payload?: {
        treeId?: string;
      };
    }
  | {
      type: "deleteBehaviorTree";
      payload?: {
        treeId?: string;
      };
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
      type: "createNodeCopy";
      payload?: {
        treeId?: string;
        targetParentPath?: string;
        targetIndex?: number;
        nodeTemplate?: NodeCopyTemplateMessage;
      };
    }
  | {
      type: "deleteNode";
      payload?: {
        treeId?: string;
        nodePath?: string;
      };
    }
  | {
      type: "saveUserSettings";
      payload?: BtUserSettings;
    }
  | {
      type: "openUserSettingsFile";
    }
  | {
      type: "importRecommendedPresets";
    }
  | {
      type: "importCustomNodes";
    }
  | {
      type: "clearImportedNodes";
    }
  | {
      type: "saveCurrentDocument";
    }
  | {
      type: "undoCurrentDocument";
    }
  | {
      type: "createNewBehaviorTreeDocument";
    }
  | {
      type: "openExistingBehaviorTreeDocument";
    }
  | {
      type: "choosePlaybackLogFile";
    }
  | {
      type: "openTraceConfigFile";
    }
  | {
      type: "refreshTraceConfig";
    }
  | {
      type: "addTraceProvider";
    }
  | {
      type: "traceAsk";
      payload?: {
        requestId?: string;
        logFilePath?: string;
        question?: string;
        context?: string;
      };
    }
  | {
      type: "traceCancel";
      payload?: {
        requestId?: string;
      };
    }
  | {
      type: "traceAnswerChunk";
      payload?: {
        requestId?: string;
        delta?: string;
      };
    };

type XmlMutation = {
  unchangedMessage: string;
  successMessage: string;
  failurePrefix: string;
  mutate: (documentText: string) => string;
};

function normalizeNodeCopyChildren(children: NodeCopyTemplateMessage[] | undefined): NormalizedNodeCopyTemplate[] {
  if (!Array.isArray(children)) {
    return [];
  }

  return children
    .filter((child) => Boolean(child?.tagName && child.attributes))
    .map((child) => ({
      tagName: child.tagName!,
      attributes: child.attributes!,
      children: normalizeNodeCopyChildren(child.children)
    }));
}

function mergePresetNodeSets(
  settings: BtUserSettings,
  extraPresetNodes: BtUserSettings["presetNodes"]
): BtUserSettings {
  const merged = new Map<string, BtUserSettings["presetNodes"][number]>();

  for (const preset of settings.presetNodes) {
    merged.set(preset.key, preset);
  }

  for (const preset of extraPresetNodes) {
    merged.set(preset.key, preset);
  }

  return {
    ...cloneUserSettings(settings),
    presetNodes: Array.from(merged.values()).sort((left, right) => left.title.localeCompare(right.title))
  };
}

function readInitialThemeSettings(globalStorageUri: vscode.Uri): Pick<BtUserSettings, "language" | "themePreset"> {
  const configPath = vscode.Uri.joinPath(globalStorageUri, "user-settings.json").fsPath;
  if (!existsSync(configPath)) {
    return {
      language: "en-US",
      themePreset: "midnight"
    };
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Pick<BtUserSettings, "language" | "themePreset">>;
    return {
      language: parsed.language === "zh-CN" ? "zh-CN" : "en-US",
      themePreset:
        parsed.themePreset === "graphite" ||
        parsed.themePreset === "ocean" ||
        parsed.themePreset === "forest" ||
        parsed.themePreset === "paper" ||
        parsed.themePreset === "sand" ||
        parsed.themePreset === "mist" ||
        parsed.themePreset === "rose"
          ? parsed.themePreset
          : "midnight"
    };
  } catch (_error) {
    return {
      language: "en-US",
      themePreset: "midnight"
    };
  }
}

function formatImportConflictNames(conflicts: NodeLibraryImportConflict[]): string {
  const names = conflicts.map((conflict) => `${conflict.category}/${conflict.nodeId}`);
  const visibleNames = names.slice(0, 20);
  const suffix = names.length > visibleNames.length ? `, +${names.length - visibleNames.length}` : "";
  return `${visibleNames.join(", ")}${suffix}`;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
  );
}

function getPanelCopy(language: string) {
  const isChinese = language === "zh-CN";
  const base = {
    noAttachedDocument: "No XML document is currently attached to the preview.",
    incompleteNodeEdit: "The webview sent an incomplete node edit request.",
    nodeAttributesUnchanged: "Node attributes already match the current XML.",
    nodeAttributesApplied: "Node attributes applied.",
    nodeAttributesFailed: "Failed to apply node attributes.",
    noAttachedDocumentWarning: "BTreeTool: No XML document is attached to the preview.",
    incompleteTreeNodesModel: "The webview sent an incomplete TreeNodesModel update request.",
    treeNodesModelUnchanged: "TreeNodesModel already matches the current XML.",
    treeNodesModelUpdated: "TreeNodesModel updated.",
    treeNodesModelFailed: "Failed to update TreeNodesModel.",
    incompleteBehaviorTreeCreate: "The webview sent an incomplete BehaviorTree create request.",
    createBehaviorTreeEmptyName: "BehaviorTree ID cannot be empty.",
    createBehaviorTreeDuplicateName: (treeId: string) => `BehaviorTree "${treeId}" already exists.`,
    behaviorTreeCreateUnchanged: "BehaviorTree already exists.",
    behaviorTreeCreated: "BehaviorTree created.",
    behaviorTreeCreateFailed: "Failed to create BehaviorTree.",
    incompleteBehaviorTreeDelete: "The webview sent an incomplete BehaviorTree delete request.",
    behaviorTreeDeleteUnchanged: "BehaviorTree was already removed.",
    behaviorTreeDeleted: "BehaviorTree removed.",
    behaviorTreeDeleteFailed: "Failed to remove BehaviorTree.",
    incompleteNodeMove: "The webview sent an incomplete node move request.",
    nodeOrderUnchanged: "Node order already matches the current XML.",
    nodeOrderUpdated: "Node order updated.",
    nodeOrderFailed: "Failed to reorder node.",
    incompleteNodeCreate: "The webview sent an incomplete node create request.",
    nodeCreateUnchanged: "Node already matches the target position.",
    nodeCreated: "Node created.",
    nodeCreateFailed: "Failed to create node.",
    incompleteNodeCopy: "The webview sent an incomplete copied node request.",
    nodeCopyUnchanged: "Copied node already matches the target position.",
    nodeCopyCreated: "Copied node inserted.",
    nodeCopyFailed: "Failed to insert copied node.",
    incompleteNodeDelete: "The webview sent an incomplete node delete request.",
    nodeDeleteUnchanged: "Node was already removed.",
    nodeDeleted: "Node deleted.",
    nodeDeleteFailed: "Failed to delete node.",
    xmlUpdateRejected: "VS Code rejected the XML update.",
    loadSettingsFailed: (message: string) => `BTreeTool: Failed to load user settings. ${message}`,
    settingsNotReady: "Settings could not be saved because the configuration file is not ready.",
    settingsSaved: "Settings saved.",
    settingsSaveFailed: (message: string) => `Failed to save settings. ${message}`,
    undoUnavailable: "No BTreeTool edit is available to undo.",
    undoApplied: "Undo applied.",
    undoFailed: "Failed to undo the last BTreeTool edit.",
    settingsFileNotReadyWarning: "BTreeTool: The user settings file is not ready yet.",
    settingsFileNotReady: "The user settings file is not ready yet.",
    presetsImported: "Recommended presets imported.",
    presetsImportFailed: (message: string) => `Failed to import recommended presets. ${message}`,
    importCustomNodesTitle: "Import TreeNodesModel nodes",
    customNodesImported: (count: number) => `Imported ${count} custom node definition${count === 1 ? "" : "s"}.`,
    customNodesImportEmpty: "No supported node definitions were found in the selected file.",
    customNodesImportSkipped: "Conflicting nodes were skipped. No new node definitions were imported.",
    customNodesConflictPrompt: (nodes: string) =>
      `The selected file has different content for existing nodes: ${nodes}. Choose how to continue.`,
    customNodesOverwriteAction: "Overwrite",
    customNodesSkipAction: "Skip",
    customNodesCancelAction: "Cancel",
    customNodesImportFailed: (message: string) => `Failed to import custom nodes. ${message}`,
    clearImportedNodesConfirm: "Restore the node library to the default preset? Imported nodes will be removed.",
    clearImportedNodesAction: "Restore",
    clearImportedNodesCanceledAction: "Cancel",
    importedNodesCleared: "Imported nodes cleared and the default node library was restored.",
    importedNodesClearFailed: (message: string) => `Failed to clear imported nodes. ${message}`,
    documentSaved: "XML file saved.",
    documentSaveFailed: "Failed to save the XML file.",
    documentSaveBlocked: "The current behavior tree has blocking issues and cannot be saved from the preview.",
    saveDocumentConfirm: "How do you want to save the current XML file?",
    saveAction: "Overwrite",
    saveAsAction: "Save As",
    saveCancelAction: "Cancel",
    saveAsXmlTitle: "Save BehaviorTree XML as",
    saveAsSameFileBlocked: "Choose a different file name for Save As.",
    openExistingXmlTitle: "Open existing BehaviorTree XML",
    newXmlNameTitle: "Confirm the new XML name",
    importPlaybackLogTitle: "Import Log"
  };

  if (!isChinese) {
    return base;
  }

  return {
    noAttachedDocument: "当前预览未附加 XML 文档。",
    incompleteNodeEdit: "Webview 发送的节点编辑请求不完整。",
    nodeAttributesUnchanged: "节点属性与当前 XML 已一致。",
    nodeAttributesApplied: "节点属性已应用。",
    nodeAttributesFailed: "应用节点属性失败。",
    noAttachedDocumentWarning: "BTreeTool：当前预览未附加 XML 文档。",
    incompleteTreeNodesModel: "Webview 发送的 TreeNodesModel 更新请求不完整。",
    treeNodesModelUnchanged: "TreeNodesModel 与当前 XML 已一致。",
    treeNodesModelUpdated: "TreeNodesModel 已更新。",
    treeNodesModelFailed: "更新 TreeNodesModel 失败。",
    incompleteBehaviorTreeCreate: "Webview 发送的 BehaviorTree 创建请求不完整。",
    createBehaviorTreeEmptyName: "BehaviorTree ID 不能为空。",
    createBehaviorTreeDuplicateName: (treeId: string) => `BehaviorTree“${treeId}”已经存在。`,
    behaviorTreeCreateUnchanged: "BehaviorTree 已存在。",
    behaviorTreeCreated: "BehaviorTree 已创建。",
    behaviorTreeCreateFailed: "创建 BehaviorTree 失败。",
    incompleteBehaviorTreeDelete: "Webview 发送的 BehaviorTree 删除请求不完整。",
    behaviorTreeDeleteUnchanged: "BehaviorTree 此前已被移除。",
    behaviorTreeDeleted: "BehaviorTree 已移除。",
    behaviorTreeDeleteFailed: "移除 BehaviorTree 失败。",
    incompleteNodeMove: "Webview 发送的节点移动请求不完整。",
    nodeOrderUnchanged: "节点顺序与当前 XML 已一致。",
    nodeOrderUpdated: "节点顺序已更新。",
    nodeOrderFailed: "节点重排失败。",
    incompleteNodeCreate: "Webview 发送的节点创建请求不完整。",
    nodeCreateUnchanged: "节点已经位于目标位置。",
    nodeCreated: "节点已创建。",
    nodeCreateFailed: "创建节点失败。",
    incompleteNodeCopy: "Webview 发送的复制节点请求不完整。",
    nodeCopyUnchanged: "复制节点已经位于目标位置。",
    nodeCopyCreated: "复制节点已插入。",
    nodeCopyFailed: "插入复制节点失败。",
    incompleteNodeDelete: "Webview 发送的节点删除请求不完整。",
    nodeDeleteUnchanged: "节点此前已被移除。",
    nodeDeleted: "节点已删除。",
    nodeDeleteFailed: "删除节点失败。",
    xmlUpdateRejected: "VS Code 拒绝了这次 XML 更新。",
    loadSettingsFailed: (message: string) => `BTreeTool：加载用户设置失败。${message}`,
    settingsNotReady: "配置文件尚未就绪，暂时无法保存设置。",
    settingsSaved: "设置已保存。",
    settingsSaveFailed: (message: string) => `保存设置失败。${message}`,
    undoUnavailable: "没有可撤销的 BTreeTool 编辑。",
    undoApplied: "已撤销。",
    undoFailed: "撤销上一次 BTreeTool 编辑失败。",
    settingsFileNotReadyWarning: "BTreeTool：用户设置文件尚未就绪。",
    settingsFileNotReady: "用户设置文件尚未就绪。",
    presetsImported: "推荐预设已导入。",
    presetsImportFailed: (message: string) => `导入推荐预设失败。${message}`,
    importCustomNodesTitle: "导入节点",
    customNodesImported: (count: number) => `已导入 ${count} 个自定义节点定义。`,
    customNodesImportEmpty: "所选文件中没有找到支持的节点定义。",
    customNodesImportSkipped: "已跳过冲突节点，没有导入新节点。",
    customNodesConflictPrompt: (nodes: string) =>
      `所选文件中这些节点与现有节点内容不同：${nodes}。请选择如何继续。`,
    customNodesOverwriteAction: "覆盖",
    customNodesSkipAction: "跳过",
    customNodesCancelAction: "取消",
    customNodesImportFailed: (message: string) => `导入自定义节点失败。${message}`,
    clearImportedNodesConfirm: "将节点库恢复为默认预设？导入的节点会被移除。",
    clearImportedNodesAction: "恢复",
    clearImportedNodesCanceledAction: "取消",
    importedNodesCleared: "已清除导入节点，并恢复默认节点库。",
    importedNodesClearFailed: (message: string) => `清除导入节点失败。${message}`,
    documentSaved: "XML 文件已保存。",
    documentSaveFailed: "保存 XML 文件失败。",
    documentSaveBlocked: "当前行为树存在阻断性问题，无法从预览窗口保存。",
    saveDocumentConfirm: "请选择当前 XML 文件的保存方式。",
    saveAction: "覆盖保存",
    saveAsAction: "另存为",
    saveCancelAction: "取消",
    saveAsXmlTitle: "另存为 BehaviorTree XML",
    saveAsSameFileBlocked: "另存为需要选择不同的文件名。",
    openExistingXmlTitle: "打开已有 BehaviorTree XML",
    newXmlNameTitle: "确认新 XML 的名称",
    importPlaybackLogTitle: "导入日志"
  };
}

export class BehaviorTreePreviewPanel {
  private static readonly panelsByDocument = new Map<string, Set<BehaviorTreePreviewPanel>>();
  private static readonly noDocumentPanels = new Set<BehaviorTreePreviewPanel>();
  private static activePanel: BehaviorTreePreviewPanel | null = null;
  private static readonly invalidDocumentMessage = "当前文件不符合规则";
  private static readonly invalidDocumentConfirm = "确定";
  private static readonly emptyPayload: PreviewPayload = {
    fileName: "No active document",
    languageId: "unknown",
    hasDocument: false,
    isDirty: false,
    preview: null,
    parseError: null,
    settings: {
      language: "en-US",
      themePreset: "midnight",
      showMainTreeLocator: true,
      showBehaviorTreeRoot: true,
      requireNodeDeleteConfirmation: false,
      copyNodeWithDescendants: true,
      playbackAutoNavigateToTree: true,
      nodeAttributeLayout: "inline",
      simplifyHiddenSections: [],
      presetNodes: []
    },
    settingsFilePath: ""
  };

  static createOrShow(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    document?: vscode.TextDocument
  ): void {
    if (document && BehaviorTreePreviewPanel.isXmlWithoutBehaviorTrees(document)) {
      void BehaviorTreePreviewPanel.showInvalidDocumentMessage().then(() => {
        BehaviorTreePreviewPanel.createOrShow(extensionUri, globalStorageUri, undefined);
      });
      return;
    }

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const initialSettings = readInitialThemeSettings(globalStorageUri);

    if (!document) {
      const panel = vscode.window.createWebviewPanel(
        "btreeTool.preview",
        "BTreeTool",
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]
        }
      );

      const previewPanel = new BehaviorTreePreviewPanel(
        panel,
        extensionUri,
        globalStorageUri,
        undefined,
        initialSettings
      );
      BehaviorTreePreviewPanel.noDocumentPanels.add(previewPanel);
      return;
    }

    const title = `BTreeTool: ${BehaviorTreePreviewPanel.toBaseName(document.fileName)}`;
    const panel = vscode.window.createWebviewPanel(
      "btreeTool.preview",
      title,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]
      }
    );

    const previewPanel = new BehaviorTreePreviewPanel(
      panel,
      extensionUri,
      globalStorageUri,
      document,
      initialSettings
    );
    BehaviorTreePreviewPanel.addPanelForDocument(document.uri, previewPanel);
  }

  static refreshIfAttached(document: vscode.TextDocument): void {
    BehaviorTreePreviewPanel.panelsByDocument
      .get(document.uri.toString())
      ?.forEach((panel) => panel.refreshIfAttachedDocument(document));
  }

  static getActivePanel(): BehaviorTreePreviewPanel | null {
    return BehaviorTreePreviewPanel.activePanel;
  }

  static disposeAll(): void {
    const panels = new Set<BehaviorTreePreviewPanel>(BehaviorTreePreviewPanel.noDocumentPanels);
    for (const documentPanels of BehaviorTreePreviewPanel.panelsByDocument.values()) {
      documentPanels.forEach((panel) => panels.add(panel));
    }

    for (const panel of panels) {
      panel.dispose();
    }
    BehaviorTreePreviewPanel.panelsByDocument.clear();
    BehaviorTreePreviewPanel.noDocumentPanels.clear();
    BehaviorTreePreviewPanel.activePanel = null;
  }

  private static addPanelForDocument(uri: vscode.Uri, panel: BehaviorTreePreviewPanel): void {
    const documentKey = uri.toString();
    const documentPanels = BehaviorTreePreviewPanel.panelsByDocument.get(documentKey) || new Set<BehaviorTreePreviewPanel>();
    documentPanels.add(panel);
    BehaviorTreePreviewPanel.panelsByDocument.set(documentKey, documentPanels);
  }

  private static removePanelFromDocument(uri: vscode.Uri, panel: BehaviorTreePreviewPanel): void {
    const documentKey = uri.toString();
    const documentPanels = BehaviorTreePreviewPanel.panelsByDocument.get(documentKey);
    if (!documentPanels) {
      return;
    }

    documentPanels.delete(panel);
    if (documentPanels.size === 0) {
      BehaviorTreePreviewPanel.panelsByDocument.delete(documentKey);
    }
  }

  private static toBaseName(fileName: string): string {
    const normalized = fileName.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments[segments.length - 1] || fileName;
  }

  private static loadNodeLibraryPresets(extensionUri: vscode.Uri): Promise<BtUserSettings["presetNodes"]> {
    const cacheKey = extensionUri.fsPath;
    const cached = BehaviorTreePreviewPanel.nodeLibraryPresetsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = loadNodeLibraryPresets(vscode.Uri.joinPath(extensionUri, "node-library").fsPath).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`BTreeTool: failed to load node library presets. ${message}`);
      return [];
    });
    BehaviorTreePreviewPanel.nodeLibraryPresetsCache.set(cacheKey, promise);
    return promise;
  }

  private static clearNodeLibraryPresetsCache(extensionUri: vscode.Uri): void {
    BehaviorTreePreviewPanel.nodeLibraryPresetsCache.delete(extensionUri.fsPath);
  }

  private static isXmlWithoutBehaviorTrees(document: vscode.TextDocument): boolean {
    try {
      return parseBehaviorTreeDocument(document.getText()).behaviorTrees.length === 0;
    } catch (_error) {
      return false;
    }
  }

  private static async showInvalidDocumentMessage(): Promise<void> {
    await vscode.window.showWarningMessage(
      BehaviorTreePreviewPanel.invalidDocumentMessage,
      { modal: true },
      BehaviorTreePreviewPanel.invalidDocumentConfirm
    );
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly globalStorageUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private latestPayload: PreviewPayload = BehaviorTreePreviewPanel.emptyPayload;
  private latestDocumentUri: vscode.Uri | null = null;
  private latestPlaybackLog: BtPlaybackLog | null = null;
  private settingsFileUri: vscode.Uri | null = null;
  private traceConfigFileUri: vscode.Uri | null = null;
  private readonly traceRequestControllers = new Map<string, AbortController>();
  private currentSettings: BtUserSettings = cloneUserSettings(BehaviorTreePreviewPanel.emptyPayload.settings);
  private nodeLibraryPresets: BtUserSettings["presetNodes"] = [];
  private webviewReady = false;
  private readonly xmlUndoStack: string[] = [];
  private invalidDocumentPrompt: Promise<void> | null = null;
  private static readonly nodeLibraryPresetsCache = new Map<string, Promise<BtUserSettings["presetNodes"]>>();

  private getCopy() {
    return getPanelCopy(this.currentSettings.language);
  }

  private getEffectiveSettings(): BtUserSettings {
    return mergePresetNodeSets(this.currentSettings, this.nodeLibraryPresets);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    document?: vscode.TextDocument,
    initialSettings?: Pick<BtUserSettings, "language" | "themePreset">
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.globalStorageUri = globalStorageUri;
    this.latestDocumentUri = document?.uri || null;
    this.latestPayload = this.toPayload(document);
    BehaviorTreePreviewPanel.activePanel = this;

    this.panel.webview.html = this.getHtml(this.panel.webview, Boolean(document), initialSettings);
    if (document?.fileName) {
      this.updatePanelTitle(document.fileName);
    }
    void this.initializeSettings();

    this.panel.onDidDispose(() => this.cleanup(), null, this.disposables);
    this.panel.onDidChangeViewState(() => {
      if (this.panel.active) {
        BehaviorTreePreviewPanel.activePanel = this;
      }
    }, null, this.disposables);
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (this.traceConfigFileUri && document.uri.toString() === this.traceConfigFileUri.toString()) {
        void this.postTraceConfigState();
      }
    }, null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        if (message.type === "ready") {
          this.webviewReady = true;
          this.postLatestPayload();
          void this.postTraceConfigState();
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

        if (message.type === "saveTreeNodeModels" && "payload" in message) {
          void this.handleSaveTreeNodeModels(message.payload);
          return;
        }

        if (message.type === "createBehaviorTree" && "payload" in message) {
          void this.handleCreateBehaviorTree(message.payload);
          return;
        }

        if (message.type === "deleteBehaviorTree" && "payload" in message) {
          void this.handleDeleteBehaviorTree(message.payload);
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

        if (message.type === "createNodeCopy" && "payload" in message) {
          void this.handleCreateNodeCopy(message.payload);
          return;
        }

        if (message.type === "deleteNode" && "payload" in message) {
          void this.handleDeleteNode(message.payload);
          return;
        }

        if (message.type === "saveUserSettings" && "payload" in message) {
          void this.handleSaveUserSettings(message.payload);
          return;
        }

        if (message.type === "openUserSettingsFile") {
          void this.openUserSettingsFile();
          return;
        }

        if (message.type === "importRecommendedPresets") {
          void this.handleImportRecommendedPresets();
          return;
        }

        if (message.type === "importCustomNodes") {
          void this.handleImportCustomNodes();
          return;
        }

        if (message.type === "clearImportedNodes") {
          void this.handleClearImportedNodes();
          return;
        }

        if (message.type === "saveCurrentDocument") {
          void this.handleSaveCurrentDocument();
          return;
        }

        if (message.type === "undoCurrentDocument") {
          void this.handleUndoCurrentDocument();
          return;
        }

        if (message.type === "createNewBehaviorTreeDocument") {
          void this.handleCreateNewBehaviorTreeDocument();
          return;
        }

        if (message.type === "openExistingBehaviorTreeDocument") {
          void this.handleOpenExistingBehaviorTreeDocument();
          return;
        }

        if (message.type === "choosePlaybackLogFile") {
          void this.handleChoosePlaybackLogFile();
          return;
        }

        if (message.type === "openTraceConfigFile") {
          void this.openTraceConfigFile();
          return;
        }

        if (message.type === "refreshTraceConfig") {
          void this.postTraceConfigState();
          return;
        }

        if (message.type === "addTraceProvider") {
          void this.handleAddTraceProvider();
          return;
        }

        if (message.type === "traceAsk" && "payload" in message) {
          void this.handleTraceAsk(message.payload);
          return;
        }

        if (message.type === "traceCancel" && "payload" in message) {
          void this.handleTraceCancel(message.payload);
          return;
        }
      },
      null,
      this.disposables
    );
  }

  refreshIfAttachedDocument(document: vscode.TextDocument): void {
    if (!this.latestDocumentUri || this.latestDocumentUri.toString() !== document.uri.toString()) {
      return;
    }

    if (BehaviorTreePreviewPanel.isXmlWithoutBehaviorTrees(document)) {
      void this.detachInvalidDocumentAfterPrompt();
      return;
    }

    this.latestPayload = this.toPayload(document);

    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  postShortcutAction(action: ShortcutAction): void {
    this.panel.webview.postMessage({
      type: "shortcutAction",
      payload: { action }
    });
  }

  private postLatestPayload(): void {
    this.panel.webview.postMessage({
      type: "btreeDocument",
      payload: this.latestPayload
    });
  }

  private async postTraceConfigState(): Promise<void> {
    try {
      const { config, configUri } = await loadTraceConfig(this.globalStorageUri);
      this.traceConfigFileUri = configUri;
      this.panel.webview.postMessage({
        type: "traceConfigState",
        payload: getTraceConfigState(config, configUri.fsPath)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.panel.webview.postMessage({
        type: "traceConfigState",
        payload: {
          ready: false,
          configFilePath: "",
          configDirectoryPath: "",
          activeProvider: "",
          activeProviderLabel: "",
          activeModel: "",
          missing: [message],
          notice: message,
          providers: []
        }
      });
    }
  }

  private updatePanelTitle(fileName: string): void {
    this.panel.title = `BTreeTool: ${BehaviorTreePreviewPanel.toBaseName(fileName)}`;
  }

  private postEditResult(ok: boolean, message: string, dirtyState?: "dirty" | "saved"): void {
    this.panel.webview.postMessage({
      type: "editResult",
      payload: {
        ok,
        message,
        dirtyState
      }
    });
  }

  private async refreshPreviewFromUri(): Promise<void> {
    if (!this.latestDocumentUri) {
      this.latestPayload = this.toPayload(undefined);
      if (this.webviewReady) {
        this.postLatestPayload();
      }
      return;
    }

    const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
    if (BehaviorTreePreviewPanel.isXmlWithoutBehaviorTrees(document)) {
      await this.detachInvalidDocumentAfterPrompt();
      return;
    }

    this.latestPayload = this.toPayload(document);

    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  private attachDocument(document: vscode.TextDocument): void {
    if (this.latestDocumentUri) {
      BehaviorTreePreviewPanel.removePanelFromDocument(this.latestDocumentUri, this);
    } else {
      BehaviorTreePreviewPanel.noDocumentPanels.delete(this);
    }

    this.latestDocumentUri = document.uri;
    this.xmlUndoStack.length = 0;
    this.latestPayload = this.toPayload(document);
    this.updatePanelTitle(document.fileName);
    BehaviorTreePreviewPanel.addPanelForDocument(document.uri, this);
    BehaviorTreePreviewPanel.activePanel = this;
    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  private detachDocument(): void {
    if (this.latestDocumentUri) {
      BehaviorTreePreviewPanel.removePanelFromDocument(this.latestDocumentUri, this);
    }

    BehaviorTreePreviewPanel.noDocumentPanels.add(this);
    this.latestDocumentUri = null;
    this.xmlUndoStack.length = 0;
    this.latestPayload = this.toPayload(undefined);
    this.panel.title = "BTreeTool";
    BehaviorTreePreviewPanel.activePanel = this;
    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  private async detachInvalidDocumentAfterPrompt(): Promise<void> {
    if (this.invalidDocumentPrompt) {
      return this.invalidDocumentPrompt;
    }

    this.invalidDocumentPrompt = BehaviorTreePreviewPanel.showInvalidDocumentMessage()
      .then(() => {
        this.detachDocument();
      })
      .finally(() => {
        this.invalidDocumentPrompt = null;
      });
    return this.invalidDocumentPrompt;
  }

  private toPayload(document: vscode.TextDocument | undefined): PreviewPayload {
    if (!document) {
      return {
        ...BehaviorTreePreviewPanel.emptyPayload,
        settings: cloneUserSettings(this.currentSettings),
        settingsFilePath: this.settingsFileUri?.fsPath || ""
      };
    }

    return {
      fileName: document.fileName,
      languageId: document.languageId,
      hasDocument: true,
      isDirty: document.isDirty,
      settings: cloneUserSettings(this.currentSettings),
      settingsFilePath: this.settingsFileUri?.fsPath || "",
      ...this.buildPayloadState(document.getText())
    };
  }

  private buildPayloadState(source: string): Pick<PreviewPayload, "preview" | "parseError"> {
    try {
      const ast = parseBehaviorTreeDocument(source);
      return {
        preview: buildPreviewDocument(ast, this.getEffectiveSettings()),
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
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    if (!payload?.treeId || !payload.nodePath || !payload.attributes) {
      this.postEditResult(false, copy.incompleteNodeEdit);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.nodeAttributesUnchanged,
      successMessage: copy.nodeAttributesApplied,
      failurePrefix: copy.nodeAttributesFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        replaceNodeAttributes(parsed, payload.treeId!, payload.nodePath!, payload.attributes!);
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async revealTreeNodesModel(): Promise<void> {
    if (!this.latestDocumentUri) {
      void vscode.window.showWarningMessage(this.getCopy().noAttachedDocumentWarning);
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

  private async handleSaveTreeNodeModels(payload: BtNodeModel[] | undefined): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    if (!payload || !Array.isArray(payload)) {
      this.postEditResult(false, copy.incompleteTreeNodesModel);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.treeNodesModelUnchanged,
      successMessage: copy.treeNodesModelUpdated,
      failurePrefix: copy.treeNodesModelFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        replaceNodeModels(parsed, payload);
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async handleCreateBehaviorTree(payload: { treeId?: string } | undefined): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const normalizedTreeId = payload?.treeId?.trim() || "";
    if (!normalizedTreeId) {
      this.postEditResult(false, copy.incompleteBehaviorTreeCreate);
      return;
    }

    const existingTreeIds = new Set(this.latestPayload.preview?.behaviorTrees.map((tree) => tree.id) || []);
    if (existingTreeIds.has(normalizedTreeId)) {
      this.postEditResult(false, copy.createBehaviorTreeDuplicateName(normalizedTreeId));
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.behaviorTreeCreateUnchanged,
      successMessage: copy.behaviorTreeCreated,
      failurePrefix: copy.behaviorTreeCreateFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        createBehaviorTree(parsed, normalizedTreeId);
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async handleDeleteBehaviorTree(payload: { treeId?: string } | undefined): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const normalizedTreeId = payload?.treeId?.trim() || "";
    if (!normalizedTreeId) {
      this.postEditResult(false, copy.incompleteBehaviorTreeDelete);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.behaviorTreeDeleteUnchanged,
      successMessage: copy.behaviorTreeDeleted,
      failurePrefix: copy.behaviorTreeDeleteFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        deleteBehaviorTree(parsed, normalizedTreeId);
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async handleMoveNode(
    payload: { treeId?: string; sourceNodePath?: string; targetParentPath?: string; targetIndex?: number } | undefined
  ): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
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
      this.postEditResult(false, copy.incompleteNodeMove);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.nodeOrderUnchanged,
      successMessage: copy.nodeOrderUpdated,
      failurePrefix: copy.nodeOrderFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        moveNode(parsed, payload.treeId!, payload.sourceNodePath!, payload.targetParentPath!, targetIndex);
        return serializeBehaviorTreeDocument(parsed);
      }
    });
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
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
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
      this.postEditResult(false, copy.incompleteNodeCreate);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.nodeCreateUnchanged,
      successMessage: copy.nodeCreated,
      failurePrefix: copy.nodeCreateFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        insertNode(
          parsed,
          payload.treeId!,
          payload.targetParentPath!,
          targetIndex,
          payload.nodeKey!,
          payload.nodeCategory!,
          this.getEffectiveSettings()
        );
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async handleCreateNodeCopy(
    payload:
      | {
          treeId?: string;
          targetParentPath?: string;
          targetIndex?: number;
          nodeTemplate?: NodeCopyTemplateMessage;
        }
      | undefined
  ): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const targetIndex = payload?.targetIndex;
    const nodeTemplate = payload?.nodeTemplate;

    if (
      !payload?.treeId ||
      !payload.targetParentPath ||
      typeof targetIndex !== "number" ||
      !Number.isInteger(targetIndex) ||
      !nodeTemplate?.tagName ||
      !nodeTemplate.attributes
    ) {
      this.postEditResult(false, copy.incompleteNodeCopy);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.nodeCopyUnchanged,
      successMessage: copy.nodeCopyCreated,
      failurePrefix: copy.nodeCopyFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        insertNodeCopy(parsed, payload.treeId!, payload.targetParentPath!, targetIndex, {
          tagName: nodeTemplate.tagName!,
          attributes: nodeTemplate.attributes!,
          children: normalizeNodeCopyChildren(nodeTemplate.children)
        });
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async handleDeleteNode(
    payload:
      | {
          treeId?: string;
          nodePath?: string;
        }
      | undefined
  ): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    if (!payload?.treeId || !payload.nodePath) {
      this.postEditResult(false, copy.incompleteNodeDelete);
      return;
    }

    await this.applyXmlMutation({
      unchangedMessage: copy.nodeDeleteUnchanged,
      successMessage: copy.nodeDeleted,
      failurePrefix: copy.nodeDeleteFailed,
      mutate: (documentText) => {
        const parsed = parseBehaviorTreeDocument(documentText);
        deleteNode(parsed, payload.treeId!, payload.nodePath!);
        return serializeBehaviorTreeDocument(parsed);
      }
    });
  }

  private async applyXmlMutation(mutation: XmlMutation): Promise<void> {
    if (!this.latestDocumentUri) {
      this.postEditResult(false, this.getCopy().noAttachedDocument);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const currentText = document.getText();
      const nextXml = mutation.mutate(currentText);

      if (nextXml === currentText) {
        this.postEditResult(true, mutation.unchangedMessage);
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(currentText.length));
      edit.replace(document.uri, fullRange, nextXml);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        throw new Error(this.getCopy().xmlUpdateRejected);
      }

      this.pushXmlUndoSnapshot(currentText);
      await this.refreshPreviewFromUri();
      this.postEditResult(true, mutation.successMessage, "dirty");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `${mutation.failurePrefix} ${message}`);
    }
  }

  private pushXmlUndoSnapshot(source: string): void {
    this.xmlUndoStack.push(source);
    if (this.xmlUndoStack.length > 50) {
      this.xmlUndoStack.splice(0, this.xmlUndoStack.length - 50);
    }
  }

  private async handleUndoCurrentDocument(): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const previousText = this.xmlUndoStack.pop();
    if (previousText === undefined) {
      this.postEditResult(false, copy.undoUnavailable);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const currentText = document.getText();
      if (previousText === currentText) {
        this.postEditResult(true, copy.undoApplied);
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(currentText.length));
      edit.replace(document.uri, fullRange, previousText);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        throw new Error(copy.xmlUpdateRejected);
      }

      await this.refreshPreviewFromUri();
      this.postEditResult(true, copy.undoApplied, "dirty");
    } catch (error) {
      this.xmlUndoStack.push(previousText);
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `${copy.undoFailed} ${message}`);
    }
  }

  private async handleSaveCurrentDocument(): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const overwriteAction = copy.saveAction;
    const saveAsAction = copy.saveAsAction;
    const choice = await vscode.window.showWarningMessage(
      copy.saveDocumentConfirm,
      { modal: true },
      overwriteAction,
      saveAsAction
    );

    if (choice === saveAsAction) {
      await this.handleSaveCurrentDocumentAs();
      return;
    }

    if (choice !== overwriteAction) {
      return;
    }

    try {
      let document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      if (this.isSaveBlocked(document.getText())) {
        this.postEditResult(false, copy.documentSaveBlocked);
        return;
      }

      document = await this.normalizeDocumentBeforeSave(document);
      const saved = await document.save();

      if (!saved) {
        this.postEditResult(false, copy.documentSaveFailed);
        return;
      }

      await this.refreshPreviewFromUri();
      this.postEditResult(true, copy.documentSaved, "saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `${copy.documentSaveFailed} ${message}`);
    }
  }

  private async handleSaveCurrentDocumentAs(): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      const currentText = document.getText();
      if (this.isSaveBlocked(currentText)) {
        this.postEditResult(false, copy.documentSaveBlocked);
        return;
      }

      const targetUri = await vscode.window.showSaveDialog({
        title: copy.saveAsXmlTitle,
        defaultUri: this.latestDocumentUri,
        filters: {
          "BehaviorTree XML": ["xml"],
          "All Files": ["*"]
        }
      });

      if (!targetUri) {
        return;
      }

      if (targetUri.toString() === this.latestDocumentUri.toString()) {
        this.postEditResult(false, copy.saveAsSameFileBlocked);
        return;
      }

      const parsed = parseBehaviorTreeDocument(currentText);
      const nextXml = serializeBehaviorTreeDocument(parsed);
      await vscode.workspace.fs.writeFile(targetUri, Buffer.from(nextXml, "utf8"));
      const savedDocument = await vscode.workspace.openTextDocument(targetUri);
      await vscode.window.showTextDocument(savedDocument, {
        preview: false,
        preserveFocus: false
      });
      this.attachDocument(savedDocument);
      this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One);
      this.postEditResult(true, copy.documentSaved, "saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `${copy.documentSaveFailed} ${message}`);
    }
  }

  private async handleCreateNewBehaviorTreeDocument(): Promise<void> {
    const copy = this.getCopy();
    const template = serializeBehaviorTreeDocument({
      xmlDeclaration: {
        attributes: {
          version: "1.0"
        }
      },
      rootTagName: "root",
      rootAttributes: {
        BTCPP_format: "4"
      },
      mainTreeToExecute: "MainTree",
      includes: [],
      behaviorTrees: [
        {
          id: "MainTree",
          node: {
            tagName: "AlwaysSuccess",
            attributes: {},
            children: []
          }
        }
      ],
      nodeModels: [],
      topLevelOrder: ["behaviorTree"],
      warnings: []
    });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, "MainTree.xml") : undefined;
    const targetUri = await vscode.window.showSaveDialog({
      title: copy.newXmlNameTitle,
      defaultUri,
      filters: {
        "BehaviorTree XML": ["xml"],
        "All Files": ["*"]
      }
    });

    if (!targetUri) {
      return;
    }

    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(template, "utf8"));
    const document = await vscode.workspace.openTextDocument(targetUri);

    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });
    this.attachDocument(document);
    this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One);
  }

  private async handleOpenExistingBehaviorTreeDocument(): Promise<void> {
    const copy = this.getCopy();
    const files = await vscode.window.showOpenDialog({
      title: copy.openExistingXmlTitle,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "BehaviorTree XML": ["xml"],
        "All Files": ["*"]
      }
    });

    const file = files?.[0];
    if (!file) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(file);
    if (BehaviorTreePreviewPanel.isXmlWithoutBehaviorTrees(document)) {
      await BehaviorTreePreviewPanel.showInvalidDocumentMessage();
      this.detachDocument();
      this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One);
      return;
    }

    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });
    this.attachDocument(document);
    this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One);
  }

  private async handleChoosePlaybackLogFile(): Promise<void> {
    const copy = this.getCopy();
    const files = await vscode.window.showOpenDialog({
      title: copy.importPlaybackLogTitle,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "BehaviorTree Logs": ["btlog", "json", "jsonl", "gz", "log", "txt"],
        "All Files": ["*"]
      }
    });
    const file = files?.[0];
    if (!file) {
      return;
    }

    try {
      const playbackLog = decodeBtlogFile(file.fsPath, this.currentSettings);
      this.latestPlaybackLog = playbackLog;
      this.panel.title = `BTreeTool: ${playbackLog.fileName}`;
      this.panel.webview.postMessage({
        type: "playbackLog",
        payload: playbackLog
      });
    } catch (error) {
      this.latestPlaybackLog = null;
      const message = error instanceof Error ? error.message : String(error);
      this.panel.webview.postMessage({
        type: "playbackLogError",
        payload: { message }
      });
      void vscode.window.showErrorMessage(`BTreeTool: ${message}`);
    }
  }

  private async openTraceConfigFile(): Promise<void> {
    if (!this.traceConfigFileUri) {
      const { configUri } = await loadTraceConfig(this.globalStorageUri);
      this.traceConfigFileUri = configUri;
    }

    const document = await vscode.workspace.openTextDocument(this.traceConfigFileUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });
  }

  private async handleAddTraceProvider(): Promise<void> {
    const { config, configUri } = await loadTraceConfig(this.globalStorageUri);
    const updated = await addTraceProvider(configUri, config);
    this.traceConfigFileUri = configUri;
    this.panel.webview.postMessage({
      type: "traceConfigState",
      payload: getTraceConfigState(updated.config, configUri.fsPath)
    });
    const document = await vscode.workspace.openTextDocument(configUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });
  }

  private async handleTraceAsk(
    payload:
      | {
          requestId?: string;
          logFilePath?: string;
          question?: string;
          context?: string;
        }
      | undefined
  ): Promise<void> {
    const requestId = payload?.requestId || "";
    const question = payload?.question?.trim() || "";
    const context = payload?.context?.trim() || "";
    const logFilePath = payload?.logFilePath || "";

    try {
      if (!requestId || !question || !context) {
        throw new Error("Trace request is incomplete.");
      }
      if (!this.latestPlaybackLog || this.latestPlaybackLog.filePath !== logFilePath) {
        throw new Error("Trace only works with the currently opened btlog file.");
      }

      const controller = new AbortController();
      this.traceRequestControllers.set(requestId, controller);
      const result = await callTraceChat(
        this.globalStorageUri,
        { question, context, signal: controller.signal },
        {
          onDelta: (delta) => {
            if (!delta || controller.signal.aborted) {
              return;
            }
            this.panel.webview.postMessage({
              type: "traceAnswerChunk",
              payload: {
                requestId,
                delta
              }
            });
          }
        }
      );
      if (controller.signal.aborted) {
        return;
      }
      this.panel.webview.postMessage({
        type: "traceAnswer",
        payload: {
          requestId,
          ok: true,
          answer: result.answer,
          provider: result.providerLabel,
          model: result.model
        }
      });
    } catch (error) {
      const controller = requestId ? this.traceRequestControllers.get(requestId) : null;
      const cancelled = controller?.signal.aborted === true || isAbortError(error);
      const message = error instanceof Error ? error.message : String(error);
      this.panel.webview.postMessage({
        type: "traceAnswer",
        payload: {
          requestId,
          ok: false,
          cancelled,
          error: cancelled ? "" : message
        }
      });
      if (!cancelled) {
        void this.postTraceConfigState();
      }
    } finally {
      if (requestId) {
        this.traceRequestControllers.delete(requestId);
      }
    }
  }

  private async handleTraceCancel(payload: { requestId?: string } | undefined): Promise<void> {
    const requestId = payload?.requestId || "";
    const controller = requestId ? this.traceRequestControllers.get(requestId) : null;
    if (!controller || controller.signal.aborted) {
      return;
    }
    controller.abort();
  }

  private async normalizeDocumentBeforeSave(document: vscode.TextDocument): Promise<vscode.TextDocument> {
    const currentText = document.getText();
    const parsed = parseBehaviorTreeDocument(currentText);
    const nextXml = serializeBehaviorTreeDocument(parsed);

    if (nextXml === currentText) {
      return document;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(currentText.length));
    edit.replace(document.uri, fullRange, nextXml);
    const applied = await vscode.workspace.applyEdit(edit);

    if (!applied) {
      throw new Error(this.getCopy().xmlUpdateRejected);
    }

    return vscode.workspace.openTextDocument(document.uri);
  }

  private isSaveBlocked(source: string): boolean {
    try {
      const parsed = parseBehaviorTreeDocument(source);
      return parsed.warnings.some(isBlockingWarning);
    } catch (_error) {
      return true;
    }
  }

  private async initializeSettings(): Promise<void> {
    try {
      const { settings, configUri } = await loadUserSettings(this.globalStorageUri);
      this.currentSettings = settings;
      this.settingsFileUri = configUri;
      this.nodeLibraryPresets = await BehaviorTreePreviewPanel.loadNodeLibraryPresets(this.extensionUri);
      const attachedDocument = this.latestDocumentUri
        ? await vscode.workspace.openTextDocument(this.latestDocumentUri)
        : undefined;
      if (attachedDocument && BehaviorTreePreviewPanel.isXmlWithoutBehaviorTrees(attachedDocument)) {
        await this.detachInvalidDocumentAfterPrompt();
        return;
      }

      this.latestPayload = this.toPayload(attachedDocument);
      if (this.webviewReady) {
        this.postLatestPayload();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(this.getCopy().loadSettingsFailed(message));
    }
  }

  private async handleSaveUserSettings(payload: BtUserSettings | undefined): Promise<void> {
    const copy = this.getCopy();
    if (!this.settingsFileUri || !payload) {
      this.postEditResult(false, copy.settingsNotReady);
      return;
    }

    try {
      this.currentSettings = await saveUserSettings(this.settingsFileUri, payload);
      await this.refreshPreviewFromUri();
      this.postEditResult(true, this.getCopy().settingsSaved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, this.getCopy().settingsSaveFailed(message));
    }
  }

  private async openUserSettingsFile(): Promise<void> {
    if (!this.settingsFileUri) {
      await this.initializeSettings();
    }

    if (!this.settingsFileUri) {
      void vscode.window.showWarningMessage(this.getCopy().settingsFileNotReadyWarning);
      return;
    }

    const document = await vscode.workspace.openTextDocument(this.settingsFileUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false
    });
  }

  private async handleImportRecommendedPresets(): Promise<void> {
    if (!this.settingsFileUri) {
      await this.initializeSettings();
    }

    if (!this.settingsFileUri) {
      this.postEditResult(false, this.getCopy().settingsFileNotReady);
      return;
    }

    try {
      this.currentSettings = await saveUserSettings(this.settingsFileUri, mergeRecommendedPresets(this.currentSettings));
      await this.refreshPreviewFromUri();
      this.postEditResult(true, this.getCopy().presetsImported);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, this.getCopy().presetsImportFailed(message));
    }
  }

  private async handleImportCustomNodes(): Promise<void> {
    const copy = this.getCopy();
    const files = await vscode.window.showOpenDialog({
      title: copy.importCustomNodesTitle,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "TreeNodesModel": ["btt", "xml"],
        "All Files": ["*"]
      }
    });

    const file = files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(file);
      const source = Buffer.from(raw).toString("utf8");
      const result = await importTreeNodesModelToNodeLibrary(
        source,
        vscode.Uri.joinPath(this.extensionUri, "node-library").fsPath,
        {
          resolveConflicts: async (conflicts) => {
            const overwrite = copy.customNodesOverwriteAction;
            const skip = copy.customNodesSkipAction;
            const choice = await vscode.window.showWarningMessage(
              copy.customNodesConflictPrompt(formatImportConflictNames(conflicts)),
              { modal: true },
              overwrite,
              skip
            );
            if (choice === overwrite) {
              return "overwrite";
            }
            if (choice === skip) {
              return "skip";
            }
            return "cancel";
          }
        }
      );
      if (result.canceled) {
        return;
      }

      BehaviorTreePreviewPanel.clearNodeLibraryPresetsCache(this.extensionUri);
      this.nodeLibraryPresets = await BehaviorTreePreviewPanel.loadNodeLibraryPresets(this.extensionUri);
      await this.refreshPreviewFromUri();
      this.postEditResult(
        result.importedCount > 0,
        result.importedCount > 0
          ? copy.customNodesImported(result.importedCount)
          : result.conflicts.length > 0
            ? copy.customNodesImportSkipped
            : copy.customNodesImportEmpty
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, copy.customNodesImportFailed(message));
    }
  }

  private async handleClearImportedNodes(): Promise<void> {
    const copy = this.getCopy();
    const choice = await vscode.window.showWarningMessage(
      copy.clearImportedNodesConfirm,
      { modal: true },
      copy.clearImportedNodesAction
    );
    if (choice !== copy.clearImportedNodesAction) {
      return;
    }

    try {
      await restoreDefaultNodeLibrary(vscode.Uri.joinPath(this.extensionUri, "node-library").fsPath);
      BehaviorTreePreviewPanel.clearNodeLibraryPresetsCache(this.extensionUri);
      this.nodeLibraryPresets = await BehaviorTreePreviewPanel.loadNodeLibraryPresets(this.extensionUri);
      await this.refreshPreviewFromUri();
      this.postEditResult(true, copy.importedNodesCleared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, copy.importedNodesClearFailed(message));
    }
  }

  private getHtml(
    webview: vscode.Webview,
    hasDocument: boolean,
    initialSettings?: Pick<BtUserSettings, "language" | "themePreset">
  ): string {
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
    ].map((fileName) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "styles", fileName)));
    const i18nScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "i18n.js"));
    const modeRulesScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "mode-rules.js")
    );
    const catalogScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "catalog.js"));
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
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "overlays", fileName))
    );
    const overlaysScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "overlays.js"));
    const treeNavigationScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "tree-navigation.js")
    );
    const treeSwitcherScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "tree-switcher.js")
    );
    const mainTreeLocatorScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "main-tree-locator.js")
    );
    const searchScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "search.js"));
    const workspacePanelsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "workspace-panels.js")
    );
    const canvasScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "canvas.js"));
    const viewportScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "viewport-layout.js")
    );
    const playbackDataScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "playback-data.js")
    );
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.js"));
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
                <path d="M8 5.5v13l10-6.5z"/>
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
<script nonce="${nonce}" src="${playbackDataScriptUri}"></script>
<script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private dispose(): void {
    this.panel.dispose();
  }

  private cleanup(): void {
    if (this.latestDocumentUri) {
      BehaviorTreePreviewPanel.removePanelFromDocument(this.latestDocumentUri, this);
    } else {
      BehaviorTreePreviewPanel.noDocumentPanels.delete(this);
    }

    if (BehaviorTreePreviewPanel.activePanel === this) {
      BehaviorTreePreviewPanel.activePanel = null;
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
