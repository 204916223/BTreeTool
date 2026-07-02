import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import * as vscode from "vscode";
import { parseBehaviorTreeDocument } from "../core/parse";
import { serializeBehaviorTreeDocument } from "../core/serialize";
import {
  importTreeNodesModelToNodeLibrary,
  NodeLibraryImportResult
} from "../core/nodeLibraryImport";
import { loadMergedNodeLibraryPresets } from "../core/nodeLibrary";
import { BtUserSettings, mergeRecommendedPresets, saveUserSettings } from "../userSettings";
import { formatImportConflictNames, mergePresetNodeSets, openDocumentInEditor } from "./panelUtils";
import type { getPanelCopy } from "./panelCopy";

const nodeLibraryPresetsCache = new Map<string, Promise<BtUserSettings["presetNodes"]>>();

export type ImportCustomNodesCopy = {
  importCustomNodesTitle: string;
  customNodesOverwriteAction: string;
  customNodesSkipAction: string;
  customNodesConflictPrompt: (names: string) => string;
};

export type ImportCustomNodesActionResult =
  | { canceled: true }
  | { canceled: false; ok: true; result: NodeLibraryImportResult }
  | { canceled: false; ok: false; message: string };

type PanelCopy = ReturnType<typeof getPanelCopy>;

export type SettingsWorkflowContext = {
  extensionUri: vscode.Uri;
  globalStorageUri: vscode.Uri;
  getCopy: () => PanelCopy;
  getDocumentUri: () => vscode.Uri | null;
  getSettingsFileUri: () => vscode.Uri | null;
  getCurrentSettings: () => BtUserSettings;
  setCurrentSettings: (settings: BtUserSettings) => void;
  getNodeLibraryPresets: () => BtUserSettings["presetNodes"];
  setNodeLibraryPresets: (presetNodes: BtUserSettings["presetNodes"]) => void;
  initializeSettings: () => Promise<void>;
  refreshPreviewFromUri: () => Promise<void>;
  postSettingsUpdated: () => void;
  postEditResult: (ok: boolean, message: string, dirtyState?: "dirty" | "saved") => void;
  replaceDocumentTextWithUndo: (
    document: vscode.TextDocument,
    currentText: string,
    nextText: string,
    rejectedMessage: string
  ) => Promise<void>;
};

export function loadNodeLibraryPresetsForExtension(
  extensionUri: vscode.Uri,
  globalStorageUri: vscode.Uri
): Promise<BtUserSettings["presetNodes"]> {
  const cacheKey = getNodeLibraryCacheKey(extensionUri, globalStorageUri);
  const cached = nodeLibraryPresetsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = loadMergedNodeLibraryPresets([
    getBundledNodeLibraryUri(extensionUri).fsPath,
    getImportedNodeLibraryUri(globalStorageUri).fsPath
  ]).catch(() => []);
  nodeLibraryPresetsCache.set(cacheKey, promise);
  return promise;
}

export function clearNodeLibraryPresetsCache(extensionUri: vscode.Uri, globalStorageUri: vscode.Uri): void {
  nodeLibraryPresetsCache.delete(getNodeLibraryCacheKey(extensionUri, globalStorageUri));
}

export function reloadNodeLibraryPresetsForExtension(
  extensionUri: vscode.Uri,
  globalStorageUri: vscode.Uri
): Promise<BtUserSettings["presetNodes"]> {
  clearNodeLibraryPresetsCache(extensionUri, globalStorageUri);
  return loadNodeLibraryPresetsForExtension(extensionUri, globalStorageUri);
}

export async function importCustomNodesToNodeLibrary(
  extensionUri: vscode.Uri,
  globalStorageUri: vscode.Uri,
  copy: ImportCustomNodesCopy
): Promise<ImportCustomNodesActionResult> {
  const files = await vscode.window.showOpenDialog({
    title: copy.importCustomNodesTitle,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      TreeNodesModel: ["btt", "xml"],
      "All Files": ["*"]
    }
  });

  const file = files?.[0];
  if (!file) {
    return { canceled: true };
  }

  try {
    const raw = await vscode.workspace.fs.readFile(file);
    const source = Buffer.from(raw).toString("utf8");
    const result = await importTreeNodesModelToNodeLibrary(
      source,
      getImportedNodeLibraryUri(globalStorageUri).fsPath,
      {
        conflictRootPaths: [getBundledNodeLibraryUri(extensionUri).fsPath],
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
      return { canceled: true };
    }
    return { canceled: false, ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { canceled: false, ok: false, message };
  }
}

export async function clearImportedNodeLibrary(globalStorageUri: vscode.Uri): Promise<void> {
  await fs.rm(getImportedNodeLibraryUri(globalStorageUri).fsPath, { recursive: true, force: true });
}

export async function handleSaveUserSettingsAction(
  payload: BtUserSettings | undefined,
  context: SettingsWorkflowContext
): Promise<void> {
  const copy = context.getCopy();
  const settingsFileUri = context.getSettingsFileUri();
  if (!settingsFileUri || !payload) {
    context.postEditResult(false, copy.settingsNotReady);
    return;
  }

  try {
    context.setCurrentSettings(await saveUserSettings(settingsFileUri, payload));
    context.postSettingsUpdated();
    await context.refreshPreviewFromUri();
    context.postEditResult(true, context.getCopy().settingsSaved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.postEditResult(false, context.getCopy().settingsSaveFailed(message));
  }
}

export async function openUserSettingsFileAction(context: SettingsWorkflowContext): Promise<void> {
  const settingsFileUri = await ensureSettingsFileUri(context);

  if (!settingsFileUri) {
    void vscode.window.showWarningMessage(context.getCopy().settingsFileNotReadyWarning);
    return;
  }

  await openDocumentInEditor(settingsFileUri);
}

export async function handleImportRecommendedPresetsAction(context: SettingsWorkflowContext): Promise<void> {
  const settingsFileUri = await ensureSettingsFileUri(context);

  if (!settingsFileUri) {
    context.postEditResult(false, context.getCopy().settingsFileNotReady);
    return;
  }

  try {
    context.setCurrentSettings(await saveUserSettings(settingsFileUri, mergeRecommendedPresets(context.getCurrentSettings())));
    await context.refreshPreviewFromUri();
    context.postEditResult(true, context.getCopy().presetsImported);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.postEditResult(false, context.getCopy().presetsImportFailed(message));
  }
}

export async function handleImportCustomNodesAction(context: SettingsWorkflowContext): Promise<void> {
  const copy = context.getCopy();
  const action = await importCustomNodesToNodeLibrary(context.extensionUri, context.globalStorageUri, copy);
  if (action.canceled) {
    return;
  }
  if (!action.ok) {
    context.postEditResult(false, copy.customNodesImportFailed(action.message));
    return;
  }

  try {
    context.setNodeLibraryPresets(
      await reloadNodeLibraryPresetsForExtension(context.extensionUri, context.globalStorageUri)
    );
    await context.refreshPreviewFromUri();
    const { result } = action;
    context.postEditResult(
      result.importedCount > 0,
      result.importedCount > 0
        ? copy.customNodesImported(result.importedCount)
        : result.conflicts.length > 0
          ? copy.customNodesImportSkipped
          : copy.customNodesImportEmpty
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.postEditResult(false, copy.customNodesImportFailed(message));
  }
}

export async function handleClearImportedNodesAction(context: SettingsWorkflowContext): Promise<void> {
  const copy = context.getCopy();
  const choice = await vscode.window.showWarningMessage(
    copy.clearImportedNodesConfirm,
    { modal: true },
    copy.clearImportedNodesAction
  );
  if (choice !== copy.clearImportedNodesAction) {
    return;
  }

  try {
    const previousNodeLibraryPresets = context.getNodeLibraryPresets();
    await clearImportedNodeLibrary(context.globalStorageUri);
    const restoredNodeLibraryPresets = await reloadNodeLibraryPresetsForExtension(
      context.extensionUri,
      context.globalStorageUri
    );
    await preserveAttachedDocumentModelsFromPresets(
      context,
      findRemovedOrChangedNodePresets(previousNodeLibraryPresets, restoredNodeLibraryPresets)
    );
    context.setNodeLibraryPresets(restoredNodeLibraryPresets);
    await context.refreshPreviewFromUri();
    context.postEditResult(true, copy.importedNodesCleared);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.postEditResult(false, copy.importedNodesClearFailed(message));
  }
}

export function findRemovedOrChangedNodePresets(
  previousPresets: BtUserSettings["presetNodes"],
  restoredPresets: BtUserSettings["presetNodes"]
): BtUserSettings["presetNodes"] {
  const restoredByKey = new Map(restoredPresets.map((preset) => [preset.key, preset]));
  return previousPresets.filter((preset) => {
    const restored = restoredByKey.get(preset.key);
    return !restored || JSON.stringify(restored) !== JSON.stringify(preset);
  });
}

async function ensureSettingsFileUri(context: SettingsWorkflowContext): Promise<vscode.Uri | null> {
  if (!context.getSettingsFileUri()) {
    await context.initializeSettings();
  }
  return context.getSettingsFileUri();
}

async function preserveAttachedDocumentModelsFromPresets(
  context: SettingsWorkflowContext,
  presetNodes: BtUserSettings["presetNodes"]
): Promise<void> {
  const documentUri = context.getDocumentUri();
  if (!documentUri || presetNodes.length === 0) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(documentUri);
  const currentText = document.getText();
  const parsed = parseBehaviorTreeDocument(currentText, mergePresetNodeSets(context.getCurrentSettings(), presetNodes));
  const nextXml = serializeBehaviorTreeDocument(parsed);
  if (nextXml === currentText) {
    return;
  }

  await context.replaceDocumentTextWithUndo(
    document,
    currentText,
    nextXml,
    context.getCopy().xmlUpdateRejected
  );
}

function getBundledNodeLibraryUri(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, "node-library");
}

function getImportedNodeLibraryUri(globalStorageUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(globalStorageUri, "node-library");
}

function getNodeLibraryCacheKey(extensionUri: vscode.Uri, globalStorageUri: vscode.Uri): string {
  return `${extensionUri.fsPath}\n${globalStorageUri.fsPath}`;
}
