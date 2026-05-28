import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  BtPresetFieldSettings,
  BtPresetNodeSettings,
  BtSettingsFieldRole,
  BtSettingsNodeCategory
} from "../userSettings";

const NODE_LIBRARY_CATEGORIES: BtSettingsNodeCategory[] = ["Action", "Condition", "Control", "Decorator"];

export async function loadNodeLibraryPresets(libraryRootPath: string): Promise<BtPresetNodeSettings[]> {
  const presets: BtPresetNodeSettings[] = [];

  for (const category of NODE_LIBRARY_CATEGORIES) {
    const categoryPath = path.join(libraryRootPath, category);
    let entries: Array<{ name: string; isFile: boolean }>;

    try {
      entries = await readDirectory(categoryPath);
    } catch (_error) {
      continue;
    }

    for (const entry of entries.filter((item) => item.isFile && item.name.toLowerCase().endsWith(".btt")).sort(compareByName)) {
      const filePath = path.join(categoryPath, entry.name);
      const source = await fs.readFile(filePath, "utf8");
      const preset = parseNodeLibraryPreset(source, category, stripExtension(entry.name));
      if (preset) {
        presets.push(preset);
      }
    }
  }

  return presets;
}

function parseNodeLibraryPreset(
  source: string,
  fallbackCategory: BtSettingsNodeCategory,
  fallbackKey: string
): BtPresetNodeSettings | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/^<\?xml[\s\S]*?\?>\s*/i, "");
  const selfClosingMatch = normalized.match(/^<node\b([^>]*)\/>$/s);
  const openCloseMatch = normalized.match(/^<node\b([^>]*)>([\s\S]*)<\/node>$/s);
  const nodeAttrsText = selfClosingMatch?.[1] ?? openCloseMatch?.[1];
  if (!nodeAttrsText) {
    return null;
  }

  const nodeAttrs = parseAttributes(nodeAttrsText);
  const key = nodeAttrs.name || nodeAttrs.id || fallbackKey;
  if (!key) {
    return null;
  }

  const category = toCategory(nodeAttrs.category || fallbackCategory);
  const modelKind = nodeAttrs.modelKind || category;
  const allowCustomAttributes = nodeAttrs.allowCustomAttributes !== "false";
  const fields = parseFields(openCloseMatch?.[2] || "");

  return {
    key,
    title: nodeAttrs.title || nodeAttrs.name || key,
    category,
    modelKind,
    allowCustomAttributes,
    fields
  };
}

function parseFields(body: string): BtPresetFieldSettings[] {
  const fields: BtPresetFieldSettings[] = [];
  const fieldPattern = /<(input_port|output_port|inout_port|param_port)\b([^>]*)\/\s*>/g;

  for (const match of body.matchAll(fieldPattern)) {
    const tagName = match[1] as "input_port" | "output_port" | "inout_port" | "param_port";
    const attrs = parseAttributes(match[2] || "");
    const key = attrs.name || "";
    if (!key) {
      continue;
    }

    fields.push({
      key,
      role: toFieldRole(tagName),
      required: attrs.required !== "false",
      editableKey: attrs.editableKey === "true",
      editableValue: attrs.editableValue !== "false",
      removable: attrs.removable === "true",
      defaultValue: attrs.default || ""
    });
  }

  return fields;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
  for (const match of source.matchAll(pattern)) {
    attrs[match[1]] = match[2] ?? "";
  }
  return attrs;
}

async function readDirectory(dirPath: string): Promise<Array<{ name: string; isFile: boolean }>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isFile: entry.isFile()
  }));
}

function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
}

function compareByName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function toCategory(category: string): BtSettingsNodeCategory {
  if (category === "Condition") {
    return "Condition";
  }

  if (category === "Control") {
    return "Control";
  }

  if (category === "Decorator") {
    return "Decorator";
  }

  return "Action";
}

function toFieldRole(tagName: "input_port" | "output_port" | "inout_port" | "param_port"): BtSettingsFieldRole {
  if (tagName === "param_port") {
    return "param";
  }

  if (tagName === "output_port") {
    return "output";
  }

  if (tagName === "inout_port") {
    return "inout";
  }

  return "input";
}
