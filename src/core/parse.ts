import {
  BtBehaviorTreeAst,
  BtDocumentAst,
  BtIncludeAst,
  BtNodeAst,
  BtNodeModel,
  BtXmlDeclaration,
  BtWarning
} from "./btAst";
import { ensureInferredNodeModels } from "./modelInference";
import { validateBehaviorTreeDocument } from "./validate";
import { decodeXmlEntities } from "./xmlEntities";
import type { BtUserSettings } from "../userSettings";

type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
};

export function parseBehaviorTreeDocument(source: string, settings?: BtUserSettings): BtDocumentAst {
  const warnings: BtWarning[] = [];
  if (!source.trim()) {
    warnings.push({
      code: "empty_document",
      message: "This XML file is empty.",
      severity: "error"
    });
  }

  const { root: xmlRoot, xmlDeclaration } = parseXml(source);

  const rootTagName = xmlRoot?.name ?? null;
  const rootAttributes = { ...(xmlRoot?.attributes ?? {}) };
  const mainTreeToExecute = rootAttributes.main_tree_to_execute ?? null;
  const includes = collectIncludes(xmlRoot);
  const behaviorTrees = collectBehaviorTrees(xmlRoot, warnings);
  const nodeModels = collectNodeModels(xmlRoot, warnings);
  const topLevelOrder = collectTopLevelOrder(xmlRoot);

  const ids = new Set<string>();
  for (const tree of behaviorTrees) {
    if (ids.has(tree.id)) {
      warnings.push({
        code: "duplicate_tree_id",
        message: `BehaviorTree ID "${tree.id}" is duplicated. The preview will keep both entries.`,
        severity: "warning"
      });
    }
    ids.add(tree.id);
  }

  if (mainTreeToExecute && !behaviorTrees.some((tree) => tree.id === mainTreeToExecute)) {
    warnings.push({
      code: "missing_main_tree_target",
      message: `main_tree_to_execute points to "${mainTreeToExecute}", but that tree was not found in this file.`,
      severity: "warning"
    });
  }

  if (!mainTreeToExecute && behaviorTrees.length > 0) {
    warnings.push({
      code: "missing_main_tree",
      message: "The <root> element does not declare main_tree_to_execute. The preview will fall back to MainTree or the first tree.",
      severity: "warning"
    });
  }

  const document: BtDocumentAst = {
    xmlDeclaration,
    rootTagName,
    rootAttributes,
    mainTreeToExecute,
    includes,
    behaviorTrees,
    nodeModels,
    topLevelOrder,
    warnings
  };

  ensureInferredNodeModels(document, settings);
  document.warnings.push(...validateBehaviorTreeDocument(document));

  return document;
}

function parseXml(source: string): { root: XmlElement | null; xmlDeclaration: BtXmlDeclaration | null } {
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let xmlDeclaration: BtXmlDeclaration | null = null;
  let index = 0;

  while (index < source.length) {
    const nextLt = source.indexOf("<", index);
    if (nextLt === -1) {
      break;
    }

    index = nextLt;

    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end === -1) {
        throw new Error("Unterminated XML comment.");
      }
      index = end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index + 9);
      if (end === -1) {
        throw new Error("Unterminated CDATA block.");
      }
      index = end + 3;
      continue;
    }

    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      if (end === -1) {
        throw new Error("Unterminated XML declaration.");
      }
      if (!xmlDeclaration) {
        xmlDeclaration = parseXmlDeclaration(source.slice(index + 2, end).trim());
      }
      index = end + 2;
      continue;
    }

    if (source.startsWith("<!", index)) {
      const end = findTagEnd(source, index + 1);
      index = end + 1;
      continue;
    }

    const tagEnd = findTagEnd(source, index + 1);
    const rawTag = source.slice(index + 1, tagEnd).trim();

    if (rawTag.startsWith("/")) {
      const closingName = rawTag.slice(1).trim();
      const openElement = stack.pop();

      if (!openElement) {
        throw new Error(`Unexpected closing tag </${closingName}>.`);
      }

      if (openElement.name !== closingName) {
        throw new Error(`Closing tag </${closingName}> does not match <${openElement.name}>.`);
      }

      index = tagEnd + 1;
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const normalizedTag = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const element = parseElement(normalizedTag);

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(element);
    } else if (!root) {
      root = element;
    } else {
      throw new Error(`Multiple top-level elements found: <${root.name}> and <${element.name}>.`);
    }

    if (!selfClosing) {
      stack.push(element);
    }

    index = tagEnd + 1;
  }

  if (stack.length > 0) {
    const openElement = stack[stack.length - 1];
    throw new Error(`Unclosed tag <${openElement.name}>.`);
  }

  return { root, xmlDeclaration };
}

function parseElement(tagSource: string): XmlElement {
  let cursor = 0;
  skipWhitespace();
  const name = readName();

  if (!name) {
    throw new Error(`Invalid XML tag: <${tagSource}>.`);
  }

  const attributes: Record<string, string> = {};

  while (cursor < tagSource.length) {
    skipWhitespace();
    if (cursor >= tagSource.length) {
      break;
    }

    const attributeName = readName();
    if (!attributeName) {
      throw new Error(`Invalid XML attribute in <${name}>.`);
    }

    skipWhitespace();
    let attributeValue = "";

    if (tagSource[cursor] === "=") {
      cursor += 1;
      skipWhitespace();
      attributeValue = readAttributeValue();
    }

    attributes[attributeName] = attributeValue;
  }

  return {
    name,
    attributes,
    children: []
  };

  function skipWhitespace(): void {
    while (cursor < tagSource.length && /\s/.test(tagSource[cursor])) {
      cursor += 1;
    }
  }

  function readName(): string {
    const start = cursor;
    while (cursor < tagSource.length && !/[\s=]/.test(tagSource[cursor])) {
      cursor += 1;
    }
    return tagSource.slice(start, cursor);
  }

  function readAttributeValue(): string {
    const quote = tagSource[cursor];
    if (quote === `"` || quote === `'`) {
      cursor += 1;
      const start = cursor;
      while (cursor < tagSource.length && tagSource[cursor] !== quote) {
        cursor += 1;
      }
      if (cursor >= tagSource.length) {
        throw new Error(`Unterminated attribute value in <${name}>.`);
      }
      const value = tagSource.slice(start, cursor);
      cursor += 1;
      return decodeXmlEntities(value);
    }

    const start = cursor;
    while (cursor < tagSource.length && !/\s/.test(tagSource[cursor])) {
      cursor += 1;
    }
    return decodeXmlEntities(tagSource.slice(start, cursor));
  }
}

function parseXmlDeclaration(source: string): BtXmlDeclaration | null {
  if (!source.startsWith("xml")) {
    return null;
  }

  const declarationSource = source.slice(3).trim();
  if (!declarationSource) {
    return { attributes: {} };
  }

  const declarationElement = parseElement(`xml ${declarationSource}`);
  return {
    attributes: declarationElement.attributes
  };
}

function collectIncludes(root: XmlElement | null): BtIncludeAst[] {
  if (!root || root.name !== "root") {
    return [];
  }

  return root.children
    .filter((child) => child.name === "include")
    .map((child) => ({
      attributes: { ...child.attributes }
    }));
}

function collectTopLevelOrder(root: XmlElement | null): Array<"include" | "behaviorTree" | "treeNodesModel"> {
  if (!root || root.name !== "root") {
    return [];
  }

  const order: Array<"include" | "behaviorTree" | "treeNodesModel"> = [];

  for (const child of root.children) {
    if (child.name === "include") {
      order.push("include");
    } else if (child.name === "BehaviorTree") {
      order.push("behaviorTree");
    } else if (child.name === "TreeNodesModel") {
      order.push("treeNodesModel");
    }
  }

  return order;
}

function collectBehaviorTrees(root: XmlElement | null, warnings: BtWarning[]): BtBehaviorTreeAst[] {
  if (!root) {
    return [];
  }

  const behaviorTreeElements = root.name === "root"
    ? root.children.filter((child) => child.name === "BehaviorTree")
    : findDescendants(root, "BehaviorTree");

  return behaviorTreeElements
    .map((element, index) => {
      const treeId = element.attributes.ID || `BehaviorTree_${index + 1}`;
      if (!element.attributes.ID) {
        warnings.push({
          code: "missing_tree_id",
          message: `A <BehaviorTree> block is missing its ID. The preview assigned "${treeId}".`,
          severity: "warning"
        });
      }

      if (element.children.length > 1) {
        warnings.push({
          code: "multiple_root_nodes",
          message: `BehaviorTree "${treeId}" contains ${element.children.length} root nodes. The preview will use the first one.`,
          severity: "warning"
        });
      }

      return {
        id: treeId,
        node: element.children[0] ? toBtNode(element.children[0]) : null
      };
    });
}

function collectNodeModels(root: XmlElement | null, warnings: BtWarning[]): BtNodeModel[] {
  if (!root) {
    return [];
  }

  const modelContainer = root.name === "TreeNodesModel"
    ? root
    : root.name === "root"
      ? root.children.find((child) => child.name === "TreeNodesModel") ?? null
      : findDescendants(root, "TreeNodesModel")[0] ?? null;

  if (!modelContainer) {
    return [];
  }

  const nodeModels: BtNodeModel[] = [];

  for (const modelElement of modelContainer.children) {
    const id = modelElement.attributes.ID;
    if (!id) {
      warnings.push({
        code: "missing_model_id",
        message: `A <${modelElement.name}> model inside <TreeNodesModel> is missing its ID and was ignored.`,
        severity: "warning"
      });
      continue;
    }

    const nodeModel: BtNodeModel = {
      id,
      modelKind: modelElement.name,
      attributes: { ...modelElement.attributes },
      ports: []
    };

    for (const child of modelElement.children) {
      const portName = child.attributes.name;
      if (!portName) {
        continue;
      }

      if (child.name === "input_port" || child.name === "output_port" || child.name === "inout_port") {
        nodeModel.ports.push({
          tagName: child.name,
          attributes: { ...child.attributes }
        });
      }
    }

    nodeModels.push(nodeModel);
  }

  return nodeModels;
}

function toBtNode(element: XmlElement): BtNodeAst {
  return {
    tagName: element.name,
    attributes: { ...element.attributes },
    children: element.children.map(toBtNode)
  };
}

function findDescendants(root: XmlElement, tagName: string): XmlElement[] {
  const matches: XmlElement[] = [];

  for (const child of root.children) {
    if (child.name === tagName) {
      matches.push(child);
    }

    matches.push(...findDescendants(child, tagName));
  }

  return matches;
}

function findTagEnd(source: string, start: number): number {
  let quote: `"` | `'` | null = null;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === `"` || char === `'`) {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  throw new Error("Unterminated XML tag.");
}
