import { BtDocumentAst, BtIncludeAst, BtNodeAst, BtNodeModel } from "./btAst";

export function serializeBehaviorTreeDocument(document: BtDocumentAst): string {
  const lines: string[] = [];
  const rootAttributes = { ...document.rootAttributes };

  rootAttributes.BTCPP_format = rootAttributes.BTCPP_format || "4";
  if (document.mainTreeToExecute) {
    rootAttributes.main_tree_to_execute = document.mainTreeToExecute;
  }

  if (document.xmlDeclaration) {
    lines.push(serializeXmlDeclaration(document.xmlDeclaration.attributes));
  }

  lines.push(...renderOpenTag("root", rootAttributes, 0));

  const includeQueue = [...document.includes];
  const treeQueue = [...document.behaviorTrees].sort(compareById);
  const nodeModelQueue = [...document.nodeModels].sort(compareById);
  let treeNodesModelWritten = false;

  for (const item of document.topLevelOrder) {
    if (item === "include") {
      const includeNode = includeQueue.shift();
      if (includeNode) {
        lines.push(serializeInclude(includeNode, 1));
      }
    } else if (item === "behaviorTree") {
      const tree = treeQueue.shift();
      if (tree) {
        appendBehaviorTree(lines, tree, 1);
      }
    } else if (item === "treeNodesModel" && !treeNodesModelWritten) {
      if (nodeModelQueue.length > 0) {
        lines.push(...serializeTreeNodesModel(nodeModelQueue, 1));
      }
      treeNodesModelWritten = true;
    }
  }

  for (const includeNode of includeQueue) {
    lines.push(serializeInclude(includeNode, 1));
  }

  for (const tree of treeQueue) {
    appendBehaviorTree(lines, tree, 1);
  }

  if (!treeNodesModelWritten && nodeModelQueue.length > 0) {
    lines.push(...serializeTreeNodesModel(nodeModelQueue, 1));
  }

  lines.push(`</root>`);
  return `${lines.join("\n")}\n`;
}

function appendBehaviorTree(lines: string[], tree: BtDocumentAst["behaviorTrees"][number], depth: number): void {
  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }
  lines.push(...serializeBehaviorTree(tree, depth));
}

function serializeXmlDeclaration(attributes: Record<string, string>): string {
  const attributeText = formatAttributeSegments(attributes).join(" ");
  return attributeText ? `<?xml ${attributeText}?>` : "<?xml?>";
}

function serializeInclude(includeNode: BtIncludeAst, depth: number): string {
  return renderSelfClosingTag("include", includeNode.attributes, depth).join("\n");
}

function serializeBehaviorTree(tree: BtDocumentAst["behaviorTrees"][number], depth: number): string[] {
  const lines = renderOpenTag("BehaviorTree", { ID: tree.id }, depth);
  if (tree.node) {
    lines.push(...serializeNode(tree.node, depth + 1));
  }
  lines.push(`${indent(depth)}</BehaviorTree>`);
  return lines;
}

function serializeTreeNodesModel(nodeModels: BtNodeModel[], depth: number): string[] {
  const lines = renderOpenTag("TreeNodesModel", {}, depth);
  for (const nodeModel of nodeModels) {
    lines.push(...serializeNodeModel(nodeModel, depth + 1));
  }
  lines.push(`${indent(depth)}</TreeNodesModel>`);
  return lines;
}

function serializeNodeModel(nodeModel: BtNodeModel, depth: number): string[] {
  const lines = renderOpenTag(nodeModel.modelKind, nodeModel.attributes, depth);

  for (const port of nodeModel.ports) {
    lines.push(...renderSelfClosingTag(port.tagName, omitPortSerializationAttributes(port.attributes), depth + 1));
  }

  lines.push(`${indent(depth)}</${nodeModel.modelKind}>`);
  return lines;
}

function omitPortSerializationAttributes(attributes: Record<string, string>): Record<string, string> {
  const { required: _required, ...rest } = attributes;
  return rest;
}

function serializeNode(node: BtNodeAst, depth: number): string[] {
  const lines: string[] = [];
  if (node.children.length === 0) {
    lines.push(...renderSelfClosingTag(node.tagName, node.attributes, depth));
    return lines;
  }

  lines.push(...renderOpenTag(node.tagName, node.attributes, depth));
  for (const child of node.children) {
    lines.push(...serializeNode(child, depth + 1));
  }
  lines.push(`${indent(depth)}</${node.tagName}>`);
  return lines;
}

function renderOpenTag(tagName: string, attributes: Record<string, string>, depth: number): string[] {
  return renderTag(tagName, attributes, depth, ">");
}

function renderSelfClosingTag(tagName: string, attributes: Record<string, string>, depth: number): string[] {
  return renderTag(tagName, attributes, depth, " />");
}

function renderTag(tagName: string, attributes: Record<string, string>, depth: number, suffix: ">" | " />"): string[] {
  const attributeSegments = formatAttributeSegments(attributes);
  const lineIndent = indent(depth);

  if (attributeSegments.length === 0) {
    return [`${lineIndent}<${tagName}${suffix}`];
  }

  const inline = `${lineIndent}<${tagName} ${attributeSegments.join(" ")}${suffix}`;
  const shouldWrap = attributeSegments.length > 1 && inline.length > 96;

  if (!shouldWrap) {
    return [inline];
  }

  const continuationIndent = `${lineIndent}${" ".repeat(tagName.length + 2)}`;
  const lines = [`${lineIndent}<${tagName} ${attributeSegments[0]}`];

  for (const segment of attributeSegments.slice(1, -1)) {
    lines.push(`${continuationIndent}${segment}`);
  }

  lines.push(`${continuationIndent}${attributeSegments[attributeSegments.length - 1]}${suffix}`);
  return lines;
}

function formatAttributeSegments(attributes: Record<string, string>): string[] {
  return orderAttributeEntries(Object.entries(attributes)).map(
    ([key, value]) => `${key}="${escapeXml(value)}"`
  );
}

function orderAttributeEntries(entries: Array<[string, string]>): Array<[string, string]> {
  const pinned: Array<[string, string]> = [];
  const remaining: Array<[string, string]> = [];

  for (const entry of entries) {
    if (entry[0] === "ID") {
      pinned.unshift(entry);
    } else if (entry[0] === "name") {
      const hasId = pinned.some(([key]) => key === "ID");
      if (hasId) {
        pinned.push(entry);
      } else {
        pinned.unshift(entry);
      }
    } else {
      remaining.push(entry);
    }
  }

  return [...pinned, ...remaining];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll(`"`, "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  const leftKey = left.id.toLowerCase();
  const rightKey = right.id.toLowerCase();

  if (leftKey < rightKey) {
    return -1;
  }

  if (leftKey > rightKey) {
    return 1;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}
