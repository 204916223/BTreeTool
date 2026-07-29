import * as vscode from "vscode";
import { BtNodeModel } from "../core/btAst";
import { NodeLibraryImportConflict } from "../core/nodeLibraryImport";
import { BtUserSettings, cloneUserSettings } from "../userSettings";
import { NodeCopyTemplateMessage, NormalizedNodeCopyTemplate } from "./messages";

export function normalizeNodeCopyChildren(
  children: NodeCopyTemplateMessage[] | undefined
): NormalizedNodeCopyTemplate[] {
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

export function normalizeNodeCopyModels(models: BtNodeModel[] | undefined): BtNodeModel[] {
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .filter((model) => Boolean(model?.id && model.modelKind && model.attributes && Array.isArray(model.ports)))
    .map((model) => ({
      id: model.id,
      modelKind: model.modelKind,
      attributes: { ...model.attributes, ID: model.id },
      ports: model.ports
        .filter(
          (port) =>
            Boolean(port?.attributes?.name) &&
            (port.tagName === "input_port" || port.tagName === "output_port" || port.tagName === "inout_port")
        )
        .map((port) => ({
          tagName: port.tagName,
          attributes: { ...port.attributes }
        }))
    }));
}

export function mergePresetNodeSets(
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

export function formatImportConflictNames(conflicts: NodeLibraryImportConflict[]): string {
  const names = conflicts.map((conflict) => `${conflict.category}/${conflict.nodeId}`);
  const visibleNames = names.slice(0, 20);
  const suffix = names.length > visibleNames.length ? `, +${names.length - visibleNames.length}` : "";
  return `${visibleNames.join(", ")}${suffix}`;
}

export function toBaseName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || fileName;
}

export async function showDocumentInEditor(document: vscode.TextDocument): Promise<vscode.TextEditor> {
  return vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false
  });
}

export async function openDocumentInEditor(uri: vscode.Uri): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(uri);
  await showDocumentInEditor(document);
  return document;
}
