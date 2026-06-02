import * as vscode from "vscode";
import { Buffer } from "node:buffer";

export type BtSettingsLanguage = "zh-CN" | "en-US";
export type BtThemePreset =
  | "midnight"
  | "graphite"
  | "ocean"
  | "forest"
  | "paper"
  | "sand"
  | "mist"
  | "rose";
export type BtSettingsNodeCategory = "Action" | "Condition" | "Control" | "Decorator" | "SubTree";
export type BtSettingsFieldRole = "input" | "output" | "inout" | "param";
export type BtNodeAttributeLayout = "inline" | "stacked";
export type BtTreeRenderMode = "paged" | "expanded";
export type BtPlaybackPanelLayout = "classic" | "dashboard";
export type BtSimplifySection = "description" | "code" | "inputs" | "outputs" | "params" | "subtreeJump";

export interface BtPresetFieldSettings {
  key: string;
  role: BtSettingsFieldRole;
  required: boolean;
  editableKey: boolean;
  editableValue: boolean;
  removable: boolean;
  defaultValue: string;
}

export interface BtPresetNodeSettings {
  key: string;
  title: string;
  category: BtSettingsNodeCategory;
  modelKind: string;
  allowCustomAttributes: boolean;
  fields: BtPresetFieldSettings[];
}

export interface BtUserSettings {
  language: BtSettingsLanguage;
  themePreset: BtThemePreset;
  showMainTreeLocator: boolean;
  showBehaviorTreeRoot: boolean;
  requireNodeDeleteConfirmation: boolean;
  copyNodeWithDescendants: boolean;
  playbackAutoNavigateToTree: boolean;
  allowUnclosedPlaybackLog: boolean;
  traceLearningEnabled: boolean;
  nodeAttributeLayout: BtNodeAttributeLayout;
  editTreeRenderMode: BtTreeRenderMode;
  playbackTreeRenderMode: BtTreeRenderMode;
  playbackPanelLayout: BtPlaybackPanelLayout;
  simplifyHiddenSections: BtSimplifySection[];
  presetNodes: BtPresetNodeSettings[];
}

const SETTINGS_FILE_NAME = "user-settings.json";

export const DEFAULT_USER_SETTINGS: BtUserSettings = {
  language: "en-US",
  themePreset: "midnight",
  showMainTreeLocator: false,
  showBehaviorTreeRoot: true,
  requireNodeDeleteConfirmation: false,
  copyNodeWithDescendants: false,
  playbackAutoNavigateToTree: false,
  allowUnclosedPlaybackLog: true,
  traceLearningEnabled: false,
  nodeAttributeLayout: "inline",
  editTreeRenderMode: "paged",
  playbackTreeRenderMode: "paged",
  playbackPanelLayout: "classic",
  simplifyHiddenSections: [],
  presetNodes: []
};

export const THEME_PRESETS: Array<{ id: BtThemePreset; labelZh: string; labelEn: string }> = [
  { id: "midnight", labelZh: "午夜蓝", labelEn: "Midnight" },
  { id: "graphite", labelZh: "石墨灰", labelEn: "Graphite" },
  { id: "ocean", labelZh: "深海蓝", labelEn: "Ocean" },
  { id: "forest", labelZh: "深林绿", labelEn: "Forest" },
  { id: "paper", labelZh: "纸白", labelEn: "Paper" },
  { id: "sand", labelZh: "暖沙", labelEn: "Sand" },
  { id: "mist", labelZh: "雾灰", labelEn: "Mist" },
  { id: "rose", labelZh: "浅玫", labelEn: "Rose" }
];

export const RECOMMENDED_PRESET_NODES: BtPresetNodeSettings[] = [
  {
    key: "Parallel",
    title: "Parallel",
    category: "Control",
    modelKind: "Control",
    allowCustomAttributes: true,
    fields: [
      createPresetField("success_count", "input", false, "-1"),
      createPresetField("failure_count", "input", false, "1")
    ]
  },
  {
    key: "ParallelAll",
    title: "ParallelAll",
    category: "Control",
    modelKind: "Control",
    allowCustomAttributes: true,
    fields: [createPresetField("max_failures", "input", false, "1")]
  },
  {
    key: "Precondition",
    title: "Precondition",
    category: "Decorator",
    modelKind: "Decorator",
    allowCustomAttributes: true,
    fields: [
      createPresetField("if", "param", true, ""),
      createPresetField("else", "param", false, "FAILURE")
    ]
  },
  {
    key: "RetryUntilSuccessful",
    title: "RetryUntilSuccessful",
    category: "Decorator",
    modelKind: "Decorator",
    allowCustomAttributes: true,
    fields: [createPresetField("num_attempts", "param", true, "1")]
  },
  {
    key: "RetryUntilFailure",
    title: "RetryUntilFailure",
    category: "Decorator",
    modelKind: "Decorator",
    allowCustomAttributes: true,
    fields: [createPresetField("num_attempts", "param", true, "1")]
  }
];

export async function loadUserSettings(globalStorageUri: vscode.Uri): Promise<{ settings: BtUserSettings; configUri: vscode.Uri }> {
  const configUri = vscode.Uri.joinPath(globalStorageUri, SETTINGS_FILE_NAME);
  await vscode.workspace.fs.createDirectory(globalStorageUri);

  try {
    const raw = await vscode.workspace.fs.readFile(configUri);
    const parsed = JSON.parse(Buffer.from(raw).toString("utf8"));
    return {
      settings: normalizeUserSettings(parsed),
      configUri
    };
  } catch (error) {
    const settings = cloneUserSettings(DEFAULT_USER_SETTINGS);
    if (!isFileNotFoundError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`BTreeTool: failed to load user settings. Using defaults without overwriting. ${message}`);
      return {
        settings,
        configUri
      };
    }

    await saveUserSettings(configUri, settings);
    return {
      settings,
      configUri
    };
  }
}

export async function saveUserSettings(configUri: vscode.Uri, settings: BtUserSettings): Promise<BtUserSettings> {
  const normalized = normalizeUserSettings(settings);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(configUri, Buffer.from(content, "utf8"));
  return normalized;
}

export function mergeRecommendedPresets(settings: BtUserSettings): BtUserSettings {
  const existing = new Map(settings.presetNodes.map((entry) => [entry.key, entry]));
  for (const preset of RECOMMENDED_PRESET_NODES) {
    existing.set(preset.key, clonePresetNodeSettings(preset));
  }

  return {
    ...settings,
    presetNodes: Array.from(existing.values()).sort((left, right) => left.title.localeCompare(right.title))
  };
}

export function cloneUserSettings(settings: BtUserSettings): BtUserSettings {
  return {
    language: settings.language,
    themePreset: settings.themePreset,
    showMainTreeLocator: settings.showMainTreeLocator === true,
    showBehaviorTreeRoot: settings.showBehaviorTreeRoot !== false,
    requireNodeDeleteConfirmation: settings.requireNodeDeleteConfirmation === true,
    copyNodeWithDescendants: settings.copyNodeWithDescendants === true,
    playbackAutoNavigateToTree: settings.playbackAutoNavigateToTree === true,
    allowUnclosedPlaybackLog: settings.allowUnclosedPlaybackLog !== false,
    traceLearningEnabled: settings.traceLearningEnabled === true,
    nodeAttributeLayout: normalizeNodeAttributeLayout(settings.nodeAttributeLayout),
    editTreeRenderMode: normalizeTreeRenderMode(settings.editTreeRenderMode),
    playbackTreeRenderMode: normalizeTreeRenderMode(settings.playbackTreeRenderMode),
    playbackPanelLayout: normalizePlaybackPanelLayout(settings.playbackPanelLayout),
    simplifyHiddenSections: [...settings.simplifyHiddenSections],
    presetNodes: settings.presetNodes.map(clonePresetNodeSettings)
  };
}

function clonePresetNodeSettings(node: BtPresetNodeSettings): BtPresetNodeSettings {
  return {
    key: node.key,
    title: node.title,
    category: node.category,
    modelKind: node.modelKind,
    allowCustomAttributes: node.allowCustomAttributes,
    fields: node.fields.map((field) => ({ ...field }))
  };
}

function normalizeUserSettings(value: unknown): BtUserSettings {
  const input = isRecord(value) ? value : {};
  const language = input.language === "zh-CN" ? "zh-CN" : "en-US";
  const themePreset = toThemePreset(input.themePreset, input.treeBackgroundColor);
  const showMainTreeLocator = input.showMainTreeLocator === true;
  const showBehaviorTreeRoot = input.showBehaviorTreeRoot !== false;
  const requireNodeDeleteConfirmation = input.requireNodeDeleteConfirmation === true;
  const copyNodeWithDescendants = input.copyNodeWithDescendants === true;
  const playbackAutoNavigateToTree = input.playbackAutoNavigateToTree === true;
  const allowUnclosedPlaybackLog = input.allowUnclosedPlaybackLog !== false;
  const traceLearningEnabled = input.traceLearningEnabled === true;
  const nodeAttributeLayout = normalizeNodeAttributeLayout(input.nodeAttributeLayout);
  const editTreeRenderMode = normalizeTreeRenderMode(input.editTreeRenderMode);
  const playbackTreeRenderMode = normalizeTreeRenderMode(input.playbackTreeRenderMode);
  const playbackPanelLayout = normalizePlaybackPanelLayout(input.playbackPanelLayout);
  const simplifyHiddenSections = Array.isArray(input.simplifyHiddenSections)
    ? input.simplifyHiddenSections.map(normalizeSimplifySection).filter((value): value is BtSimplifySection => Boolean(value))
    : [...DEFAULT_USER_SETTINGS.simplifyHiddenSections];

  const presetNodes = Array.isArray(input.presetNodes)
    ? input.presetNodes.map(normalizePresetNode).filter((node): node is BtPresetNodeSettings => Boolean(node))
    : [];

  return {
    language,
    themePreset,
    showMainTreeLocator,
    showBehaviorTreeRoot,
    requireNodeDeleteConfirmation,
    copyNodeWithDescendants,
    playbackAutoNavigateToTree,
    allowUnclosedPlaybackLog,
    traceLearningEnabled,
    nodeAttributeLayout,
    editTreeRenderMode,
    playbackTreeRenderMode,
    playbackPanelLayout,
    simplifyHiddenSections: Array.from(new Set(simplifyHiddenSections)),
    presetNodes
  };
}

function normalizeNodeAttributeLayout(value: unknown): BtNodeAttributeLayout {
  return value === "stacked" ? "stacked" : "inline";
}

function normalizeTreeRenderMode(value: unknown): BtTreeRenderMode {
  return value === "expanded" ? "expanded" : "paged";
}

function normalizePlaybackPanelLayout(value: unknown): BtPlaybackPanelLayout {
  return value === "dashboard" ? "dashboard" : "classic";
}

function normalizeSimplifySection(value: unknown): BtSimplifySection | null {
  if (
    value === "description" ||
    value === "code" ||
    value === "inputs" ||
    value === "outputs" ||
    value === "params" ||
    value === "subtreeJump"
  ) {
    return value;
  }

  return null;
}

function normalizePresetNode(value: unknown): BtPresetNodeSettings | null {
  if (!isRecord(value) || typeof value.key !== "string" || !value.key.trim()) {
    return null;
  }

  const category = toCategory(value.category);
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : value.key.trim();
  const modelKind = typeof value.modelKind === "string" && value.modelKind.trim() ? value.modelKind.trim() : category;
  const allowCustomAttributes = value.allowCustomAttributes !== false;
  const fields = Array.isArray(value.fields)
    ? value.fields.map(normalizePresetField).filter((field): field is BtPresetFieldSettings => Boolean(field))
    : [];

  return {
    key: value.key.trim(),
    title,
    category,
    modelKind,
    allowCustomAttributes,
    fields
  };
}

function normalizePresetField(value: unknown): BtPresetFieldSettings | null {
  if (!isRecord(value) || typeof value.key !== "string" || !value.key.trim()) {
    return null;
  }

  return {
    key: value.key.trim(),
    role: toRole(value.role),
    required: value.required !== false,
    editableKey: value.editableKey === true,
    editableValue: value.editableValue !== false,
    removable: value.removable === true,
    defaultValue: typeof value.defaultValue === "string" ? value.defaultValue : ""
  };
}

function toCategory(value: unknown): BtSettingsNodeCategory {
  if (value === "Condition" || value === "Control" || value === "Decorator" || value === "SubTree") {
    return value;
  }
  return "Action";
}

function toRole(value: unknown): BtSettingsFieldRole {
  if (value === "input" || value === "output" || value === "inout") {
    return value;
  }
  return "param";
}

function toThemePreset(themePreset: unknown, legacyTreeBackgroundColor: unknown): BtThemePreset {
  if (
    themePreset === "graphite" ||
    themePreset === "ocean" ||
    themePreset === "forest" ||
    themePreset === "paper" ||
    themePreset === "sand" ||
    themePreset === "mist" ||
    themePreset === "rose"
  ) {
    return themePreset;
  }

  if (themePreset === "midnight") {
    return "midnight";
  }

  if (typeof legacyTreeBackgroundColor === "string") {
    const normalized = legacyTreeBackgroundColor.trim().toLowerCase();
    if (normalized === "#143112" || normalized === "#173318" || normalized === "#1b3315") {
      return "forest";
    }
    if (normalized === "#10243a" || normalized === "#0f2236") {
      return "ocean";
    }
    if (normalized === "#181a1f" || normalized === "#202228") {
      return "graphite";
    }
  }

  return DEFAULT_USER_SETTINGS.themePreset;
}

function isFileNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    code === "ENOENT" ||
    code === "FileNotFound" ||
    name === "EntryNotFound" ||
    message.includes("ENOENT") ||
    message.includes("FileNotFound") ||
    message.includes("EntryNotFound")
  );
}

function createPresetField(
  key: string,
  role: BtSettingsFieldRole,
  required: boolean,
  defaultValue: string
): BtPresetFieldSettings {
  return {
    key,
    role,
    required,
    editableKey: false,
    editableValue: true,
    removable: false,
    defaultValue
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
