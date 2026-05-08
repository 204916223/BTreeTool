import { BtDocumentAst, BtNodeAst, BtNodeModel, BtWarning } from "./btAst";
import {
  BtFieldRole,
  BtNodeCatalogEntry,
  BtNodeCategory,
  buildNodeCatalog,
  resolveNodeCatalogEntry
} from "./nodeCatalog";
import { isBlockingWarning } from "./issueRules";
import { BtUserSettings, cloneUserSettings } from "../userSettings";

export interface BtPreviewAttribute {
  key: string;
  value: string;
}

export interface BtPreviewInspectorField {
  key: string;
  value: string;
  role: BtFieldRole;
  editableKey: boolean;
  editableValue: boolean;
  removable: boolean;
  required: boolean;
  source: "builtin" | "model" | "subtree" | "extra";
}

export interface BtPreviewNode {
  nodePath: string;
  title: string;
  instanceName: string;
  kind: string;
  category: BtNodeCategory;
  targetTreeId: string;
  description: string;
  code: string;
  summary: string;
  attributes: Record<string, string>;
  ioGroups: {
    inputs: BtPreviewAttribute[];
    outputs: BtPreviewAttribute[];
    params: BtPreviewAttribute[];
  };
  inspectorFields: BtPreviewInspectorField[];
  editorFields: BtPreviewInspectorField[];
  modelKind: string;
  warningCount: number;
  hasError: boolean;
  warnings: BtPreviewWarning[];
  children: BtPreviewNode[];
}

export interface BtPreviewTree {
  id: string;
  node: BtPreviewNode | null;
}

export interface BtPreviewWarning extends BtWarning {}

export interface BtPreviewCatalogItem {
  key: string;
  title: string;
  category: BtNodeCategory;
  editableModelId: string | null;
  removableTreeId: string | null;
}

export interface BtPreviewCatalogGroup {
  category: BtNodeCategory;
  items: BtPreviewCatalogItem[];
}

export interface BtPreviewNodeModelPort {
  tagName: "input_port" | "output_port" | "inout_port";
  attributes: Record<string, string>;
}

export interface BtPreviewNodeModel {
  id: string;
  modelKind: string;
  attributes: Record<string, string>;
  ports: BtPreviewNodeModelPort[];
}

export interface BtPreviewDocument {
  modelCount: number;
  mainTreeToExecute: string | null;
  defaultTreeId: string | null;
  hasBlockingIssues: boolean;
  behaviorTrees: BtPreviewTree[];
  nodeModels: BtPreviewNodeModel[];
  catalog: BtPreviewCatalogGroup[];
  warnings: BtPreviewWarning[];
  settings: BtUserSettings;
}

export function buildPreviewDocument(ast: BtDocumentAst, settings?: BtUserSettings): BtPreviewDocument {
  const normalizedSettings = cloneUserSettings(
    settings || {
      language: "en-US",
      themePreset: "midnight",
      showMainTreeLocator: true,
      showBehaviorTreeRoot: true,
      simplifyHiddenSections: [],
      presetNodes: []
    }
  );
  const catalog = buildNodeCatalog(ast, normalizedSettings);
  const warningIndex = buildWarningIndex(ast.warnings);
  const behaviorTrees = ast.behaviorTrees.map((tree) => ({
    id: tree.id,
    node: tree.node ? toPreviewNode(tree.node, catalog, tree.id, "0", warningIndex) : null
  }));

  return {
    modelCount: ast.nodeModels.length,
    mainTreeToExecute: ast.mainTreeToExecute,
    defaultTreeId: selectDefaultTreeId(ast, behaviorTrees.map((tree) => tree.id)),
    hasBlockingIssues: ast.warnings.some(isBlockingWarning),
    behaviorTrees,
    nodeModels: ast.nodeModels.map(cloneNodeModel),
    catalog: buildPreviewCatalog(catalog, ast),
    warnings: ast.warnings,
    settings: normalizedSettings
  };
}

function toPreviewNode(
  node: BtNodeAst,
  catalog: ReturnType<typeof buildNodeCatalog>,
  treeId: string,
  nodePath: string,
  warningIndex: Map<string, BtPreviewWarning[]>
): BtPreviewNode {
  const entry = resolveNodeCatalogEntry(node, catalog);
  const title = getNodeTitle(node, entry);
  const ioGroups = groupAttributes(node.attributes, entry);
  const warnings = warningIndex.get(toWarningKey(treeId, nodePath)) || [];
  const blockingWarnings = warnings.filter(isBlockingWarning);

  return {
    nodePath,
    title,
    instanceName: node.attributes.name || "",
    kind: node.tagName,
    category: entry?.category || inferFallbackCategory(node),
    targetTreeId: node.tagName === "SubTree" ? node.attributes.ID || "" : "",
    description: getNodeDescription(node.attributes),
    code: getNodeCode(node.tagName, node.attributes),
    summary: getNodeSummary(node.tagName, node.attributes),
    attributes: node.attributes,
    ioGroups,
    inspectorFields: buildInspectorFields(node.attributes, entry),
    editorFields: buildEditorFields(node.attributes, entry),
    modelKind: entry?.modelKind || "",
    warningCount: blockingWarnings.length,
    hasError: blockingWarnings.length > 0,
    warnings,
    children: node.children.map((child, index) =>
      toPreviewNode(child, catalog, treeId, `${nodePath}.${index}`, warningIndex)
    )
  };
}

function buildWarningIndex(warnings: BtPreviewWarning[]): Map<string, BtPreviewWarning[]> {
  const index = new Map<string, BtPreviewWarning[]>();

  for (const warning of warnings) {
    if (!warning.treeId || !warning.nodePath) {
      continue;
    }

    const key = toWarningKey(warning.treeId, warning.nodePath);
    const list = index.get(key) || [];
    list.push(warning);
    index.set(key, list);
  }

  return index;
}

function toWarningKey(treeId: string, nodePath: string): string {
  return `${treeId}::${nodePath}`;
}

function selectDefaultTreeId(ast: BtDocumentAst, treeIds: string[]): string | null {
  if (ast.mainTreeToExecute && treeIds.includes(ast.mainTreeToExecute)) {
    return ast.mainTreeToExecute;
  }

  if (treeIds.includes("MainTree")) {
    return "MainTree";
  }

  return treeIds[0] ?? null;
}

function getNodeTitle(node: BtNodeAst, entry: BtNodeCatalogEntry | undefined): string {
  const explicitName = node.attributes.name;
  if (explicitName) {
    return explicitName;
  }

  if (node.tagName === "SubTree") {
    return node.attributes.ID || "SubTree";
  }

  if (entry?.title && entry.title !== node.tagName) {
    return entry.title;
  }

  return node.tagName;
}

function groupAttributes(
  attributes: Record<string, string>,
  entry: BtNodeCatalogEntry | undefined
): BtPreviewNode["ioGroups"] {
  const groups = {
    inputs: [] as BtPreviewAttribute[],
    outputs: [] as BtPreviewAttribute[],
    params: [] as BtPreviewAttribute[]
  };

  const roleMap = new Map((entry?.fields || []).map((field) => [field.key, field.role]));

  for (const [key, value] of Object.entries(attributes)) {
    if (key === "name" || key === "ID" || key === "_description") {
      continue;
    }

    if ((entry?.key === "Script" || entry?.key === "ScriptCondition") && key === "code") {
      continue;
    }

    const attribute = { key, value };
    const role = roleMap.get(key);

    if (role === "input") {
      groups.inputs.push(attribute);
      continue;
    }

    if (role === "output") {
      groups.outputs.push(attribute);
      continue;
    }

    if (role === "inout") {
      groups.inputs.push(attribute);
      groups.outputs.push(attribute);
      continue;
    }

    groups.params.push(attribute);
  }

  return groups;
}

function buildInspectorFields(
  attributes: Record<string, string>,
  entry: BtNodeCatalogEntry | undefined
): BtPreviewInspectorField[] {
  const fields: BtPreviewInspectorField[] = [];
  const definedKeys = new Set<string>();
  const isSubTreeReference = entry?.category === "SubTree";
  const editorOnlyKeys = new Set([
    "_description",
    "_skipIf",
    "_failureIf",
    "_while",
    "_successIf",
    "_onSuccess",
    "_onFailure",
    "_onHalted",
    "_post"
  ]);

  for (const field of entry?.fields || []) {
    if (editorOnlyKeys.has(field.key)) {
      continue;
    }
    definedKeys.add(field.key);
    fields.push({
      key: field.key,
      value: attributes[field.key] ?? "",
      role: field.role,
      editableKey: isSubTreeReference ? false : field.editableKey,
      editableValue: isSubTreeReference ? false : field.editableValue,
      removable: isSubTreeReference ? false : field.removable,
      required: field.required,
      source: field.source
    });
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (key === "name" || key === "ID" || definedKeys.has(key) || editorOnlyKeys.has(key)) {
      continue;
    }

    fields.push({
      key,
      value,
      role: "param",
      editableKey: !isSubTreeReference,
      editableValue: !isSubTreeReference,
      removable: !isSubTreeReference,
      required: false,
      source: "extra"
    });
  }

  return fields;
}

function buildEditorFields(
  attributes: Record<string, string>,
  entry: BtNodeCatalogEntry | undefined
): BtPreviewInspectorField[] {
  const fields: BtPreviewInspectorField[] = [];
  const definedKeys = new Set<string>();
  const isSubTreeReference = entry?.category === "SubTree";

  const pushField = (
    key: string,
    role: BtFieldRole,
    required: boolean,
    editableKey: boolean,
    editableValue: boolean,
    removable: boolean,
    source: BtPreviewInspectorField["source"]
  ) => {
    if (definedKeys.has(key)) {
      return;
    }

    definedKeys.add(key);
    fields.push({
      key,
      value: attributes[key] ?? "",
      role,
      editableKey: isSubTreeReference ? false : editableKey,
      editableValue: isSubTreeReference ? false : editableValue,
      removable: isSubTreeReference ? false : removable,
      required,
      source
    });
  };

  pushField("_description", "param", false, false, true, false, "extra");
  [
    "_skipIf",
    "_failureIf",
    "_while",
    "_successIf",
    "_onSuccess",
    "_onFailure",
    "_onHalted",
    "_post"
  ].forEach((key) => pushField(key, "param", false, false, true, false, "builtin"));

  for (const field of entry?.fields || []) {
    pushField(
      field.key,
      field.role,
      field.required,
      field.editableKey,
      field.editableValue,
      field.removable,
      field.source
    );
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (key === "name" || key === "ID" || definedKeys.has(key)) {
      continue;
    }

    fields.push({
      key,
      value,
      role: "param",
      editableKey: !isSubTreeReference,
      editableValue: !isSubTreeReference,
      removable: !isSubTreeReference,
      required: false,
      source: "extra"
    });
  }

  return fields;
}

function inferFallbackCategory(node: BtNodeAst): BtNodeCategory {
  if (node.tagName === "SubTree") {
    return "SubTree";
  }

  if (node.children.length > 1) {
    return "Control";
  }

  if (node.children.length === 1) {
    return "Decorator";
  }

  return "Action";
}

function buildPreviewCatalog(catalog: ReturnType<typeof buildNodeCatalog>, ast: BtDocumentAst): BtPreviewCatalogGroup[] {
  const orderedCategories: BtNodeCategory[] = ["Action", "Condition", "Control", "Decorator", "SubTree"];
  const editableModelIds = new Set(ast.nodeModels.map((model) => model.id));
  const protectedTreeId = getProtectedTreeId(ast);

  return orderedCategories
    .map((category) => ({
      category,
      items: (catalog.byCategory.get(category) || [])
        .map((entry) => ({
          key: entry.key,
          title: entry.title,
          category: entry.category,
          editableModelId: editableModelIds.has(entry.key) ? entry.key : null,
          removableTreeId: entry.category === "SubTree" && entry.key !== protectedTreeId ? entry.key : null
        }))
        .sort((left, right) => left.title.localeCompare(right.title))
    }))
    .filter((group) => group.items.length > 0);
}

function getProtectedTreeId(ast: BtDocumentAst): string | null {
  if (ast.mainTreeToExecute) {
    return ast.mainTreeToExecute;
  }

  if (ast.behaviorTrees.some((tree) => tree.id === "MainTree")) {
    return "MainTree";
  }

  return ast.behaviorTrees[0]?.id ?? null;
}

function getNodeSummary(kind: string, attributes: Record<string, string>): string {
  if (kind === "Precondition" && attributes.if) {
    return `if ${attributes.if}`;
  }

  if (kind === "RetryUntilSuccessful" && attributes.num_attempts) {
    return `attempts ${attributes.num_attempts}`;
  }

  if (kind === "Parallel") {
    const parts: string[] = [];

    if (attributes.success_count) {
      parts.push(`success ${attributes.success_count}`);
    }

    if (attributes.failure_count) {
      parts.push(`failure ${attributes.failure_count}`);
    }

    return parts.join(" • ");
  }

  if (kind === "SubTree" && attributes.ID) {
    return `jump to ${attributes.ID}`;
  }

  const preferredKeys = ["ID", "action_cmd", "message", "target_position", "result", "if"];

  for (const key of preferredKeys) {
    if (attributes[key]) {
      return `${key}: ${attributes[key]}`;
    }
  }

  return "";
}

function getNodeDescription(attributes: Record<string, string>): string {
  return attributes._description || "";
}

function cloneNodeModel(model: BtNodeModel): BtPreviewNodeModel {
  return {
    id: model.id,
    modelKind: model.modelKind,
    attributes: { ...model.attributes },
    ports: model.ports.map((port) => ({
      tagName: port.tagName,
      attributes: { ...port.attributes }
    }))
  };
}

function getNodeCode(kind: string, attributes: Record<string, string>): string {
  if ((kind === "Script" || kind === "ScriptCondition") && attributes.code) {
    return attributes.code;
  }

  return "";
}
