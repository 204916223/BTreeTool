import { Buffer } from "node:buffer";
import * as vscode from "vscode";
import { isBlockingWarning } from "../core/issueRules";
import { parseBehaviorTreeDocument } from "../core/parse";
import { serializeBehaviorTreeDocument } from "../core/serialize";
import { openDocumentInEditor, showDocumentInEditor } from "./panelUtils";
import type { getPanelCopy } from "./panelCopy";

type PanelCopy = ReturnType<typeof getPanelCopy>;

export type DocumentWorkflowContext = {
  copy: PanelCopy;
  latestDocumentUri: vscode.Uri | null;
  attachDocument: (document: vscode.TextDocument) => void;
  detachDocument: () => void;
  refreshPreviewFromUri: () => Promise<void>;
  revealPanel: () => void;
  isXmlWithoutBehaviorTrees: (document: vscode.TextDocument) => boolean;
  showInvalidDocumentMessage: () => Promise<void>;
  postEditResult: (ok: boolean, message: string, dirtyState?: "dirty" | "saved") => void;
};

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

export function isXmlWithoutBehaviorTrees(document: vscode.TextDocument): boolean {
  try {
    return parseBehaviorTreeDocument(document.getText()).behaviorTrees.length === 0;
  } catch (_error) {
    return false;
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

export async function handleSaveCurrentDocumentAction(context: DocumentWorkflowContext): Promise<void> {
  const { copy } = context;
  if (!context.latestDocumentUri) {
    context.postEditResult(false, copy.noAttachedDocument);
    return;
  }

  const overwriteAction = copy.saveAction;
  const saveAsAction = copy.saveAsAction;
  const choice = await vscode.window.showWarningMessage(
    copy.saveDocumentConfirm,
    { modal: true },
    overwriteAction,
    saveAsAction
  );

  if (choice === saveAsAction) {
    await handleSaveCurrentDocumentAsAction(context);
    return;
  }

  if (choice !== overwriteAction) {
    return;
  }

  try {
    let document = await vscode.workspace.openTextDocument(context.latestDocumentUri);
    if (isDocumentSaveBlocked(document.getText())) {
      context.postEditResult(false, copy.documentSaveBlocked);
      return;
    }

    document = await normalizeDocumentBeforeSave(document, copy.xmlUpdateRejected);
    const saved = await document.save();

    if (!saved) {
      context.postEditResult(false, copy.documentSaveFailed);
      return;
    }

    await context.refreshPreviewFromUri();
    context.postEditResult(true, copy.documentSaved, "saved");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.postEditResult(false, `${copy.documentSaveFailed} ${message}`);
  }
}

export async function handleSaveCurrentDocumentAsAction(context: DocumentWorkflowContext): Promise<void> {
  const { copy } = context;
  if (!context.latestDocumentUri) {
    context.postEditResult(false, copy.noAttachedDocument);
    return;
  }

  try {
    const document = await vscode.workspace.openTextDocument(context.latestDocumentUri);
    const currentText = document.getText();
    if (isDocumentSaveBlocked(currentText)) {
      context.postEditResult(false, copy.documentSaveBlocked);
      return;
    }

    const targetUri = await vscode.window.showSaveDialog({
      title: copy.saveAsXmlTitle,
      defaultUri: context.latestDocumentUri,
      filters: {
        "BehaviorTree XML": ["xml"],
        "All Files": ["*"]
      }
    });

    if (!targetUri) {
      return;
    }

    if (targetUri.toString() === context.latestDocumentUri.toString()) {
      context.postEditResult(false, copy.saveAsSameFileBlocked);
      return;
    }

    await writeUtf8File(targetUri, normalizeBehaviorTreeXml(currentText));
    const savedDocument = await openDocumentInEditor(targetUri);
    context.attachDocument(savedDocument);
    context.revealPanel();
    context.postEditResult(true, copy.documentSaved, "saved");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.postEditResult(false, `${copy.documentSaveFailed} ${message}`);
  }
}

export async function handleCreateNewBehaviorTreeDocumentAction(context: DocumentWorkflowContext): Promise<void> {
  const { copy } = context;
  const template = createNewBehaviorTreeDocumentXml();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, "MainTree.xml") : undefined;
  const targetUri = await vscode.window.showSaveDialog({
    title: copy.newXmlNameTitle,
    defaultUri,
    filters: {
      "BehaviorTree XML": ["xml"],
      "All Files": ["*"]
    }
  });

  if (!targetUri) {
    return;
  }

  await writeUtf8File(targetUri, template);
  const document = await openDocumentInEditor(targetUri);
  context.attachDocument(document);
  context.revealPanel();
}

export async function handleOpenExistingBehaviorTreeDocumentAction(context: DocumentWorkflowContext): Promise<void> {
  const { copy } = context;
  const files = await vscode.window.showOpenDialog({
    title: copy.openExistingXmlTitle,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      "BehaviorTree XML": ["xml"],
      "All Files": ["*"]
    }
  });

  const file = files?.[0];
  if (!file) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(file);
  if (context.isXmlWithoutBehaviorTrees(document)) {
    await context.showInvalidDocumentMessage();
    context.detachDocument();
    context.revealPanel();
    return;
  }

  await showDocumentInEditor(document);
  context.attachDocument(document);
  context.revealPanel();
}

export async function revealTreeNodesModelAction(
  latestDocumentUri: vscode.Uri | null,
  copy: PanelCopy
): Promise<void> {
  if (!latestDocumentUri) {
    void vscode.window.showWarningMessage(copy.noAttachedDocumentWarning);
    return;
  }

  const document = await vscode.workspace.openTextDocument(latestDocumentUri);
  const source = document.getText();
  const modelOffset = source.indexOf("<TreeNodesModel");
  const rootOffset = source.indexOf("<root");
  const targetOffset = modelOffset >= 0 ? modelOffset : rootOffset >= 0 ? rootOffset : 0;
  const targetPosition = document.positionAt(targetOffset);

  const editor = await showDocumentInEditor(document);
  editor.selection = new vscode.Selection(targetPosition, targetPosition);
  editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
}
