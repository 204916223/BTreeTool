import { BtNodeAst } from "./btAst";
import { parseBehaviorTreeDocument } from "./parse";

export type AtlasUsageTreeNode = {
  tagName: string;
  attributes: Record<string, string>;
  description?: string;
  children: AtlasUsageTreeNode[];
};

export type AtlasUsageExample = {
  title: string;
  attributes: Record<string, string>;
};

export type AtlasUsageImportTree = {
  id: string;
  isDefault: boolean;
  occurrenceCount: number;
  tree: AtlasUsageTreeNode;
  examples: AtlasUsageExample[];
};

export type AtlasUsageImportResult = {
  nodeId: string;
  defaultTreeId: string | null;
  warnings: string[];
  trees: AtlasUsageImportTree[];
};

export function buildAtlasUsageImport(source: string, nodeId: string): AtlasUsageImportResult {
  const normalizedNodeId = String(nodeId || "").trim();
  if (!normalizedNodeId) {
    throw new Error("导入案例前必须先选择一个图鉴节点。");
  }

  const document = parseBehaviorTreeDocument(source);
  const defaultTreeId = selectDefaultTreeId(document.mainTreeToExecute, document.behaviorTrees.map((tree) => tree.id));
  const trees = document.behaviorTrees.flatMap((behaviorTree) => {
    if (!behaviorTree.node) {
      return [];
    }
    const matches = collectMatchingNodes(behaviorTree.node, normalizedNodeId);
    if (matches.length === 0) {
      return [];
    }
    return [{
      id: behaviorTree.id,
      isDefault: behaviorTree.id === defaultTreeId,
      occurrenceCount: matches.length,
      tree: toAtlasUsageTree(behaviorTree.node),
      examples: matches.map((node, index) => ({
        title: createExampleTitle(behaviorTree.id, normalizedNodeId, node, index, matches.length),
        attributes: sanitizeExampleAttributes(node.attributes)
      }))
    }];
  });

  if (document.behaviorTrees.length === 0) {
    throw new Error("XML 中没有可导入的 <BehaviorTree>。");
  }
  if (trees.length === 0) {
    throw new Error(`XML 的行为树中没有找到节点 ${normalizedNodeId}。`);
  }

  return {
    nodeId: normalizedNodeId,
    defaultTreeId,
    warnings: document.warnings.map((warning) => warning.message),
    trees
  };
}

function selectDefaultTreeId(mainTreeToExecute: string | null, treeIds: string[]): string | null {
  if (mainTreeToExecute && treeIds.includes(mainTreeToExecute)) {
    return mainTreeToExecute;
  }
  if (treeIds.includes("MainTree")) {
    return "MainTree";
  }
  return treeIds[0] || null;
}

function collectMatchingNodes(root: BtNodeAst, nodeId: string): BtNodeAst[] {
  const matches: BtNodeAst[] = [];
  visit(root);
  return matches;

  function visit(node: BtNodeAst): void {
    if (node.tagName === nodeId) {
      matches.push(node);
    }
    node.children.forEach(visit);
  }
}

function toAtlasUsageTree(node: BtNodeAst): AtlasUsageTreeNode {
  const description = String(node.attributes._description || "").trim();
  const attributes = Object.fromEntries(
    Object.entries(node.attributes).filter(([key]) => key !== "_description")
  );
  return {
    tagName: node.tagName,
    attributes,
    ...(description ? { description } : {}),
    children: node.children.map(toAtlasUsageTree)
  };
}

function sanitizeExampleAttributes(attributes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => key !== "ID" && key !== "name" && !key.startsWith("_"))
  );
}

function createExampleTitle(
  treeId: string,
  nodeId: string,
  node: BtNodeAst,
  index: number,
  total: number
): string {
  const description = String(node.attributes._description || "").trim();
  if (description) {
    return description;
  }
  return total > 1 ? `${treeId} · ${nodeId} #${index + 1}` : `${treeId} · ${nodeId}`;
}
