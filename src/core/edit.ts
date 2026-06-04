import { BtDocumentAst, BtNodeAst, BtNodeModel, BtPortModel } from "./btAst";
import { BtUserSettings } from "../userSettings";

const VIRTUAL_ROOT_PATH = "__btree_root__";
const EXPLICIT_MODEL_TAGS = new Set(["Action", "Condition", "Control", "Decorator"]);
const EDITOR_ONLY_ATTRIBUTES = new Set([
  "ID",
  "name",
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

type NodeCopyTemplate = {
  tagName: string;
  attributes: Record<string, string>;
  children?: NodeCopyTemplate[];
};

export function createBehaviorTree(document: BtDocumentAst, treeId: string): void {
  const normalizedTreeId = treeId.trim();
  if (!normalizedTreeId) {
    throw new Error("BehaviorTree ID cannot be empty.");
  }

  if (document.behaviorTrees.some((tree) => tree.id === normalizedTreeId)) {
    throw new Error(`BehaviorTree "${normalizedTreeId}" already exists.`);
  }

  document.behaviorTrees.push({
    id: normalizedTreeId,
    node: {
      tagName: "AlwaysSuccess",
      attributes: {},
      children: []
    }
  });
  document.topLevelOrder.push("behaviorTree");
}

export function renameBehaviorTree(document: BtDocumentAst, oldTreeId: string, newTreeId: string): void {
  const previousTreeId = oldTreeId.trim();
  const nextTreeId = newTreeId.trim();
  if (!previousTreeId || !nextTreeId) {
    throw new Error("BehaviorTree ID cannot be empty.");
  }

  if (previousTreeId === nextTreeId) {
    return;
  }

  const tree = document.behaviorTrees.find((entry) => entry.id === previousTreeId);
  if (!tree) {
    throw new Error(`BehaviorTree "${previousTreeId}" was not found in this document.`);
  }

  if (document.behaviorTrees.some((entry) => entry.id === nextTreeId)) {
    throw new Error(`BehaviorTree "${nextTreeId}" already exists.`);
  }

  tree.id = nextTreeId;
  if (document.mainTreeToExecute === previousTreeId) {
    document.mainTreeToExecute = nextTreeId;
  }

  for (const entry of document.behaviorTrees) {
    visitNode(entry.node, (node) => {
      if (node.tagName === "SubTree" && node.attributes.ID === previousTreeId) {
        node.attributes.ID = nextTreeId;
      }
    });
  }
}

export function deleteBehaviorTree(document: BtDocumentAst, treeId: string): void {
  const normalizedTreeId = treeId.trim();
  if (!normalizedTreeId) {
    throw new Error("BehaviorTree ID cannot be empty.");
  }

  const protectedTreeId = getProtectedTreeId(document);
  if (protectedTreeId === normalizedTreeId) {
    throw new Error(`BehaviorTree "${normalizedTreeId}" is the current entry tree and cannot be removed.`);
  }

  const treeIndex = document.behaviorTrees.findIndex((tree) => tree.id === normalizedTreeId);
  if (treeIndex < 0) {
    throw new Error(`BehaviorTree "${normalizedTreeId}" was not found in this document.`);
  }

  const referencedBy = findBehaviorTreeReferences(document, normalizedTreeId);
  if (referencedBy.length > 0) {
    throw new Error(
      `BehaviorTree "${normalizedTreeId}" is referenced by: ${referencedBy.join(", ")}. Remove those SubTree nodes before deleting it.`
    );
  }

  document.behaviorTrees.splice(treeIndex, 1);
  const orderIndex = document.topLevelOrder.indexOf("behaviorTree");
  if (orderIndex >= 0) {
    document.topLevelOrder.splice(orderIndex, 1);
  }
}

export function findBehaviorTreeReferences(document: BtDocumentAst, treeId: string): string[] {
  const normalizedTreeId = treeId.trim();
  if (!normalizedTreeId) {
    return [];
  }

  const referencedBy = new Set<string>();
  for (const tree of document.behaviorTrees) {
    if (tree.id === normalizedTreeId || !tree.node) {
      continue;
    }

    if (nodeReferencesBehaviorTree(tree.node, normalizedTreeId)) {
      referencedBy.add(tree.id);
    }
  }

  return [...referencedBy].sort((left, right) => left.localeCompare(right));
}

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

  const nextNode = createNodeFromPalette(document, nodeKey, nodeCategory, settings);
  if (targetParentPath === VIRTUAL_ROOT_PATH) {
    if (tree.node) {
      nextNode.children.push(tree.node);
    }
    tree.node = nextNode;
    return "0";
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  const targetParentNode = findNodeByPath(tree.node, targetParentPath);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, targetParentNode.children.length));

  targetParentNode.children.splice(normalizedTargetIndex, 0, nextNode);
  return `${targetParentPath}.${normalizedTargetIndex}`;
}

export function insertNodeCopy(
  document: BtDocumentAst,
  treeId: string,
  targetParentPath: string,
  targetIndex: number,
  nodeTemplate: NodeCopyTemplate
): string {
  const tree = document.behaviorTrees.find((entry) => entry.id === treeId);

  if (!tree) {
    throw new Error(`BehaviorTree "${treeId}" was not found in this document.`);
  }

  if (!nodeTemplate.tagName) {
    throw new Error("The copied node is missing a node type.");
  }

  const nextNode = cloneNodeTemplate(nodeTemplate);

  if (targetParentPath === VIRTUAL_ROOT_PATH) {
    if (tree.node) {
      throw new Error(`BehaviorTree "${treeId}" already has a root node.`);
    }
    tree.node = nextNode;
    return "0";
  }

  if (!tree.node) {
    throw new Error(`BehaviorTree "${treeId}" does not contain a root node.`);
  }

  const targetParentNode = findNodeByPath(tree.node, targetParentPath);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, targetParentNode.children.length));

  targetParentNode.children.splice(normalizedTargetIndex, 0, nextNode);
  return `${targetParentPath}.${normalizedTargetIndex}`;
}

function cloneNodeTemplate(nodeTemplate: NodeCopyTemplate): BtNodeAst {
  return {
    tagName: nodeTemplate.tagName,
    attributes: { ...nodeTemplate.attributes },
    children: Array.isArray(nodeTemplate.children)
      ? nodeTemplate.children
          .filter((child): child is NodeCopyTemplate => Boolean(child?.tagName && child.attributes))
          .map(cloneNodeTemplate)
      : []
  };
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
    tree.node = null;
    return VIRTUAL_ROOT_PATH;
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
  const previousModels = new Map(document.nodeModels.map((model) => [model.id, model]));
  const clonedNodeModels = nextNodeModels.map(cloneNodeModel);

  removeDeletedModelPorts(document, previousModels, clonedNodeModels);
  document.nodeModels = clonedNodeModels;

  if (document.nodeModels.length > 0) {
    if (!document.topLevelOrder.includes("treeNodesModel")) {
      document.topLevelOrder.push("treeNodesModel");
    }
    return;
  }

  document.topLevelOrder = document.topLevelOrder.filter((item) => item !== "treeNodesModel");
}

function removeDeletedModelPorts(
  document: BtDocumentAst,
  previousModels: Map<string, BtNodeModel>,
  nextNodeModels: BtNodeModel[]
): void {
  for (const nextModel of nextNodeModels) {
    const previousModel = previousModels.get(nextModel.id);
    if (!previousModel) {
      continue;
    }

    const nextPortNames = new Set(nextModel.ports.map(getPortName).filter(Boolean));
    const deletedPortNames = previousModel.ports
      .map(getPortName)
      .filter((name): name is string => Boolean(name) && !EDITOR_ONLY_ATTRIBUTES.has(name) && !nextPortNames.has(name));

    if (deletedPortNames.length === 0) {
      continue;
    }

    removeAttributesFromModelInstances(document, nextModel.id, new Set(deletedPortNames));
  }
}

function getPortName(port: BtPortModel): string {
  return port.attributes.name || "";
}

function removeAttributesFromModelInstances(document: BtDocumentAst, modelId: string, attributeNames: Set<string>): void {
  for (const tree of document.behaviorTrees) {
    visitNode(tree.node, (node) => {
      if (!isNodeInstanceOfModel(node, modelId)) {
        return;
      }

      for (const attributeName of attributeNames) {
        delete node.attributes[attributeName];
      }
    });
  }
}

function isNodeInstanceOfModel(node: BtNodeAst, modelId: string): boolean {
  if (EXPLICIT_MODEL_TAGS.has(node.tagName)) {
    return node.attributes.ID === modelId;
  }

  return node.tagName === modelId;
}

function visitNode(node: BtNodeAst | null, visitor: (node: BtNodeAst) => void): void {
  if (!node) {
    return;
  }

  visitor(node);
  node.children.forEach((child) => visitNode(child, visitor));
}

function nodeReferencesBehaviorTree(node: BtNodeAst, treeId: string): boolean {
  if (node.tagName === "SubTree" && node.attributes.ID === treeId) {
    return true;
  }

  return node.children.some((child) => nodeReferencesBehaviorTree(child, treeId));
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
  const switchCaseCount = switchCaseCountFor(nodeKey);
  if (switchCaseCount > 0) {
    return {
      variable: "",
      ...Object.fromEntries(Array.from({ length: switchCaseCount }, (_entry, index) => [`case_${index + 1}`, ""]))
    };
  }

  switch (nodeKey) {
    case "Parallel":
      return {
        success_count: "-1",
        failure_count: "1"
      };
    case "ParallelAll":
      return {
        max_failures: "1"
      };
    case "TryCatch":
      return {
        catch_on_halt: "false"
      };
    case "LoopBool":
    case "LoopDouble":
    case "LoopInt":
    case "LoopString":
      return {
        queue: "",
        if_empty: "SUCCESS",
        value: ""
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
    case "Timeout":
    case "Sleep":
      return {
        msec: "0"
      };
    case "Delay":
      return {
        delay_msec: "0"
      };
    case "Script":
    case "ScriptCondition":
      return {
        code: ""
      };
    case "SetBlackboard":
      return {
        value: "",
        output_key: ""
      };
    case "WasEntryUpdated":
    case "SkipUnlessUpdated":
    case "WaitValueUpdate":
      return {
        entry: ""
      };
    case "RunOnce":
      return {
        then_skip: "true"
      };
    case "Precondition":
      return {
        if: "",
        else: "FAILURE"
      };
    default:
      return {};
  }
}

function switchCaseCountFor(nodeKey: string): number {
  if (nodeKey === "Switch") {
    return 2;
  }

  const match = nodeKey.match(/^Switch([2-6])$/);
  return match ? Number(match[1]) : 0;
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

function getProtectedTreeId(document: BtDocumentAst): string | null {
  if (document.mainTreeToExecute) {
    return document.mainTreeToExecute;
  }

  if (document.behaviorTrees.some((tree) => tree.id === "MainTree")) {
    return "MainTree";
  }

  return document.behaviorTrees[0]?.id ?? null;
}
