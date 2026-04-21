import { BtDocumentAst, BtNodeAst, BtNodeModel, BtWarning } from "./btAst";
import { validateNodeSemantics } from "./issueRules";

const BUILTIN_CONTROL_NODES = new Set([
  "Sequence",
  "SequenceWithMemory",
  "ReactiveSequence",
  "Fallback",
  "ReactiveFallback",
  "Parallel",
  "IfThenElse",
  "WhileDoElse",
  "Switch"
]);

const BUILTIN_DECORATOR_NODES = new Set([
  "RetryUntilSuccessful",
  "RetryUntilFailure",
  "Repeat",
  "Inverter",
  "Precondition",
  "ForceSuccess",
  "ForceFailure",
  "Timeout",
  "Delay",
  "RunOnce",
  "KeepRunningUntilFailure"
]);

const BUILTIN_LEAF_NODES = new Set([
  "SubTree",
  "Script",
  "AlwaysSuccess",
  "AlwaysFailure",
  "SetBlackboard",
  "UnsetBlackboard",
  "Sleep"
]);

type NodeKind = "control" | "decorator" | "leaf" | "unknown";

export function validateBehaviorTreeDocument(document: BtDocumentAst): BtWarning[] {
  const warnings: BtWarning[] = [];
  const nodeModelMap = new Map(document.nodeModels.map((model) => [model.id, model]));
  const treeIds = new Set(document.behaviorTrees.map((tree) => tree.id));

  if (document.rootTagName && document.rootTagName !== "root") {
    warnings.push({
      code: "unexpected_root_tag",
      message: `Expected <root> as the document root, found <${document.rootTagName}>.`,
      severity: "warning"
    });
  }

  for (const tree of document.behaviorTrees) {
    if (!tree.node) {
      warnings.push({
        code: "empty_behavior_tree",
        message: `BehaviorTree "${tree.id}" does not contain a root node.`,
        severity: "warning"
      });
      continue;
    }

    validateNode(tree.node, {
      treeId: tree.id,
      nodeModelMap,
      treeIds,
      warnings,
      nodePath: "0"
    });
  }

  return warnings;
}

function validateNode(
  node: BtNodeAst,
  context: {
    treeId: string;
    nodeModelMap: Map<string, BtNodeModel>;
    treeIds: Set<string>;
    warnings: BtWarning[];
    nodePath: string;
  }
): void {
  const model = resolveNodeModel(node, context.nodeModelMap);
  const nodeKind = resolveNodeKind(node, model);
  const nodeLabel = getNodeLabel(node);
  const scopedNode = `"${nodeLabel}" in tree "${context.treeId}"`;

  if (nodeKind === "unknown") {
    context.warnings.push({
      code: "unknown_node_type",
      message: `Node ${scopedNode} is not a known built-in node and has no TreeNodesModel entry.`,
      severity: "warning",
      treeId: context.treeId,
      nodePath: context.nodePath
    });
  }

  if (node.tagName === "SubTree") {
    if (!node.attributes.ID) {
      context.warnings.push({
        code: "missing_subtree_target",
        message: `SubTree node ${scopedNode} is missing its ID target.`,
        severity: "warning",
        treeId: context.treeId,
        nodePath: context.nodePath
      });
    } else if (!context.treeIds.has(node.attributes.ID)) {
      context.warnings.push({
        code: "missing_subtree_definition",
        message: `SubTree node ${scopedNode} points to "${node.attributes.ID}", but that tree was not found in this document.`,
        severity: "warning",
        treeId: context.treeId,
        nodePath: context.nodePath
      });
    }
  }

  if (isExplicitSyntaxNode(node) && !node.attributes.ID) {
    context.warnings.push({
      code: "missing_explicit_node_id",
      message: `Explicit node ${scopedNode} is missing its ID attribute.`,
      severity: "warning",
      treeId: context.treeId,
      nodePath: context.nodePath
    });
  }

  if (model) {
    validateModeledAttributes(node, model, context.warnings, scopedNode, context.treeId, context.nodePath);
  }

  validateChildCount(node, nodeKind, context.warnings, scopedNode, context.treeId, context.nodePath);
  validateNodeSemantics(node, context.warnings, scopedNode, context.treeId, context.nodePath);

  for (const [index, child] of node.children.entries()) {
    validateNode(child, {
      ...context,
      nodePath: `${context.nodePath}.${index}`
    });
  }
}

function resolveNodeModel(node: BtNodeAst, nodeModelMap: Map<string, BtNodeModel>): BtNodeModel | undefined {
  return nodeModelMap.get(node.tagName) || nodeModelMap.get(node.attributes.ID || "");
}

function resolveNodeKind(node: BtNodeAst, model: BtNodeModel | undefined): NodeKind {
  if (BUILTIN_CONTROL_NODES.has(node.tagName)) {
    return "control";
  }

  if (BUILTIN_DECORATOR_NODES.has(node.tagName)) {
    return "decorator";
  }

  if (BUILTIN_LEAF_NODES.has(node.tagName)) {
    return "leaf";
  }

  if (!model) {
    return "unknown";
  }

  if (model.modelKind === "Control") {
    return "control";
  }

  if (model.modelKind === "Decorator") {
    return "decorator";
  }

  if (model.modelKind === "Action" || model.modelKind === "Condition") {
    return "leaf";
  }

  return "unknown";
}

function validateModeledAttributes(
  node: BtNodeAst,
  model: BtNodeModel,
  warnings: BtWarning[],
  scopedNode: string,
  treeId: string,
  nodePath: string
): void {
  const declared = new Set([
    "ID",
    "name",
    ...getPortNames(model, "input_port"),
    ...getPortNames(model, "output_port"),
    ...getPortNames(model, "inout_port")
  ]);

  for (const attributeName of Object.keys(node.attributes)) {
    if (!declared.has(attributeName)) {
      warnings.push({
        code: "undeclared_attribute",
        message: `Attribute "${attributeName}" on node ${scopedNode} is not declared in TreeNodesModel "${model.id}".`,
        severity: "warning",
        treeId,
        nodePath
      });
    }
  }
}

function getPortNames(
  model: BtNodeModel,
  tagName: "input_port" | "output_port" | "inout_port"
): string[] {
  return model.ports
    .filter((port) => port.tagName === tagName)
    .map((port) => port.attributes.name)
    .filter((name): name is string => Boolean(name));
}

function validateChildCount(
  node: BtNodeAst,
  nodeKind: NodeKind,
  warnings: BtWarning[],
  scopedNode: string,
  treeId: string,
  nodePath: string
): void {
  if (nodeKind === "decorator" && node.children.length !== 1) {
    warnings.push({
      code: "invalid_decorator_children",
      message: `Decorator node ${scopedNode} must have exactly 1 child, found ${node.children.length}.`,
      severity: "warning",
      treeId,
      nodePath
    });
  }

  if (nodeKind === "leaf" && node.children.length > 0) {
    warnings.push({
      code: "invalid_leaf_children",
      message: `Leaf node ${scopedNode} must not have child nodes.`,
      severity: "warning",
      treeId,
      nodePath
    });
  }

  if (nodeKind === "control" && node.children.length === 0) {
    warnings.push({
      code: "empty_control_node",
      message: `Control node ${scopedNode} should have at least 1 child.`,
      severity: "warning",
      treeId,
      nodePath
    });
  }
}
function isExplicitSyntaxNode(node: BtNodeAst): boolean {
  return node.tagName === "Action" || node.tagName === "Condition" || node.tagName === "Decorator" || node.tagName === "Control";
}

function getNodeLabel(node: BtNodeAst): string {
  return node.attributes.name || node.attributes.ID || node.tagName;
}
