import * as vscode from "vscode";
import { BtNodeModel } from "./core/btAst";
import { deleteNode, insertNode, moveNode, replaceNodeAttributes, replaceNodeModels } from "./core/edit";
import { isBlockingWarning } from "./core/issueRules";
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
      type: "saveCurrentDocument";
    };

type XmlMutation = {
  unchangedMessage: string;
  successMessage: string;
  failurePrefix: string;
  mutate: (documentText: string) => string;
};

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
    incompleteNodeMove: "The webview sent an incomplete node move request.",
    nodeOrderUnchanged: "Node order already matches the current XML.",
    nodeOrderUpdated: "Node order updated.",
    nodeOrderFailed: "Failed to reorder node.",
    incompleteNodeCreate: "The webview sent an incomplete node create request.",
    nodeCreateUnchanged: "Node already matches the target position.",
    nodeCreated: "Node created.",
    nodeCreateFailed: "Failed to create node.",
    incompleteNodeDelete: "The webview sent an incomplete node delete request.",
    nodeDeleteUnchanged: "Node was already removed.",
    nodeDeleted: "Node deleted.",
    nodeDeleteFailed: "Failed to delete node.",
    xmlUpdateRejected: "VS Code rejected the XML update.",
    loadSettingsFailed: (message: string) => `BTreeTool: Failed to load user settings. ${message}`,
    settingsNotReady: "Settings could not be saved because the configuration file is not ready.",
    settingsSaved: "Settings saved.",
    settingsSaveFailed: (message: string) => `Failed to save settings. ${message}`,
    settingsFileNotReadyWarning: "BTreeTool: The user settings file is not ready yet.",
    settingsFileNotReady: "The user settings file is not ready yet.",
    presetsImported: "Recommended presets imported.",
    presetsImportFailed: (message: string) => `Failed to import recommended presets. ${message}`,
    documentSaved: "XML file saved.",
    documentSaveFailed: "Failed to save the XML file.",
    documentSaveBlocked: "The current behavior tree has blocking issues and cannot be saved from the preview.",
    saveDocumentConfirm: "Save the current XML file now?",
    saveAction: "Save"
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
    incompleteNodeMove: "Webview 发送的节点移动请求不完整。",
    nodeOrderUnchanged: "节点顺序与当前 XML 已一致。",
    nodeOrderUpdated: "节点顺序已更新。",
    nodeOrderFailed: "节点重排失败。",
    incompleteNodeCreate: "Webview 发送的节点创建请求不完整。",
    nodeCreateUnchanged: "节点已经位于目标位置。",
    nodeCreated: "节点已创建。",
    nodeCreateFailed: "创建节点失败。",
    incompleteNodeDelete: "Webview 发送的节点删除请求不完整。",
    nodeDeleteUnchanged: "节点此前已被移除。",
    nodeDeleted: "节点已删除。",
    nodeDeleteFailed: "删除节点失败。",
    xmlUpdateRejected: "VS Code 拒绝了这次 XML 更新。",
    loadSettingsFailed: (message: string) => `BTreeTool：加载用户设置失败。${message}`,
    settingsNotReady: "配置文件尚未就绪，暂时无法保存设置。",
    settingsSaved: "设置已保存。",
    settingsSaveFailed: (message: string) => `保存设置失败。${message}`,
    settingsFileNotReadyWarning: "BTreeTool：用户设置文件尚未就绪。",
    settingsFileNotReady: "用户设置文件尚未就绪。",
    presetsImported: "推荐预设已导入。",
    presetsImportFailed: (message: string) => `导入推荐预设失败。${message}`,
    documentSaved: "XML 文件已保存。",
    documentSaveFailed: "保存 XML 文件失败。",
    documentSaveBlocked: "当前行为树存在阻断性问题，无法从预览窗口保存。",
    saveDocumentConfirm: "现在保存当前 XML 文件吗？",
    saveAction: "保存"
  };
}

export class BehaviorTreePreviewPanel {
  private static currentPanel: BehaviorTreePreviewPanel | undefined;
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
      simplifyHiddenSections: ["code", "inputs", "outputs", "params", "subtreeJump"],
      presetNodes: []
    },
    settingsFilePath: ""
  };

  static createOrShow(extensionUri: vscode.Uri, globalStorageUri: vscode.Uri): void {
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

    BehaviorTreePreviewPanel.currentPanel = new BehaviorTreePreviewPanel(panel, extensionUri, globalStorageUri);
  }

  static isOpen(): boolean {
    return Boolean(BehaviorTreePreviewPanel.currentPanel);
  }

  static updateForDocument(document: vscode.TextDocument | undefined): void {
    BehaviorTreePreviewPanel.currentPanel?.pushDocument(document);
  }

  static refreshIfAttached(document: vscode.TextDocument): void {
    BehaviorTreePreviewPanel.currentPanel?.refreshIfAttachedDocument(document);
  }

  static disposeCurrent(): void {
    BehaviorTreePreviewPanel.currentPanel?.dispose();
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly globalStorageUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private latestPayload: PreviewPayload = BehaviorTreePreviewPanel.emptyPayload;
  private latestDocumentUri: vscode.Uri | null = null;
  private settingsFileUri: vscode.Uri | null = null;
  private currentSettings: BtUserSettings = cloneUserSettings(BehaviorTreePreviewPanel.emptyPayload.settings);
  private webviewReady = false;

  private getCopy() {
    return getPanelCopy(this.currentSettings.language);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, globalStorageUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.globalStorageUri = globalStorageUri;

    this.panel.webview.html = this.getHtml(this.panel.webview);
    void this.initializeSettings();

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

        if (message.type === "saveTreeNodeModels" && "payload" in message) {
          void this.handleSaveTreeNodeModels(message.payload);
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

        if (message.type === "saveCurrentDocument") {
          void this.handleSaveCurrentDocument();
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

  refreshIfAttachedDocument(document: vscode.TextDocument): void {
    if (!this.latestDocumentUri || this.latestDocumentUri.toString() !== document.uri.toString()) {
      return;
    }

    this.latestPayload = this.toPayload(document);

    if (this.webviewReady) {
      this.postLatestPayload();
    }
  }

  private postLatestPayload(): void {
    this.panel.webview.postMessage({
      type: "btreeDocument",
      payload: this.latestPayload
    });
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
    this.latestPayload = this.toPayload(document);

    if (this.webviewReady) {
      this.postLatestPayload();
    }
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
        preview: buildPreviewDocument(ast, this.currentSettings),
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
          this.currentSettings
        );
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

      await this.refreshPreviewFromUri();
      this.postEditResult(true, mutation.successMessage, "dirty");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postEditResult(false, `${mutation.failurePrefix} ${message}`);
    }
  }

  private async handleSaveCurrentDocument(): Promise<void> {
    const copy = this.getCopy();
    if (!this.latestDocumentUri) {
      this.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      copy.saveDocumentConfirm,
      { modal: true },
      copy.saveAction
    );

    if (choice !== copy.saveAction) {
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(this.latestDocumentUri);
      if (this.isSaveBlocked(document.getText())) {
        this.postEditResult(false, copy.documentSaveBlocked);
        return;
      }

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
      const attachedDocument = this.latestDocumentUri
        ? await vscode.workspace.openTextDocument(this.latestDocumentUri)
        : vscode.window.activeTextEditor?.document;
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

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "main.css"));
    const i18nScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "i18n.js"));
    const modeRulesScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "mode-rules.js")
    );
    const catalogScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "catalog.js"));
    const inspectorScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "inspector.js"));
    const overlaysScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "overlays.js"));
    const canvasScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "canvas.js"));
    const viewportScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "runtime", "viewport-layout.js")
    );
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
            <button
              id="toggle-edit-mode"
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
            <button id="toggle-simplify" class="canvas-btn icon-btn" type="button" title="Show a simplified tree flow with only node names and descriptions" aria-label="Show a simplified tree flow with only node names and descriptions">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v2H5zm0 5h10v2H5zm0 5h14v2H5z"/></svg>
            </button>
            <span id="zoom-level" class="zoom-level">100%</span>
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
              <input
                id="catalog-search"
                class="panel-search"
                type="text"
                placeholder="Search nodes"
                spellcheck="false"
              />
              <div class="panel-actions">
                <button
                  id="add-node-model"
                  class="canvas-btn icon-btn"
                  type="button"
                  title="Add TreeNodesModel node definition"
                  aria-label="Add TreeNodesModel node definition"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
                </button>
                <button id="edit-node-definitions" class="canvas-btn subtle" type="button">
                  Edit XML
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
          </div>
          <div id="inspector-resizer" class="panel-resizer" hidden></div>
          <aside id="inspector-panel" class="inspector-card" hidden>
            <div class="inspector-header">
              <span id="inspector-eyebrow" class="eyebrow">Node Inspector</span>
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
          <button
            id="toggle-inspector"
            class="panel-edge-toggle panel-edge-toggle-right"
            type="button"
            title="Show or hide the node inspector"
            aria-label="Show or hide the node inspector"
          ></button>
        </div>
      </section>
    </main>
    <script nonce="${nonce}" src="${i18nScriptUri}"></script>
    <script nonce="${nonce}" src="${modeRulesScriptUri}"></script>
    <script nonce="${nonce}" src="${catalogScriptUri}"></script>
    <script nonce="${nonce}" src="${inspectorScriptUri}"></script>
    <script nonce="${nonce}" src="${overlaysScriptUri}"></script>
    <script nonce="${nonce}" src="${canvasScriptUri}"></script>
    <script nonce="${nonce}" src="${viewportScriptUri}"></script>
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
