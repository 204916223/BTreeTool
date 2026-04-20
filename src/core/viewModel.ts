import { BtDocumentAst, BtNodeAst, BtWarning } from "./btAst";
import {
  BtFieldRole,
  BtNodeCatalogEntry,
  BtNodeCategory,
  buildNodeCatalog,
  resolveNodeCatalogEntry
} from "./nodeCatalog";

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
  modelKind: string;
  warningCount: number;
  hasError: boolean;
  warnings: BtPreviewWarning[];
  children: BtPreviewNode[];
}

export interface BtPreviewTree {
  id: string;
  node: BtPreviewNode;
}

export interface BtPreviewWarning extends BtWarning {}

export interface BtPreviewCatalogItem {
  key: string;
  title: string;
  category: BtNodeCategory;
}

export interface BtPreviewCatalogGroup {
  category: BtNodeCategory;
  items: BtPreviewCatalogItem[];
}

export interface BtPreviewDocument {
  modelCount: number;
  mainTreeToExecute: string | null;
  defaultTreeId: string | null;
  behaviorTrees: BtPreviewTree[];
  catalog: BtPreviewCatalogGroup[];
  warnings: BtPreviewWarning[];
}

export function buildPreviewDocument(ast: BtDocumentAst): BtPreviewDocument {
  const catalog = buildNodeCatalog(ast);
  const warningIndex = buildWarningIndex(ast.warnings);
  const behaviorTrees = ast.behaviorTrees
    .filter((tree): tree is { id: string; node: BtNodeAst } => tree.node !== null)
    .map((tree) => ({
      id: tree.id,
      node: toPreviewNode(tree.node, catalog, tree.id, "0", warningIndex)
    }));

  return {
    modelCount: ast.nodeModels.length,
    mainTreeToExecute: ast.mainTreeToExecute,
    defaultTreeId: selectDefaultTreeId(ast, behaviorTrees.map((tree) => tree.id)),
    behaviorTrees,
    catalog: buildPreviewCatalog(catalog),
    warnings: ast.warnings
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

  return {
    nodePath,
    title,
    kind: node.tagName,
    category: entry?.category || inferFallbackCategory(node),
    targetTreeId: node.tagName === "SubTree" ? node.attributes.ID || "" : "",
    description: getNodeDescription(node.attributes),
    code: getNodeCode(node.tagName, node.attributes),
    summary: getNodeSummary(node.tagName, node.attributes),
    attributes: node.attributes,
    ioGroups,
    inspectorFields: buildInspectorFields(node.attributes, entry),
    modelKind: entry?.modelKind || "",
    warningCount: warnings.length,
    hasError: warnings.some((warning) => warning.severity === "error"),
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

  fields.push({
    key: "_description",
    value: attributes._description ?? "",
    role: "param",
    editableKey: false,
    editableValue: !isSubTreeReference,
    removable: false,
    required: false,
    source: "extra"
  });
  definedKeys.add("_description");

  for (const field of entry?.fields || []) {
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

function buildPreviewCatalog(catalog: ReturnType<typeof buildNodeCatalog>): BtPreviewCatalogGroup[] {
  const orderedCategories: BtNodeCategory[] = ["Action", "Condition", "Control", "Decorator", "SubTree"];

  return orderedCategories
    .map((category) => ({
      category,
      items: (catalog.byCategory.get(category) || [])
        .map((entry) => ({
          key: entry.key,
          title: entry.title,
          category: entry.category
        }))
        .sort((left, right) => left.title.localeCompare(right.title))
    }))
    .filter((group) => group.items.length > 0);
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

function getNodeCode(kind: string, attributes: Record<string, string>): string {
  if ((kind === "Script" || kind === "ScriptCondition") && attributes.code) {
    return attributes.code;
  }

  return "";
}
