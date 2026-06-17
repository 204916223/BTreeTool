import { BtDocumentAst, BtNodeAst, BtNodeModel } from "./btAst";
import { BtPresetNodeSettings, BtUserSettings } from "../userSettings";

export type BtNodeCategory = "Action" | "Condition" | "Control" | "Decorator" | "SubTree";
export type BtFieldRole = "input" | "output" | "inout" | "param";
export type BtFieldSource = "builtin" | "model" | "preset" | "subtree" | "extra";

export interface BtNodeFieldDefinition {
  key: string;
  role: BtFieldRole;
  required: boolean;
  editableKey: boolean;
  editableValue: boolean;
  removable: boolean;
  source: BtFieldSource;
}

export interface BtNodeCatalogEntry {
  key: string;
  title: string;
  category: BtNodeCategory;
  modelKind: string;
  fields: BtNodeFieldDefinition[];
  allowCustomAttributes: boolean;
}

export interface BtNodeCatalog {
  byTagName: Map<string, BtNodeCatalogEntry>;
  byId: Map<string, BtNodeCatalogEntry>;
  byCategory: Map<BtNodeCategory, BtNodeCatalogEntry[]>;
}

export function buildNodeCatalog(document: BtDocumentAst, settings?: BtUserSettings): BtNodeCatalog {
  const builtinEntries = getBuiltinEntries();
  const builtinKeys = new Set(builtinEntries.map((entry) => entry.key));
  const entries = [
    ...builtinEntries,
    ...document.nodeModels.map(toModelCatalogEntry),
    ...document.behaviorTrees.map((tree) => toSubTreeCatalogEntry(tree.id))
  ];
  const mergedEntries = settings?.presetNodes?.length
    ? applyPresetNodeOverrides(entries, settings.presetNodes, builtinKeys)
    : entries;

  const byTagName = new Map<string, BtNodeCatalogEntry>();
  const byId = new Map<string, BtNodeCatalogEntry>();
  const byCategory = new Map<BtNodeCategory, BtNodeCatalogEntry[]>();

  for (const entry of mergedEntries) {
    if (entry.category === "SubTree") {
      byId.set(entry.key, entry);
    } else {
      byTagName.set(entry.key, entry);
      byId.set(entry.key, entry);
    }

    const group = byCategory.get(entry.category) || [];
    group.push(entry);
    byCategory.set(entry.category, group);
  }

  return {
    byTagName,
    byId,
    byCategory
  };
}

export function resolveNodeCatalogEntry(node: BtNodeAst, catalog: BtNodeCatalog): BtNodeCatalogEntry | undefined {
  if (node.tagName === "SubTree") {
    return catalog.byTagName.get("SubTree");
  }

  if (!isExplicitSyntaxNode(node.tagName)) {
    return catalog.byTagName.get(node.tagName) || catalog.byId.get(node.tagName);
  }

  if (node.attributes.ID) {
    return catalog.byId.get(node.attributes.ID) || catalog.byTagName.get(node.attributes.ID);
  }

  return catalog.byTagName.get(node.tagName);
}

function toModelCatalogEntry(model: BtNodeModel): BtNodeCatalogEntry {
  return {
    key: model.id,
    title: model.id,
    category: toCategory(model.modelKind),
    modelKind: model.modelKind,
    fields: model.ports.map((port) => ({
      key: port.attributes.name,
      role: toFieldRole(port.tagName),
      required: false,
      editableKey: false,
      editableValue: true,
      removable: false,
      source: "model" as const
    })),
    allowCustomAttributes: true
  };
}

function toSubTreeCatalogEntry(treeId: string): BtNodeCatalogEntry {
  return {
    key: treeId,
    title: treeId,
    category: "SubTree",
    modelKind: "SubTree",
    fields: [
      createFixedField("ID", "param", true, "subtree"),
      createFixedField("_autoremap", "param", false, "subtree")
    ],
    allowCustomAttributes: true
  };
}

function getBuiltinEntries(): BtNodeCatalogEntry[] {
  const controls = [
    "AsyncFallback",
    "AsyncSequence",
    "Fallback",
    "IfThenElse",
    "Parallel",
    "ParallelAll",
    "ReactiveFallback",
    "ReactiveSequence",
    "Sequence",
    "SequenceWithMemory",
    "Switch",
    "Switch2",
    "Switch3",
    "Switch4",
    "Switch5",
    "Switch6",
    "TryCatch",
    "WhileDoElse"
  ];

  const decorators = [
    "Delay",
    "ForceFailure",
    "ForceSuccess",
    "Inverter",
    "KeepRunningUntilFailure",
    "LoopBool",
    "LoopDouble",
    "LoopInt",
    "LoopString",
    "Precondition",
    "Repeat",
    "RetryUntilFailure",
    "RetryUntilSuccessful",
    "RunOnce",
    "SkipUnlessUpdated",
    "Timeout",
    "WaitValueUpdate"
  ];

  const actions = ["AlwaysFailure", "AlwaysSuccess", "Script", "SetBlackboard", "Sleep", "UnsetBlackboard", "WasEntryUpdated"];
  const conditions = ["ScriptCondition"];

  const entries = [
    ...controls.map((key) => createBuiltinEntry(key, "Control", builtinFieldsFor(key))),
    ...decorators.map((key) => createBuiltinEntry(key, "Decorator", builtinFieldsFor(key))),
    ...actions.map((key) => createBuiltinEntry(key, "Action", builtinFieldsFor(key))),
    ...conditions.map((key) => createBuiltinEntry(key, "Condition", builtinFieldsFor(key))),
    createBuiltinEntry("SubTree", "SubTree", [
      createFixedField("ID", "param", true, "builtin"),
      createFixedField("_autoremap", "param", false, "builtin")
    ])
  ];

  return entries;
}

function createBuiltinEntry(
  key: string,
  category: BtNodeCategory,
  fields: BtNodeFieldDefinition[]
): BtNodeCatalogEntry {
  return {
    key,
    title: key,
    category,
    modelKind: category,
    fields,
    allowCustomAttributes: true
  };
}

function builtinFieldsFor(key: string): BtNodeFieldDefinition[] {
  const switchCaseCount = switchCaseCountFor(key);
  if (switchCaseCount > 0) {
    return [
      createFixedField("variable", "input", true, "builtin"),
      ...Array.from({ length: switchCaseCount }, (_entry, index) =>
        createFixedField(`case_${index + 1}`, "input", true, "builtin")
      )
    ];
  }

  switch (key) {
    case "Parallel":
      return [
        createFixedField("success_count", "input", false, "builtin"),
        createFixedField("failure_count", "input", false, "builtin")
      ];
    case "ParallelAll":
      return [createFixedField("max_failures", "input", false, "builtin")];
    case "TryCatch":
      return [createFixedField("catch_on_halt", "input", false, "builtin")];
    case "LoopBool":
    case "LoopDouble":
    case "LoopInt":
    case "LoopString":
      return [
        createFixedField("queue", "inout", true, "builtin"),
        createFixedField("if_empty", "input", false, "builtin"),
        createFixedField("value", "output", true, "builtin")
      ];
    case "SkipUnlessUpdated":
    case "WaitValueUpdate":
    case "WasEntryUpdated":
      return [createFixedField("entry", "input", true, "builtin")];
    case "Precondition":
      return [
        createFixedField("if", "param", true, "builtin"),
        createFixedField("else", "param", false, "builtin")
      ];
    case "Repeat":
      return [createFixedField("num_cycles", "param", true, "builtin")];
    case "RetryUntilFailure":
    case "RetryUntilSuccessful":
      return [createFixedField("num_attempts", "param", true, "builtin")];
    case "Timeout":
    case "Sleep":
      return [createFixedField("msec", "param", true, "builtin")];
    case "Delay":
      return [createFixedField("delay_msec", "input", true, "builtin")];
    case "Script":
    case "ScriptCondition":
      return [createFixedField("code", "param", true, "builtin")];
    case "SetBlackboard":
      return [
        createFixedField("value", "input", true, "builtin"),
        createFixedField("output_key", "inout", true, "builtin")
      ];
    case "UnsetBlackboard":
      return [createFixedField("key", "param", true, "builtin")];
    case "RunOnce":
      return [createFixedField("then_skip", "param", false, "builtin")];
    default:
      return [];
  }
}

function switchCaseCountFor(key: string): number {
  if (key === "Switch") {
    return 2;
  }

  const match = key.match(/^Switch([2-6])$/);
  return match ? Number(match[1]) : 0;
}

function createFixedField(
  key: string,
  role: BtFieldRole,
  required: boolean,
  source: Exclude<BtFieldSource, "extra">
): BtNodeFieldDefinition {
  return {
    key,
    role,
    required,
    editableKey: false,
    editableValue: true,
    removable: false,
    source
  };
}

function applyPresetNodeOverrides(
  builtinEntries: BtNodeCatalogEntry[],
  presetNodes: BtPresetNodeSettings[],
  builtinKeys: Set<string>
): BtNodeCatalogEntry[] {
  if (presetNodes.length === 0) {
    return builtinEntries;
  }

  const byKey = new Map(builtinEntries.map((entry) => [entry.key, entry]));

  for (const preset of presetNodes) {
    const fieldSource: BtFieldSource = builtinKeys.has(preset.key) ? "builtin" : "preset";
    byKey.set(preset.key, {
      key: preset.key,
      title: preset.title,
      category: preset.category,
      modelKind: preset.modelKind,
      allowCustomAttributes: preset.allowCustomAttributes,
      fields: preset.fields.map((field) => ({
        key: field.key,
        role: field.role,
        required: fieldSource === "builtin" ? field.required : false,
        editableKey: field.editableKey,
        editableValue: field.editableValue,
        removable: field.removable,
        source: fieldSource
      }))
    });
  }

  return Array.from(byKey.values());
}

function toCategory(modelKind: string): BtNodeCategory {
  if (modelKind === "Action") {
    return "Action";
  }

  if (modelKind === "Condition") {
    return "Condition";
  }

  if (modelKind === "Control") {
    return "Control";
  }

  if (modelKind === "Decorator") {
    return "Decorator";
  }

  return "Action";
}

function toFieldRole(tagName: "input_port" | "output_port" | "inout_port"): BtFieldRole {
  if (tagName === "input_port") {
    return "input";
  }

  if (tagName === "output_port") {
    return "output";
  }

  return "inout";
}

function isExplicitSyntaxNode(tagName: string): boolean {
  return tagName === "Action" || tagName === "Condition" || tagName === "Decorator" || tagName === "Control";
}
