import { BtDocumentAst, BtNodeAst, BtNodeModel } from "./btAst";

export type BtNodeCategory = "Action" | "Condition" | "Control" | "Decorator" | "SubTree";
export type BtFieldRole = "input" | "output" | "inout" | "param";
export type BtFieldSource = "builtin" | "model" | "subtree" | "extra";

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

export function buildNodeCatalog(document: BtDocumentAst): BtNodeCatalog {
  const entries = [
    ...getBuiltinEntries(),
    ...document.nodeModels.map(toModelCatalogEntry),
    ...document.behaviorTrees.map((tree) => toSubTreeCatalogEntry(tree.id))
  ];

  const byTagName = new Map<string, BtNodeCatalogEntry>();
  const byId = new Map<string, BtNodeCatalogEntry>();
  const byCategory = new Map<BtNodeCategory, BtNodeCatalogEntry[]>();

  for (const entry of entries) {
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

  const actions = ["AlwaysFailure", "AlwaysSuccess", "Script", "SetBlackboard", "Sleep", "UnsetBlackboard"];
  const conditions = ["ScriptCondition"];

  return [
    ...controls.map((key) => createBuiltinEntry(key, "Control", builtinFieldsFor(key))),
    ...decorators.map((key) => createBuiltinEntry(key, "Decorator", builtinFieldsFor(key))),
    ...actions.map((key) => createBuiltinEntry(key, "Action", builtinFieldsFor(key))),
    ...conditions.map((key) => createBuiltinEntry(key, "Condition", builtinFieldsFor(key))),
    createBuiltinEntry("SubTree", "SubTree", [
      createFixedField("ID", "param", true, "builtin"),
      createFixedField("_autoremap", "param", false, "builtin")
    ])
  ];
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
  switch (key) {
    case "Parallel":
    case "ParallelAll":
      return [
        createFixedField("failure_count", "param", true, "builtin"),
        createFixedField("success_count", "param", true, "builtin")
      ];
    case "Precondition":
      return [createFixedField("if", "param", true, "builtin")];
    case "Repeat":
      return [createFixedField("num_cycles", "param", true, "builtin")];
    case "RetryUntilFailure":
    case "RetryUntilSuccessful":
      return [createFixedField("num_attempts", "param", true, "builtin")];
    case "Delay":
    case "Timeout":
    case "Sleep":
      return [createFixedField("msec", "param", true, "builtin")];
    case "Script":
    case "ScriptCondition":
      return [createFixedField("code", "param", true, "builtin")];
    case "SetBlackboard":
      return [
        createFixedField("output_key", "output", true, "builtin"),
        createFixedField("value", "input", true, "builtin")
      ];
    case "UnsetBlackboard":
      return [createFixedField("key", "param", true, "builtin")];
    case "RunOnce":
      return [createFixedField("then_skip", "param", false, "builtin")];
    default:
      return [];
  }
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
