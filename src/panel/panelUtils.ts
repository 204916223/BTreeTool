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
