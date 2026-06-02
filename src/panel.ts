import * as vscode from "vscode";
import { BtPlaybackLog } from "./core/btlog";
import { parseBehaviorTreeDocument } from "./core/parse";
import { BtPreviewDocument, buildPreviewDocument } from "./core/viewModel";
import {
  BtUserSettings,
  cloneUserSettings,
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  mergeRecommendedPresets,
  saveUserSettings
} from "./userSettings";
import { addTraceProvider, getTraceConfigState, loadTraceConfig } from "./traceConfig";
import { getWebviewHtml } from "./panel/webviewHtml";
import {
  PreviewPayload,
  ShortcutAction,
  WebviewMessage
} from "./panel/messages";
import { routeWebviewMessage } from "./panel/messageRouter";
import { getPanelCopy } from "./panel/panelCopy";
import { mergePresetNodeSets } from "./panel/panelUtils";
import { choosePlaybackLogFile } from "./panel/playbackLogActions";
import { cancelTraceRequest, createTraceRequestControllers, handleTraceAskAction } from "./panel/traceActions";
import {
  createNewBehaviorTreeDocumentXml,
  isDocumentSaveBlocked,
  normalizeBehaviorTreeXml,
  normalizeDocumentBeforeSave,
  replaceDocumentText,
  writeUtf8File
} from "./panel/documentActions";
import {
  clearNodeLibraryPresetsCache,
  importCustomNodesToNodeLibrary,
  loadNodeLibraryPresetsForExtension,
  restoreBundledNodeLibrary
} from "./panel/settingsActions";
import {
  EditActionContext,
  handleCreateBehaviorTreeAction,
  handleCreateNodeAction,
  handleCreateNodeCopyAction,
  handleDeleteBehaviorTreeAction,
  handleDeleteNodeAction,
  handleMoveNodeAction,
  handleSaveTreeNodeModelsAction,
  handleUpdateNodeAttributesAction,
  XmlMutation
} from "./panel/editActions";

type InitialPanelState = {
  settings: BtUserSettings;
  settingsFileUri: vscode.Uri;
  nodeLibraryPresets: BtUserSettings["presetNodes"];
};

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
    settings: cloneUserSettings(DEFAULT_USER_SETTINGS),
    settingsFilePath: ""
  };

  static async createOrShow(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri,
    document?: vscode.TextDocument
  ): Promise<void> {
    if (document && BehaviorTreePreviewPanel.isXmlWithoutBehaviorTrees(document)) {
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
      initialState
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

  private static async loadInitialPanelState(
    extensionUri: vscode.Uri,
    globalStorageUri: vscode.Uri
  ): Promise<InitialPanelState> {
    const [{ settings, configUri }, nodeLibraryPresets] = await Promise.all([
      loadUserSettings(globalStorageUri),
      loadNodeLibraryPresetsForExtension(extensionUri)
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
  private latestPayload: PreviewPayload = BehaviorTreePreviewPanel.emptyPayload;
  private latestDocumentUri: vscode.Uri | null = null;
  private latestPlaybackLog: BtPlaybackLog | null = null;
  private settingsFileUri: vscode.Uri | null = null;
  private traceConfigFileUri: vscode.Uri | null = null;
  private readonly traceRequestControllers = createTraceRequestControllers();
  private currentSettings: BtUserSettings = cloneUserSettings(BehaviorTreePreviewPanel.emptyPayload.settings);
  private nodeLibraryPresets: BtUserSettings["presetNodes"] = [];
  private webviewReady = false;
  private readonly xmlUndoStack: string[] = [];
  private suppressedDocumentRefresh: { uri: string; version: number | null } | null = null;
  private invalidDocumentPrompt: Promise<void> | null = null;
  private getCopy() {
    return getPanelCopy(this.currentSettings.language);
  }

  private getEffectiveSettings(): BtUserSettings {
    return mergePresetNodeSets(this.currentSettings, this.nodeLibraryPresets);
  }

  private getEditActionContext(): EditActionContext {
    return {
      copy: this.getCopy(),
      hasAttachedDocument: Boolean(this.latestDocumentUri),
      preview: this.latestPayload.preview,
      effectiveSettings: this.getEffectiveSettings(),
      applyXmlMutation: (mutation) => this.applyXmlMutation(mutation),
      postEditResult: (ok, message, dirtyState) => this.postEditResult(ok, message, dirtyState)
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
    if (initialState) {
      this.currentSettings = initialState.settings;
      this.settingsFileUri = initialState.settingsFileUri;
      this.nodeLibraryPresets = initialState.nodeLibraryPresets;
    }
    this.latestDocumentUri = document?.uri || null;
    this.latestPayload = this.toPayload(document);
    BehaviorTreePreviewPanel.activePanel = this;

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
        BehaviorTreePreviewPanel.activePanel = this;
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
        void this.postTraceConfigState();
      },
      handleEditMessage: (message) => this.handleEditMessage(message),
      handleSettingsMessage: (message) => this.handleSettingsMessage(message),
      handleDocumentMessage: (message) => this.handleDocumentMessage(message),
      handlePlaybackMessage: (message) => this.handlePlaybackMessage(message),
      handleTraceMessage: (message) => this.handleTraceMessage(message)
    });
  }

  private handleEditMessage(message: WebviewMessage): boolean {
    if (message.type === "updateNodeAttributes" && "payload" in message) {
      void this.handleUpdateNodeAttributes(message.payload);
      return true;
    }

    if (message.type === "revealTreeNodesModel") {
      void this.revealTreeNodesModel();
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

    if (message.type === "traceAsk" && "payload" in message) {
      void this.handleTraceAsk(message.payload);
      return true;
    }

    if (message.type === "traceCancel" && "payload" in message) {
      void this.handleTraceCancel(message.payload);
      return true;
    }

    return false;
  }

  refreshIfAttachedDocument(document: vscode.TextDocument): void {
    if (!this.latestDocumentUri || this.latestDocumentUri.toString() !== document.uri.toString()) {
      return;
    }

    if (this.consumeSuppressedDocumentRefresh(document)) {
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
    await handleUpdateNodeAttributesAction(payload, this.getEditActionContext());
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

  private async handleSaveTreeNodeModels(payload: Parameters<typeof handleSaveTreeNodeModelsAction>[0]): Promise<void> {
    await handleSaveTreeNodeModelsAction(payload, this.getEditActionContext());
  }

  private async handleCreateBehaviorTree(payload: { treeId?: string } | undefined): Promise<void> {
    await handleCreateBehaviorTreeAction(payload, this.getEditActionContext());
  }

  private async handleDeleteBehaviorTree(payload: { treeId?: string } | undefined): Promise<void> {
    await handleDeleteBehaviorTreeAction(payload, this.getEditActionContext());
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

      this.suppressNextDocumentRefresh(document.uri);
      const applied = await replaceDocumentText(document, nextXml, currentText);

      if (!applied) {
        this.clearSuppressedDocumentRefresh(document.uri);
        throw new Error(this.getCopy().xmlUpdateRejected);
      }

      this.pinSuppressedDocumentRefreshVersion(document);
      this.pushXmlUndoSnapshot(currentText);
      await this.refreshPreviewFromUri();
      this.postEditResult(true, mutation.successMessage, "dirty");
    } catch (error) {
      if (this.latestDocumentUri) {
        this.clearSuppressedDocumentRefresh(this.latestDocumentUri);
      }
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

  private suppressNextDocumentRefresh(uri: vscode.Uri): void {
    this.suppressedDocumentRefresh = {
      uri: uri.toString(),
      version: null
    };
  }

  private consumeSuppressedDocumentRefresh(document: vscode.TextDocument): boolean {
    const suppressed = this.suppressedDocumentRefresh;
    if (!suppressed || suppressed.uri !== document.uri.toString()) {
      return false;
    }

    if (suppressed.version !== null && suppressed.version !== document.version) {
      this.suppressedDocumentRefresh = null;
      return false;
    }

    this.suppressedDocumentRefresh = null;
    return true;
  }

  private clearSuppressedDocumentRefresh(uri: vscode.Uri): void {
    if (this.suppressedDocumentRefresh?.uri === uri.toString()) {
      this.suppressedDocumentRefresh = null;
    }
  }

  private pinSuppressedDocumentRefreshVersion(document: vscode.TextDocument): void {
    if (this.suppressedDocumentRefresh?.uri === document.uri.toString()) {
      this.suppressedDocumentRefresh.version = document.version;
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

      this.suppressNextDocumentRefresh(document.uri);
      const applied = await replaceDocumentText(document, previousText, currentText);

      if (!applied) {
        this.clearSuppressedDocumentRefresh(document.uri);
        throw new Error(copy.xmlUpdateRejected);
      }

      this.pinSuppressedDocumentRefreshVersion(document);
      await this.refreshPreviewFromUri();
      this.postEditResult(true, copy.undoApplied, "dirty");
    } catch (error) {
      if (this.latestDocumentUri) {
        this.clearSuppressedDocumentRefresh(this.latestDocumentUri);
      }
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
      if (isDocumentSaveBlocked(document.getText())) {
        this.postEditResult(false, copy.documentSaveBlocked);
        return;
      }

      document = await normalizeDocumentBeforeSave(document, copy.xmlUpdateRejected);
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
      if (isDocumentSaveBlocked(currentText)) {
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

      await writeUtf8File(targetUri, normalizeBehaviorTreeXml(currentText));
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
    const template = createNewBehaviorTreeDocumentXml();

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

    await writeUtf8File(targetUri, template);
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
    const result = await choosePlaybackLogFile(copy.importPlaybackLogTitle, this.currentSettings);
    if (result.canceled) {
      return;
    }

    if ("playbackLog" in result) {
      this.latestPlaybackLog = result.playbackLog;
      this.panel.title = `BTreeTool: ${result.playbackLog.fileName}`;
      this.panel.webview.postMessage({
        type: "playbackLog",
        payload: result.playbackLog
      });
      return;
    }

    this.latestPlaybackLog = null;
    this.panel.webview.postMessage({
      type: "playbackLogError",
      payload: { message: result.error }
    });
    void vscode.window.showErrorMessage(`BTreeTool: ${result.error}`);
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
    await handleTraceAskAction({
      payload,
      globalStorageUri: this.globalStorageUri,
      latestPlaybackLog: this.latestPlaybackLog,
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

  private async initializeSettings(): Promise<void> {
    try {
      const { settings, configUri } = await loadUserSettings(this.globalStorageUri);
      this.currentSettings = settings;
      this.settingsFileUri = configUri;
      this.nodeLibraryPresets = await loadNodeLibraryPresetsForExtension(this.extensionUri);
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
    const action = await importCustomNodesToNodeLibrary(this.extensionUri, copy);
    if (action.canceled) {
      return;
    }
    if (!action.ok) {
      this.postEditResult(false, copy.customNodesImportFailed(action.message));
      return;
    }

    try {
      clearNodeLibraryPresetsCache(this.extensionUri);
      this.nodeLibraryPresets = await loadNodeLibraryPresetsForExtension(this.extensionUri);
      await this.refreshPreviewFromUri();
      const { result } = action;
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
      await restoreBundledNodeLibrary(this.extensionUri);
      clearNodeLibraryPresetsCache(this.extensionUri);
      this.nodeLibraryPresets = await loadNodeLibraryPresetsForExtension(this.extensionUri);
      await this.refreshPreviewFromUri();
      this.postEditResult(true, copy.importedNodesCleared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, copy.importedNodesClearFailed(message));
    }
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
