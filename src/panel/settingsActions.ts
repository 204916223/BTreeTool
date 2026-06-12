import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import * as vscode from "vscode";
import {
  importTreeNodesModelToNodeLibrary,
  NodeLibraryImportResult
} from "../core/nodeLibraryImport";
import { loadMergedNodeLibraryPresets } from "../core/nodeLibrary";
import { BtUserSettings } from "../userSettings";
import { formatImportConflictNames } from "./panelUtils";

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

function getBundledNodeLibraryUri(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, "node-library");
}

function getImportedNodeLibraryUri(globalStorageUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(globalStorageUri, "node-library");
}

function getNodeLibraryCacheKey(extensionUri: vscode.Uri, globalStorageUri: vscode.Uri): string {
  return `${extensionUri.fsPath}\n${globalStorageUri.fsPath}`;
}
