import { Buffer } from "node:buffer";
import * as vscode from "vscode";
import {
  importTreeNodesModelToNodeLibrary,
  NodeLibraryImportResult,
  restoreDefaultNodeLibrary
} from "../core/nodeLibraryImport";
import { loadNodeLibraryPresets } from "../core/nodeLibrary";
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

export function loadNodeLibraryPresetsForExtension(extensionUri: vscode.Uri): Promise<BtUserSettings["presetNodes"]> {
  const cacheKey = extensionUri.fsPath;
  const cached = nodeLibraryPresetsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = loadNodeLibraryPresets(vscode.Uri.joinPath(extensionUri, "node-library").fsPath).catch(() => []);
  nodeLibraryPresetsCache.set(cacheKey, promise);
  return promise;
}

export function clearNodeLibraryPresetsCache(extensionUri: vscode.Uri): void {
  nodeLibraryPresetsCache.delete(extensionUri.fsPath);
}

export async function importCustomNodesToNodeLibrary(
  extensionUri: vscode.Uri,
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
      vscode.Uri.joinPath(extensionUri, "node-library").fsPath,
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
      return { canceled: true };
    }
    return { canceled: false, ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { canceled: false, ok: false, message };
  }
}

export async function restoreBundledNodeLibrary(extensionUri: vscode.Uri): Promise<void> {
  await restoreDefaultNodeLibrary(vscode.Uri.joinPath(extensionUri, "node-library").fsPath);
}
