import * as vscode from "vscode";
import { BtNodeModel } from "./core/btAst";
import { BtPlaybackLog } from "./core/btlog";
import {
  BtUserSettings,
  cloneUserSettings,
  loadUserSettings
} from "./userSettings";
import { createTraceFeedbackRecord, TraceFeedbackPayload, storeTraceFeedback } from "./traceLearning";
import { getWebviewHtml } from "./panel/webviewHtml";
import { handleEditAssistantAskAction, loadAtlasNodeIndex } from "./panel/editAssistantActions";
import {
  NodeCopyTemplateMessage,
  PreviewPayload,
  ShortcutAction,
  WebviewMessage
} from "./panel/messages";
import { routeWebviewMessage } from "./panel/messageRouter";
import { getPanelCopy } from "./panel/panelCopy";
import { ShortcutActionQueue } from "./panel/shortcutActionQueue";
import {
  mergePresetNodeSets,
  normalizeNodeCopyChildren,
  normalizeNodeCopyModels,
  toBaseName
} from "./panel/panelUtils";
import {
  handleChoosePlaybackLogFileAction,
  handleImportPlaybackLogFileAction
} from "./panel/playbackLogActions";
import {
  cancelTraceRequest,
  chooseTraceContextFile,
  createTraceContextFileFromPayload,
  createTraceRequestControllers,
  handleAddTraceProviderAction,
  handleSetTraceProviderAction,
  handleTraceAskAction,
  loadTraceConfigStateMessage,
  openTraceConfigFileAction,
  TraceContextFile
} from "./panel/traceActions";
import {
  DocumentWorkflowContext,
  handleCreateNewBehaviorTreeDocumentAction,
  handleOpenExistingBehaviorTreeDocumentAction,
  handleSaveCurrentDocumentAction,
  isXmlWithoutBehaviorTrees
} from "./panel/documentActions";
import {
  handleClearImportedNodesAction,
  handleImportCustomNodesAction,
  handleImportRecommendedPresetsAction,
  handleSaveUserSettingsAction,
  loadNodeLibraryPresetsForExtension,
  openUserSettingsFileAction,
  SettingsWorkflowContext
} from "./panel/settingsActions";
import {
  EditActionContext,
  handleCreateBehaviorTreeAction,
  handleCreateNodeAction,
  handleCreateNodeCopyAction,
  handleDeleteBehaviorTreeAction,
  handleDeleteNodeAction,
  handleMoveNodeAction,
  handleRenameBehaviorTreeAction,
  handleSaveTreeNodeModelsAction,
  handleUpdateNodeAttributesAction
} from "./panel/editActions";
import { XmlMutationController } from "./panel/xmlMutationController";
import { buildPreviewPayload, EMPTY_PREVIEW_PAYLOAD } from "./panel/previewPayload";

type InitialPanelState = {
  settings: BtUserSettings;
  settingsFileUri: vscode.Uri;
  nodeLibraryPresets: BtUserSettings["presetNodes"];
};

export class BehaviorTreePreviewPanel {
  private static readonly searchKeybindingContext = "btreeTool.previewFocus";
  private static readonly panelsByDocument = new Map<string, Set<BehaviorTreePreviewPanel>>();
  private static readonly noDocumentPanels = new Set<BehaviorTreePreviewPanel>();
  private static activePanel: BehaviorTreePreviewPanel | null = null;
  private static copiedNodeTemplate: NodeCopyTemplateMessage | null = null;
  private static copiedNodeModels: BtNodeModel[] = [];
  private static readonly invalidDocumentMessage = "当前文件不符合规则";
  private static readonly invalidDocumentConfirm = "确定";
  static async createOrShow(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    document?: vscode.TextDocument
  ): Promise<void> {
    const existingPanel = document
      ? BehaviorTreePreviewPanel.panelsByDocument.get(document.uri.toString())?.values().next().value
      : undefined;
    if (existingPanel) {
      existingPanel.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One, false);
      return;
    }

    if (document && isXmlWithoutBehaviorTrees(document)) {
      await BehaviorTreePreviewPanel.showInvalidDocumentMessage();
      await BehaviorTreePreviewPanel.createOrShow(extensionUri, globalStorageUri, undefined);
      return;
    }

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const initialState = await BehaviorTreePreviewPanel.loadInitialPanelState(extensionUri, globalStorageUri);

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
        initialState
      );
      BehaviorTreePreviewPanel.noDocumentPanels.add(previewPanel);
      return;
    }

    const title = `BTreeTool: ${toBaseName(document.fileName)}`;
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
      initialState
    );
    BehaviorTreePreviewPanel.addPanelForDocument(document.uri, previewPanel);
  }

  static async createForPlaybackLogEditor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    logUri: vscode.Uri
  ): Promise<void> {
    const initialState = await BehaviorTreePreviewPanel.loadInitialPanelState(extensionUri, globalStorageUri);
    const previewPanel = new BehaviorTreePreviewPanel(
      panel,
      extensionUri,
      globalStorageUri,
      undefined,
      initialState
    );
    BehaviorTreePreviewPanel.noDocumentPanels.add(previewPanel);
    previewPanel.queuePlaybackLogFile(logUri.fsPath);
  }

  static refreshIfAttached(document: vscode.TextDocument): void {
    BehaviorTreePreviewPanel.panelsByDocument
      .get(document.uri.toString())
      ?.forEach((panel) => panel.refreshIfAttachedDocument(document));
  }

  static getActivePanel(): BehaviorTreePreviewPanel | null {
    return BehaviorTreePreviewPanel.activePanel;
  }

  private static setActivePanel(panel: BehaviorTreePreviewPanel | null): void {
    BehaviorTreePreviewPanel.activePanel = panel;
    void vscode.commands.executeCommand(
      "setContext",
      BehaviorTreePreviewPanel.searchKeybindingContext,
      Boolean(panel)
    );
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
    BehaviorTreePreviewPanel.setActivePanel(null);
  }

  private static broadcastNodeClipboardState(): void {
    const panels = new Set<BehaviorTreePreviewPanel>(BehaviorTreePreviewPanel.noDocumentPanels);
    for (const documentPanels of BehaviorTreePreviewPanel.panelsByDocument.values()) {
      documentPanels.forEach((panel) => panels.add(panel));
    }

    panels.forEach((panel) => panel.postNodeClipboardState());
  }

  private static cloneNodeTemplate(nodeTemplate: NodeCopyTemplateMessage): NodeCopyTemplateMessage {
    return {
      tagName: nodeTemplate.tagName,
      attributes: { ...(nodeTemplate.attributes || {}) },
      children: normalizeNodeCopyChildren(nodeTemplate.children)
    };
  }

  private static cloneNodeModels(nodeModels: BtNodeModel[]): BtNodeModel[] {
    return normalizeNodeCopyModels(nodeModels);
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

  private static async showInvalidDocumentMessage(): Promise<void> {
    await vscode.window.showWarningMessage(
      BehaviorTreePreviewPanel.invalidDocumentMessage,
      { modal: true },
      BehaviorTreePreviewPanel.invalidDocumentConfirm
    );
  }

  private static async loadInitialPanelState(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri
  ): Promise<InitialPanelState> {
    const [{ settings, configUri }, nodeLibraryPresets] = await Promise.all([
      loadUserSettings(globalStorageUri),
      loadNodeLibraryPresetsForExtension(extensionUri, globalStorageUri)
    ]);
    return {
      settings,
      settingsFileUri: configUri,
      nodeLibraryPresets
    };
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly globalStorageUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private latestPayload: PreviewPayload = EMPTY_PREVIEW_PAYLOAD;
  private latestDocumentUri: vscode.Uri | null = null;
  private latestPlaybackLog: BtPlaybackLog | null = null;
  private traceContextFile: TraceContextFile | null = null;
  private settingsFileUri: vscode.Uri | null = null;
  private traceConfigFileUri: vscode.Uri | null = null;
  private readonly traceRequestControllers = createTraceRequestControllers();
  private readonly atlasNodes: ReturnType<typeof loadAtlasNodeIndex>;
  private readonly xmlMutations: XmlMutationController;
  private pendingPlaybackLogFilePath: string | null = null;
  private effectiveSettingsCache:
    | {
        currentSettings: BtUserSettings;
        nodeLibraryPresets: BtUserSettings["presetNodes"];
        effectiveSettings: BtUserSettings;
      }
    | null = null;
  private previewPayloadCache:
    | {
        documentUri: string;
        documentVersion: number;
        documentIsDirty: boolean;
        currentSettings: BtUserSettings;
        effectiveSettings: BtUserSettings;
        settingsFilePath: string;
        payload: PreviewPayload;
      }
    | null = null;
  private currentSettings: BtUserSettings = cloneUserSettings(EMPTY_PREVIEW_PAYLOAD.settings);
  private nodeLibraryPresets: BtUserSettings["presetNodes"] = [];
  private webviewReady = false;
  private readonly shortcutActions = new ShortcutActionQueue((action) => {
    this.panel.webview.postMessage({
      type: "shortcutAction",
      payload: { action }
    });
  });
  private invalidDocumentPrompt: Promise<void> | null = null;
  private getCopy() {
    return getPanelCopy(this.currentSettings.language);
  }

  private getEffectiveSettings(): BtUserSettings {
    if (
      this.effectiveSettingsCache?.currentSettings === this.currentSettings &&
      this.effectiveSettingsCache.nodeLibraryPresets === this.nodeLibraryPresets
    ) {
      return this.effectiveSettingsCache.effectiveSettings;
    }

    const effectiveSettings = mergePresetNodeSets(this.currentSettings, this.nodeLibraryPresets);
    this.effectiveSettingsCache = {
      currentSettings: this.currentSettings,
      nodeLibraryPresets: this.nodeLibraryPresets,
      effectiveSettings
    };
    return effectiveSettings;
  }

  private getEditActionContext(): EditActionContext {
    return {
      copy: this.getCopy(),
      hasAttachedDocument: Boolean(this.latestDocumentUri),
      preview: this.latestPayload.preview,
      effectiveSettings: this.getEffectiveSettings(),
      applyXmlMutation: (mutation) => this.xmlMutations.apply(mutation),
      postEditResult: (ok, message, dirtyState) => this.postEditResult(ok, message, dirtyState)
    };
  }

  private getDocumentWorkflowContext(): DocumentWorkflowContext {
    return {
      copy: this.getCopy(),
      latestDocumentUri: this.latestDocumentUri,
      attachDocument: (document) => this.attachDocument(document),
      detachDocument: () => this.detachDocument(),
      refreshPreviewFromUri: () => this.refreshPreviewFromUri(),
      revealPanel: () => this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One),
      isXmlWithoutBehaviorTrees: (document) => isXmlWithoutBehaviorTrees(document),
      showInvalidDocumentMessage: () => BehaviorTreePreviewPanel.showInvalidDocumentMessage(),
      postEditResult: (ok, message, dirtyState) => this.postEditResult(ok, message, dirtyState)
    };
  }

  private getSettingsWorkflowContext(): SettingsWorkflowContext {
    return {
      extensionUri: this.extensionUri,
      globalStorageUri: this.globalStorageUri,
      getCopy: () => this.getCopy(),
      getDocumentUri: () => this.latestDocumentUri,
      getSettingsFileUri: () => this.settingsFileUri,
      getCurrentSettings: () => this.currentSettings,
      setCurrentSettings: (settings) => {
        this.currentSettings = settings;
      },
      getNodeLibraryPresets: () => this.nodeLibraryPresets,
      setNodeLibraryPresets: (presetNodes) => {
        this.nodeLibraryPresets = presetNodes;
      },
      initializeSettings: () => this.initializeSettings(),
      refreshPreviewFromUri: () => this.refreshPreviewFromUri(),
      postSettingsUpdated: () => this.postSettingsUpdated(),
      postEditResult: (ok, message, dirtyState) => this.postEditResult(ok, message, dirtyState),
      replaceDocumentTextWithUndo: async (document, currentText, nextText, rejectedMessage) => {
        await this.xmlMutations.replaceDocumentTextWithUndo(document, currentText, nextText, rejectedMessage);
      }
    };
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    document?: vscode.TextDocument,
    initialState?: InitialPanelState
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.globalStorageUri = globalStorageUri;
    this.atlasNodes = loadAtlasNodeIndex(
      vscode.Uri.joinPath(this.extensionUri, "node-library", "atlas", "nodes.json").fsPath
    );
    this.xmlMutations = new XmlMutationController({
      getDocumentUri: () => this.latestDocumentUri,
      getCopy: () => this.getCopy(),
      refreshPreviewFromUri: () => this.refreshPreviewFromUri(),
      postEditResult: (ok, message, dirtyState) => this.postEditResult(ok, message, dirtyState)
    });
    if (initialState) {
      this.currentSettings = initialState.settings;
      this.settingsFileUri = initialState.settingsFileUri;
      this.nodeLibraryPresets = initialState.nodeLibraryPresets;
    }
    this.latestDocumentUri = document?.uri || null;
    this.latestPayload = this.toPayload(document);
    BehaviorTreePreviewPanel.setActivePanel(this);

    this.panel.webview.html = getWebviewHtml({
      webview: this.panel.webview,
      extensionUri: this.extensionUri,
      hasDocument: Boolean(document),
      initialSettings: this.currentSettings
    });
    if (document?.fileName) {
      this.updatePanelTitle(document.fileName);
    }
    if (!initialState) {
      void this.initializeSettings();
    }

    this.panel.onDidDispose(() => this.cleanup(), null, this.disposables);
    this.panel.onDidChangeViewState(() => {
      if (this.panel.active) {
        BehaviorTreePreviewPanel.setActivePanel(this);
      } else if (BehaviorTreePreviewPanel.activePanel === this) {
        BehaviorTreePreviewPanel.setActivePanel(null);
      }
      this.panel.webview.postMessage({
        type: "panelVisibility",
        payload: {
          visible: this.panel.visible,
          active: this.panel.active
        }
      });
    }, null, this.disposables);
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (this.traceConfigFileUri && document.uri.toString() === this.traceConfigFileUri.toString()) {
        void this.postTraceConfigState();
      }
    }, null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleWebviewMessage(message),
      null,
      this.disposables
    );
  }

  private handleWebviewMessage(message: WebviewMessage): void {
    routeWebviewMessage(message, {
      onReady: () => {
        this.webviewReady = true;
        this.postLatestPayload();
        this.shortcutActions.markReady();
        void this.postTraceConfigState();
        void this.consumePendingPlaybackLogFile();
      },
      handleEditMessage: (message) => this.handleEditMessage(message),
      handleSettingsMessage: (message) => this.handleSettingsMessage(message),
      handleDocumentMessage: (message) => this.handleDocumentMessage(message),
      handlePlaybackMessage: (message) => this.handlePlaybackMessage(message),
      handleTraceMessage: (message) => this.handleTraceMessage(message)
    });
  }

  private handleEditMessage(message: WebviewMessage): boolean {
    if (message.type === "copyNodeTemplate" && "payload" in message) {
      this.handleCopyNodeTemplate(message.payload);
      return true;
    }

    if (message.type === "pasteSharedNodeTemplate" && "payload" in message) {
      void this.handlePasteSharedNodeTemplate(message.payload);
      return true;
    }

    if (message.type === "updateNodeAttributes" && "payload" in message) {
      void this.handleUpdateNodeAttributes(message.payload);
      return true;
    }

    if (message.type === "saveTreeNodeModels" && "payload" in message) {
      void this.handleSaveTreeNodeModels(message.payload);
      return true;
    }

    if (message.type === "createBehaviorTree" && "payload" in message) {
      void this.handleCreateBehaviorTree(message.payload);
      return true;
    }

    if (message.type === "deleteBehaviorTree" && "payload" in message) {
      void this.handleDeleteBehaviorTree(message.payload);
      return true;
    }

    if (message.type === "renameBehaviorTree" && "payload" in message) {
      void this.handleRenameBehaviorTree(message.payload);
      return true;
    }

    if (message.type === "moveNode" && "payload" in message) {
      void this.handleMoveNode(message.payload);
      return true;
    }

    if (message.type === "createNode" && "payload" in message) {
      void this.handleCreateNode(message.payload);
      return true;
    }

    if (message.type === "createNodeCopy" && "payload" in message) {
      void this.handleCreateNodeCopy(message.payload);
      return true;
    }

    if (message.type === "deleteNode" && "payload" in message) {
      void this.handleDeleteNode(message.payload);
      return true;
    }

    if (message.type === "editAssistantAsk" && "payload" in message) {
      this.handleEditAssistantAsk(message.payload);
      return true;
    }

    return false;
  }

  private handleSettingsMessage(message: WebviewMessage): boolean {
    if (message.type === "saveUserSettings" && "payload" in message) {
      void this.handleSaveUserSettings(message.payload);
      return true;
    }

    if (message.type === "openUserSettingsFile") {
      void this.openUserSettingsFile();
      return true;
    }

    if (message.type === "importRecommendedPresets") {
      void this.handleImportRecommendedPresets();
      return true;
    }

    if (message.type === "importCustomNodes") {
      void this.handleImportCustomNodes();
      return true;
    }

    if (message.type === "clearImportedNodes") {
      void this.handleClearImportedNodes();
      return true;
    }

    return false;
  }

  private handleDocumentMessage(message: WebviewMessage): boolean {
    if (message.type === "saveCurrentDocument") {
      void this.handleSaveCurrentDocument();
      return true;
    }

    if (message.type === "undoCurrentDocument") {
      void this.handleUndoCurrentDocument();
      return true;
    }

    if (message.type === "createNewBehaviorTreeDocument") {
      void this.handleCreateNewBehaviorTreeDocument();
      return true;
    }

    if (message.type === "openExistingBehaviorTreeDocument") {
      void this.handleOpenExistingBehaviorTreeDocument();
      return true;
    }

    return false;
  }

  private handlePlaybackMessage(message: WebviewMessage): boolean {
    if (message.type === "choosePlaybackLogFile") {
      void this.handleChoosePlaybackLogFile();
      return true;
    }

    return false;
  }

  private handleTraceMessage(message: WebviewMessage): boolean {
    if (message.type === "openTraceConfigFile") {
      void this.openTraceConfigFile();
      return true;
    }

    if (message.type === "refreshTraceConfig") {
      void this.postTraceConfigState();
      return true;
    }

    if (message.type === "addTraceProvider") {
      void this.handleAddTraceProvider();
      return true;
    }

    if (message.type === "setTraceProvider" && "payload" in message) {
      void this.handleSetTraceProvider(message.payload);
      return true;
    }

    if (message.type === "chooseTraceContextFile") {
      void this.handleChooseTraceContextFile();
      return true;
    }

    if (message.type === "clearTraceContextFile") {
      this.traceContextFile = null;
      this.postTraceContextFileState();
      return true;
    }

    if (message.type === "setTraceContextFile" && "payload" in message) {
      this.handleSetTraceContextFile(message.payload);
      return true;
    }

    if (message.type === "traceAsk" && "payload" in message) {
      void this.handleTraceAsk(message.payload);
      return true;
    }

    if (message.type === "traceCancel" && "payload" in message) {
      void this.handleTraceCancel(message.payload);
      return true;
    }

    if (message.type === "traceFeedback" && "payload" in message) {
      void this.handleTraceFeedback(message.payload);
      return true;
    }

    return false;
  }

  refreshIfAttachedDocument(document: vscode.TextDocument): void {
    if (!this.latestDocumentUri || this.latestDocumentUri.toString() !== document.uri.toString()) {
      return;
    }

    if (this.xmlMutations.consumeSuppressedDocumentRefresh(document)) {
      return;
    }

    const nextPayload = this.toPayload(document);
    if (this.isPayloadWithoutBehaviorTrees(nextPayload)) {
      void this.detachInvalidDocumentAfterPrompt();
      return;
    }

    this.latestPayload = nextPayload;

    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  postShortcutAction(action: ShortcutAction): void {
    this.shortcutActions.dispatch(action);
  }

  private postLatestPayload(): void {
    this.panel.webview.postMessage({
      type: "btreeDocument",
      payload: this.latestPayload
    });
    this.postNodeClipboardState();
  }

  private async postTraceConfigState(): Promise<void> {
    const result = await loadTraceConfigStateMessage(this.globalStorageUri);
    if (result.configUri) {
      this.traceConfigFileUri = result.configUri;
    }
    this.panel.webview.postMessage(result.message);
  }

  private updatePanelTitle(fileName: string): void {
    this.panel.title = `BTreeTool: ${toBaseName(fileName)}`;
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

  private postSettingsUpdated(): void {
    this.panel.webview.postMessage({
      type: "settingsUpdated",
      payload: {
        settings: cloneUserSettings(this.currentSettings),
        settingsFilePath: this.settingsFileUri?.fsPath || ""
      }
    });
  }

  private postNodeClipboardState(): void {
    const nodeTemplate = BehaviorTreePreviewPanel.copiedNodeTemplate;
    this.panel.webview.postMessage({
      type: "nodeClipboardState",
      payload: {
        hasNodeTemplate: Boolean(nodeTemplate),
        nodeTemplate: nodeTemplate ? BehaviorTreePreviewPanel.cloneNodeTemplate(nodeTemplate) : null,
        nodeModels: nodeTemplate ? BehaviorTreePreviewPanel.cloneNodeModels(BehaviorTreePreviewPanel.copiedNodeModels) : []
      }
    });
  }

  private postDocumentOpenFinished(): void {
    this.panel.webview.postMessage({
      type: "documentOpenFinished"
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
    const nextPayload = this.toPayload(document);
    if (this.isPayloadWithoutBehaviorTrees(nextPayload)) {
      await this.detachInvalidDocumentAfterPrompt();
      return;
    }

    this.latestPayload = nextPayload;

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
    this.xmlMutations.clearUndoStack();
    this.latestPayload = this.toPayload(document);
    this.updatePanelTitle(document.fileName);
    BehaviorTreePreviewPanel.addPanelForDocument(document.uri, this);
    BehaviorTreePreviewPanel.setActivePanel(this);
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
    this.xmlMutations.clearUndoStack();
    this.latestPayload = this.toPayload(undefined);
    this.panel.title = "BTreeTool";
    BehaviorTreePreviewPanel.setActivePanel(this);
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
    const effectiveSettings = this.getEffectiveSettings();
    const settingsFilePath = this.settingsFileUri?.fsPath || "";

    if (!document) {
      return buildPreviewPayload(undefined, this.currentSettings, effectiveSettings, settingsFilePath);
    }

    const documentUri = document.uri.toString();
    const cached = this.previewPayloadCache;
    if (
      cached?.documentUri === documentUri &&
      cached.documentVersion === document.version &&
      cached.documentIsDirty === document.isDirty &&
      cached.currentSettings === this.currentSettings &&
      cached.effectiveSettings === effectiveSettings &&
      cached.settingsFilePath === settingsFilePath
    ) {
      return cached.payload;
    }

    const payload = buildPreviewPayload(document, this.currentSettings, effectiveSettings, settingsFilePath);
    this.previewPayloadCache = {
      documentUri,
      documentVersion: document.version,
      documentIsDirty: document.isDirty,
      currentSettings: this.currentSettings,
      effectiveSettings,
      settingsFilePath,
      payload
    };
    return payload;
  }

  private isPayloadWithoutBehaviorTrees(payload: PreviewPayload): boolean {
    return Boolean(payload.preview && payload.preview.behaviorTrees.length === 0);
  }

  private async handleUpdateNodeAttributes(
    payload: { treeId?: string; nodePath?: string; attributes?: Record<string, string> } | undefined
  ): Promise<void> {
    await handleUpdateNodeAttributesAction(payload, this.getEditActionContext());
  }

  private handleEditAssistantAsk(
    payload:
      | {
          requestId?: string;
          prompt?: string;
          action?: string;
          silent?: boolean;
          treeId?: string;
          nodePath?: string;
          queueTreeIds?: string[];
        }
      | undefined
  ): void {
    handleEditAssistantAskAction(payload, {
      preview: this.latestPayload.preview,
      settings: this.currentSettings,
      copy: this.getCopy(),
      atlasNodes: this.atlasNodes,
      postMessage: (message) => this.panel.webview.postMessage(message)
    });
  }

  private async handleSaveTreeNodeModels(payload: Parameters<typeof handleSaveTreeNodeModelsAction>[0]): Promise<void> {
    await handleSaveTreeNodeModelsAction(payload, this.getEditActionContext());
  }

  private async handleCreateBehaviorTree(payload: { treeId?: string } | undefined): Promise<void> {
    await handleCreateBehaviorTreeAction(payload, this.getEditActionContext());
  }

  private async handleDeleteBehaviorTree(payload: { treeId?: string } | undefined): Promise<void> {
    await handleDeleteBehaviorTreeAction(payload, this.getEditActionContext());
  }

  private async handleRenameBehaviorTree(
    payload: { oldTreeId?: string; newTreeId?: string } | undefined
  ): Promise<void> {
    await handleRenameBehaviorTreeAction(payload, this.getEditActionContext());
  }

  private async handleMoveNode(
    payload: { treeId?: string; sourceNodePath?: string; targetParentPath?: string; targetIndex?: number } | undefined
  ): Promise<void> {
    await handleMoveNodeAction(payload, this.getEditActionContext());
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
    await handleCreateNodeAction(payload, this.getEditActionContext());
  }

  private async handleCreateNodeCopy(payload: Parameters<typeof handleCreateNodeCopyAction>[0]): Promise<void> {
    await handleCreateNodeCopyAction(payload, this.getEditActionContext());
  }

  private handleCopyNodeTemplate(
    payload: { nodeTemplate?: NodeCopyTemplateMessage; nodeModels?: BtNodeModel[] } | undefined
  ): void {
    const nodeTemplate = payload?.nodeTemplate;
    if (!nodeTemplate?.tagName || !nodeTemplate.attributes) {
      return;
    }

    BehaviorTreePreviewPanel.copiedNodeTemplate = {
      tagName: nodeTemplate.tagName,
      attributes: { ...nodeTemplate.attributes },
      children: normalizeNodeCopyChildren(nodeTemplate.children)
    };
    BehaviorTreePreviewPanel.copiedNodeModels = normalizeNodeCopyModels(payload?.nodeModels);
    BehaviorTreePreviewPanel.broadcastNodeClipboardState();
  }

  private async handlePasteSharedNodeTemplate(
    payload:
      | {
          treeId?: string;
          targetParentPath?: string;
          targetIndex?: number;
        }
      | undefined
  ): Promise<void> {
    const nodeTemplate = BehaviorTreePreviewPanel.copiedNodeTemplate;
    if (!nodeTemplate) {
      this.postNodeClipboardState();
      return;
    }

    await this.handleCreateNodeCopy({
      ...payload,
      nodeTemplate: BehaviorTreePreviewPanel.cloneNodeTemplate(nodeTemplate),
      nodeModels: BehaviorTreePreviewPanel.cloneNodeModels(BehaviorTreePreviewPanel.copiedNodeModels)
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
    await handleDeleteNodeAction(payload, this.getEditActionContext());
  }

  private async handleUndoCurrentDocument(): Promise<void> {
    await this.xmlMutations.undo();
  }

  private async handleSaveCurrentDocument(): Promise<void> {
    await handleSaveCurrentDocumentAction(this.getDocumentWorkflowContext());
  }

  private async handleCreateNewBehaviorTreeDocument(): Promise<void> {
    await handleCreateNewBehaviorTreeDocumentAction(this.getDocumentWorkflowContext());
  }

  private async handleOpenExistingBehaviorTreeDocument(): Promise<void> {
    try {
      await handleOpenExistingBehaviorTreeDocumentAction(this.getDocumentWorkflowContext());
    } finally {
      this.postDocumentOpenFinished();
    }
  }

  private async handleChoosePlaybackLogFile(): Promise<void> {
    const result = await handleChoosePlaybackLogFileAction(this.getCopy().importPlaybackLogTitle, this.currentSettings);
    this.applyPlaybackLogActionResult(result);
  }

  private async handleImportPlaybackLogFile(filePath: string): Promise<void> {
    const result = await handleImportPlaybackLogFileAction(filePath, this.currentSettings);
    this.applyPlaybackLogActionResult(result);
  }

  private queuePlaybackLogFile(filePath: string): void {
    this.pendingPlaybackLogFilePath = filePath;
    if (this.webviewReady) {
      void this.consumePendingPlaybackLogFile();
    }
  }

  private async consumePendingPlaybackLogFile(): Promise<void> {
    const filePath = this.pendingPlaybackLogFilePath;
    if (!filePath) {
      return;
    }

    this.pendingPlaybackLogFilePath = null;
    this.panel.webview.postMessage({ type: "playbackLogImportStarted" });
    await this.handleImportPlaybackLogFile(filePath);
  }

  private applyPlaybackLogActionResult(result: Awaited<ReturnType<typeof handleChoosePlaybackLogFileAction>>): void {
    if (result.kind === "loaded") {
      this.latestPlaybackLog = result.playbackLog;
      this.panel.title = result.panelTitle;
    }
    if (result.kind === "error") {
      this.latestPlaybackLog = null;
    }
    if (result.clearTraceContext) {
      this.traceContextFile = null;
      this.postTraceContextFileState();
    }
    this.panel.webview.postMessage(result.message);
    if (result.kind === "error") {
      void vscode.window.showErrorMessage(`BTreeTool: ${result.errorMessage}`);
    }
  }

  private async handleChooseTraceContextFile(): Promise<void> {
    try {
      const traceContextFile = await chooseTraceContextFile();
      if (!traceContextFile) {
        return;
      }
      this.traceContextFile = traceContextFile;
      this.postTraceContextFileState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`BTreeTool: failed to read async log. ${message}`);
    }
  }

  private handleSetTraceContextFile(payload: { fileName?: string; text?: string } | undefined): void {
    const traceContextFile = createTraceContextFileFromPayload(payload);
    if (!traceContextFile) {
      void vscode.window.showWarningMessage("BTreeTool: async log file is empty or could not be read.");
      return;
    }

    this.traceContextFile = traceContextFile;
    this.postTraceContextFileState();
  }

  private postTraceContextFileState(): void {
    this.panel.webview.postMessage({
      type: "traceContextFileState",
      payload: this.traceContextFile?.state || null
    });
  }

  private async openTraceConfigFile(): Promise<void> {
    this.traceConfigFileUri = await openTraceConfigFileAction(this.globalStorageUri, this.traceConfigFileUri);
  }

  private async handleAddTraceProvider(): Promise<void> {
    const result = await handleAddTraceProviderAction(this.globalStorageUri);
    if (result.configUri) {
      this.traceConfigFileUri = result.configUri;
    }
    this.panel.webview.postMessage(result.message);
  }

  private async handleSetTraceProvider(payload: { providerId?: string } | undefined): Promise<void> {
    try {
      const result = await handleSetTraceProviderAction(this.globalStorageUri, payload);
      if (!result) {
        return;
      }
      if (result.configUri) {
        this.traceConfigFileUri = result.configUri;
      }
      this.panel.webview.postMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`BTreeTool: ${message}`);
      void this.postTraceConfigState();
    }
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
    await handleTraceAskAction({
      payload,
      globalStorageUri: this.globalStorageUri,
      latestPlaybackLog: this.latestPlaybackLog,
      currentSettings: this.currentSettings,
      externalContext: this.traceContextFile?.text || "",
      controllers: this.traceRequestControllers,
      postMessage: (message) => this.panel.webview.postMessage(message),
      refreshTraceConfig: () => {
        void this.postTraceConfigState();
      }
    });
  }

  private async handleTraceCancel(payload: { requestId?: string } | undefined): Promise<void> {
    cancelTraceRequest(this.traceRequestControllers, payload);
  }

  private async handleTraceFeedback(payload: TraceFeedbackPayload | undefined): Promise<void> {
    const record = createTraceFeedbackRecord(payload);
    if (!record) {
      return;
    }

    try {
      await storeTraceFeedback(this.globalStorageUri, this.currentSettings, record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`BTreeTool: failed to store trace feedback. ${message}`);
    }
  }

  private async initializeSettings(): Promise<void> {
    try {
      const { settings, configUri } = await loadUserSettings(this.globalStorageUri);
      this.currentSettings = settings;
      this.settingsFileUri = configUri;
      this.nodeLibraryPresets = await loadNodeLibraryPresetsForExtension(this.extensionUri, this.globalStorageUri);
      const attachedDocument = this.latestDocumentUri
        ? await vscode.workspace.openTextDocument(this.latestDocumentUri)
        : undefined;
      const nextPayload = this.toPayload(attachedDocument);
      if (this.isPayloadWithoutBehaviorTrees(nextPayload)) {
        await this.detachInvalidDocumentAfterPrompt();
        return;
      }

      this.latestPayload = nextPayload;
      if (this.webviewReady) {
        this.postLatestPayload();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(this.getCopy().loadSettingsFailed(message));
    }
  }

  private async handleSaveUserSettings(payload: BtUserSettings | undefined): Promise<void> {
    await handleSaveUserSettingsAction(payload, this.getSettingsWorkflowContext());
  }

  private async openUserSettingsFile(): Promise<void> {
    await openUserSettingsFileAction(this.getSettingsWorkflowContext());
  }

  private async handleImportRecommendedPresets(): Promise<void> {
    await handleImportRecommendedPresetsAction(this.getSettingsWorkflowContext());
  }

  private async handleImportCustomNodes(): Promise<void> {
    await handleImportCustomNodesAction(this.getSettingsWorkflowContext());
  }

  private async handleClearImportedNodes(): Promise<void> {
    await handleClearImportedNodesAction(this.getSettingsWorkflowContext());
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
      BehaviorTreePreviewPanel.setActivePanel(null);
    }

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}
