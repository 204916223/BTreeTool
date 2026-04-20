export type BtWarningSeverity = "warning" | "error";

export interface BtWarning {
  code: string;
  message: string;
  severity: BtWarningSeverity;
  treeId?: string;
  nodePath?: string;
}

export interface BtXmlDeclaration {
  attributes: Record<string, string>;
}

export interface BtIncludeAst {
  attributes: Record<string, string>;
}

export interface BtPortModel {
  tagName: "input_port" | "output_port" | "inout_port";
  attributes: Record<string, string>;
}

export interface BtNodeModel {
  id: string;
  modelKind: string;
  attributes: Record<string, string>;
  ports: BtPortModel[];
}

export interface BtNodeAst {
  tagName: string;
  attributes: Record<string, string>;
  children: BtNodeAst[];
}

export interface BtBehaviorTreeAst {
  id: string;
  node: BtNodeAst | null;
}

export interface BtDocumentAst {
  xmlDeclaration: BtXmlDeclaration | null;
  rootTagName: string | null;
  rootAttributes: Record<string, string>;
  mainTreeToExecute: string | null;
  includes: BtIncludeAst[];
  behaviorTrees: BtBehaviorTreeAst[];
  nodeModels: BtNodeModel[];
  topLevelOrder: Array<"include" | "behaviorTree" | "treeNodesModel">;
  warnings: BtWarning[];
}
