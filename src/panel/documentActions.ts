import { Buffer } from "node:buffer";
import * as vscode from "vscode";
import { isBlockingWarning } from "../core/issueRules";
import { parseBehaviorTreeDocument } from "../core/parse";
import { serializeBehaviorTreeDocument } from "../core/serialize";

export async function replaceDocumentText(
  document: vscode.TextDocument,
  nextText: string,
  currentText = document.getText()
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(currentText.length));
  edit.replace(document.uri, fullRange, nextText);
  return vscode.workspace.applyEdit(edit);
}

export async function normalizeDocumentBeforeSave(
  document: vscode.TextDocument,
  rejectedMessage: string
): Promise<vscode.TextDocument> {
  const currentText = document.getText();
  const nextXml = normalizeBehaviorTreeXml(currentText);

  if (nextXml === currentText) {
    return document;
  }

  const applied = await replaceDocumentText(document, nextXml, currentText);

  if (!applied) {
    throw new Error(rejectedMessage);
  }

  return vscode.workspace.openTextDocument(document.uri);
}

export function normalizeBehaviorTreeXml(source: string): string {
  const parsed = parseBehaviorTreeDocument(source);
  return serializeBehaviorTreeDocument(parsed);
}

export function isDocumentSaveBlocked(source: string): boolean {
  try {
    const parsed = parseBehaviorTreeDocument(source);
    return parsed.warnings.some(isBlockingWarning);
  } catch (_error) {
    return true;
  }
}

export function createNewBehaviorTreeDocumentXml(): string {
  return serializeBehaviorTreeDocument({
    xmlDeclaration: {
      attributes: {
        version: "1.0"
      }
    },
    rootTagName: "root",
    rootAttributes: {
      BTCPP_format: "4"
    },
    mainTreeToExecute: "MainTree",
    includes: [],
    behaviorTrees: [
      {
        id: "MainTree",
        node: {
          tagName: "AlwaysSuccess",
          attributes: {},
          children: []
        }
      }
    ],
    nodeModels: [],
    topLevelOrder: ["behaviorTree"],
    warnings: []
  });
}

export async function writeUtf8File(uri: vscode.Uri, source: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(source, "utf8"));
}
