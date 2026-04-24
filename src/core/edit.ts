import { BtDocumentAst, BtNodeAst, BtNodeModel, BtPortModel } from "./btAst";
import { BtUserSettings } from "../userSettings";

export function replaceNodeAttributes(
  document: BtDocumentAst,
  treeId: string,
  nodePath: string,
  nextAttributes: Record<string, string>
): void {
  const tree = document.behaviorTrees.find((entry) => entry.id === treeId);

  if (!tree) {
    throw new Error(`BehaviorTree "${treeId}" was not found in this document.`);
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  const node = findNodeByPath(tree.node, nodePath);
  node.attributes = mergeAttributesPreservingOrder(node.attributes, nextAttributes);
}

export function moveNode(
  document: BtDocumentAst,
  treeId: string,
  sourceNodePath: string,
  targetParentPath: string,
  targetIndex: number
): string {
  const tree = document.behaviorTrees.find((entry) => entry.id === treeId);

  if (!tree) {
    throw new Error(`BehaviorTree "${treeId}" was not found in this document.`);
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  if (sourceNodePath === "0") {
    throw new Error("The root node cannot be reordered.");
  }

  if (targetParentPath === sourceNodePath || targetParentPath.startsWith(`${sourceNodePath}.`)) {
    throw new Error("A node cannot be moved into its own subtree.");
  }

  const parts = sourceNodePath.split(".");
  const sourceIndex = Number(parts[parts.length - 1]);
  const sourceParentPath = parts.slice(0, -1).join(".");
  const sourceParentNode = findNodeByPath(tree.node, sourceParentPath);
  const targetParentNode = findNodeByPath(tree.node, targetParentPath);

  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceParentNode.children.length) {
    throw new Error(`Node path "${sourceNodePath}" does not exist in the selected tree.`);
  }

  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, targetParentNode.children.length));
  if (sourceParentPath === targetParentPath && normalizedTargetIndex === sourceIndex) {
    return sourceNodePath;
  }

  const [node] = sourceParentNode.children.splice(sourceIndex, 1);
  const adjustedTargetIndex =
    sourceParentPath === targetParentPath && normalizedTargetIndex > sourceIndex
      ? normalizedTargetIndex - 1
      : normalizedTargetIndex;

  targetParentNode.children.splice(adjustedTargetIndex, 0, node);
  return `${targetParentPath}.${adjustedTargetIndex}`;
}

export function insertNode(
  document: BtDocumentAst,
  treeId: string,
  targetParentPath: string,
  targetIndex: number,
  nodeKey: string,
  nodeCategory: string,
  settings?: BtUserSettings
): string {
  const tree = document.behaviorTrees.find((entry) => entry.id === treeId);

  if (!tree) {
    throw new Error(`BehaviorTree "${treeId}" was not found in this document.`);
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  const targetParentNode = findNodeByPath(tree.node, targetParentPath);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, targetParentNode.children.length));
  const nextNode = createNodeFromPalette(document, nodeKey, nodeCategory, settings);

  targetParentNode.children.splice(normalizedTargetIndex, 0, nextNode);
  return `${targetParentPath}.${normalizedTargetIndex}`;
}

export function insertNodeCopy(
  document: BtDocumentAst,
  treeId: string,
  targetParentPath: string,
  targetIndex: number,
  nodeTemplate: { tagName: string; attributes: Record<string, string> }
): string {
  const tree = document.behaviorTrees.find((entry) => entry.id === treeId);

  if (!tree) {
    throw new Error(`BehaviorTree "${treeId}" was not found in this document.`);
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  if (!nodeTemplate.tagName) {
    throw new Error("The copied node is missing a node type.");
  }

  const targetParentNode = findNodeByPath(tree.node, targetParentPath);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, targetParentNode.children.length));
  const nextNode: BtNodeAst = {
    tagName: nodeTemplate.tagName,
    attributes: { ...nodeTemplate.attributes },
    children: []
  };

  targetParentNode.children.splice(normalizedTargetIndex, 0, nextNode);
  return `${targetParentPath}.${normalizedTargetIndex}`;
}

export function deleteNode(document: BtDocumentAst, treeId: string, nodePath: string): string {
  const tree = document.behaviorTrees.find((entry) => entry.id === treeId);

  if (!tree) {
    throw new Error(`BehaviorTree "${treeId}" was not found in this document.`);
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  if (nodePath === "0") {
    throw new Error("The root node cannot be deleted.");
  }

  const parts = nodePath.split(".");
  const sourceIndex = Number(parts[parts.length - 1]);
  const parentPath = parts.slice(0, -1).join(".");
  const parentNode = findNodeByPath(tree.node, parentPath);

  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= parentNode.children.length) {
    throw new Error(`Node path "${nodePath}" does not exist in the selected tree.`);
  }

  parentNode.children.splice(sourceIndex, 1);
  return parentPath;
}

export function replaceNodeModels(document: BtDocumentAst, nextNodeModels: BtNodeModel[]): void {
  document.nodeModels = nextNodeModels.map(cloneNodeModel);

  if (document.nodeModels.length > 0) {
    if (!document.topLevelOrder.includes("treeNodesModel")) {
      document.topLevelOrder.push("treeNodesModel");
    }
    return;
  }

  document.topLevelOrder = document.topLevelOrder.filter((item) => item !== "treeNodesModel");
}

function findNodeByPath(rootNode: BtNodeAst, nodePath: string): BtNodeAst {
  const parts = nodePath.split(".");

  if (parts.length === 0 || parts[0] !== "0") {
    throw new Error(`Invalid node path "${nodePath}".`);
  }

  let currentNode = rootNode;

  for (const part of parts.slice(1)) {
    const index = Number(part);

    if (!Number.isInteger(index) || index < 0 || index >= currentNode.children.length) {
      throw new Error(`Node path "${nodePath}" does not exist in the selected tree.`);
    }

    currentNode = currentNode.children[index];
  }

  return currentNode;
}

function mergeAttributesPreservingOrder(
  existingAttributes: Record<string, string>,
  nextAttributes: Record<string, string>
): Record<string, string> {
  const mergedEntries: Array<[string, string]> = [];

  for (const key of Object.keys(existingAttributes)) {
    if (Object.prototype.hasOwnProperty.call(nextAttributes, key)) {
      mergedEntries.push([key, nextAttributes[key]]);
    }
  }

  for (const [key, value] of Object.entries(nextAttributes)) {
    if (!Object.prototype.hasOwnProperty.call(existingAttributes, key)) {
      mergedEntries.push([key, value]);
    }
  }

  return Object.fromEntries(mergedEntries);
}

function createNodeFromPalette(
  document: BtDocumentAst,
  nodeKey: string,
  nodeCategory: string,
  settings?: BtUserSettings
): BtNodeAst {
  if (nodeCategory === "SubTree") {
    return {
      tagName: "SubTree",
      attributes: {
        ID: nodeKey,
        _autoremap: "true"
      },
      children: []
    };
  }

  return {
    tagName: nodeKey,
    attributes: defaultAttributesFor(document, nodeKey, settings),
    children: []
  };
}

function defaultAttributesFor(document: BtDocumentAst, nodeKey: string, settings?: BtUserSettings): Record<string, string> {
  return {
    ...defaultAttributesFromBuiltin(nodeKey),
    ...defaultAttributesFromModel(document, nodeKey),
    ...defaultAttributesFromPreset(settings, nodeKey)
  };
}

function defaultAttributesFromBuiltin(nodeKey: string): Record<string, string> {
  switch (nodeKey) {
    case "Parallel":
    case "ParallelAll":
      return {
        failure_count: "1",
        success_count: "1"
      };
    case "Repeat":
      return {
        num_cycles: "1"
      };
    case "RetryUntilFailure":
    case "RetryUntilSuccessful":
      return {
        num_attempts: "1"
      };
    case "Delay":
    case "Timeout":
    case "Sleep":
      return {
        msec: "0"
      };
    case "Script":
    case "ScriptCondition":
      return {
        code: ""
      };
    case "RunOnce":
      return {
        then_skip: "false"
      };
    case "Precondition":
      return {
        if: "",
        else: ""
      };
    default:
      return {};
  }
}

function defaultAttributesFromModel(document: BtDocumentAst, nodeKey: string): Record<string, string> {
  const model = document.nodeModels.find((entry) => entry.id === nodeKey);
  if (!model) {
    return {};
  }

  const defaults: Record<string, string> = {};

  model.ports.forEach((port) => {
    const name = port.attributes.name;
    if (!name) {
      return;
    }

    if (typeof port.attributes.default === "string") {
      defaults[name] = port.attributes.default;
      return;
    }

    defaults[name] = "";
  });

  return defaults;
}

function defaultAttributesFromPreset(settings: BtUserSettings | undefined, nodeKey: string): Record<string, string> {
  const preset = settings?.presetNodes.find((entry) => entry.key === nodeKey);
  if (!preset) {
    return {};
  }

  const defaults: Record<string, string> = {};
  preset.fields.forEach((field) => {
    defaults[field.key] = field.defaultValue ?? "";
  });
  return defaults;
}

function cloneNodeModel(model: BtNodeModel): BtNodeModel {
  const attributes: Record<string, string> = { ID: model.id };
  for (const [key, value] of Object.entries(model.attributes)) {
    if (!key || key === "ID") {
      continue;
    }
    attributes[key] = value;
  }

  return {
    id: model.id,
    modelKind: model.modelKind,
    attributes,
    ports: model.ports.map(clonePortModel)
  };
}

function clonePortModel(port: BtPortModel): BtPortModel {
  const name = port.attributes.name || "";
  const attributes: Record<string, string> = { name };
  for (const [key, value] of Object.entries(port.attributes)) {
    if (!key || key === "name") {
      continue;
    }
    attributes[key] = value;
  }

  return {
    tagName: port.tagName,
    attributes
  };
}
