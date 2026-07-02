import * as vscode from "vscode";
import { replaceDocumentText } from "./documentActions";
import type { XmlMutation } from "./editActions";
import type { getPanelCopy } from "./panelCopy";

type PanelCopy = ReturnType<typeof getPanelCopy>;

export type XmlMutationControllerContext = {
  getDocumentUri: () => vscode.Uri | null;
  getCopy: () => PanelCopy;
  refreshPreviewFromUri: () => Promise<void>;
  postEditResult: (ok: boolean, message: string, dirtyState?: "dirty" | "saved") => void;
};

export class XmlMutationController {
  private readonly undoStack: string[] = [];
  private mutationQueue: Promise<void> = Promise.resolve();
  private suppressedDocumentRefresh: { uri: string; version: number | null } | null = null;

  constructor(private readonly context: XmlMutationControllerContext) {}

  async apply(mutation: XmlMutation): Promise<void> {
    const queuedMutation = this.mutationQueue.then(() => this.applyNow(mutation));
    this.mutationQueue = queuedMutation.catch(() => undefined);
    await queuedMutation;
  }

  async undo(): Promise<void> {
    const copy = this.context.getCopy();
    const documentUri = this.context.getDocumentUri();
    if (!documentUri) {
      this.context.postEditResult(false, copy.noAttachedDocument);
      return;
    }

    const previousText = this.undoStack.pop();
    if (previousText === undefined) {
      this.context.postEditResult(false, copy.undoUnavailable);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const currentText = document.getText();
      if (previousText === currentText) {
        this.context.postEditResult(true, copy.undoApplied);
        return;
      }

      await this.replaceDocumentTextWithUndo(document, currentText, previousText, copy.xmlUpdateRejected, false);
      await this.context.refreshPreviewFromUri();
      this.context.postEditResult(true, copy.undoApplied, "dirty");
    } catch (error) {
      const latestDocumentUri = this.context.getDocumentUri();
      if (latestDocumentUri) {
        this.clearSuppressedDocumentRefresh(latestDocumentUri);
      }
      this.undoStack.push(previousText);
      const message = error instanceof Error ? error.message : String(error);
      this.context.postEditResult(false, `${copy.undoFailed} ${message}`);
    }
  }

  clearUndoStack(): void {
    this.undoStack.length = 0;
  }

  consumeSuppressedDocumentRefresh(document: vscode.TextDocument): boolean {
    const suppressed = this.suppressedDocumentRefresh;
    if (!suppressed || suppressed.uri !== document.uri.toString()) {
      return false;
    }

    if (suppressed.version !== null && suppressed.version !== document.version) {
      this.suppressedDocumentRefresh = null;
      return false;
    }

    this.suppressedDocumentRefresh = null;
    return true;
  }

  async replaceDocumentTextWithUndo(
    document: vscode.TextDocument,
    currentText: string,
    nextText: string,
    rejectedMessage: string,
    pushUndo = true
  ): Promise<boolean> {
    if (nextText === currentText) {
      return false;
    }

    this.suppressNextDocumentRefresh(document.uri);
    const applied = await replaceDocumentText(document, nextText, currentText);

    if (!applied) {
      this.clearSuppressedDocumentRefresh(document.uri);
      throw new Error(rejectedMessage);
    }

    this.pinSuppressedDocumentRefreshVersion(document);
    if (pushUndo) {
      this.pushUndoSnapshot(currentText);
    }
    return true;
  }

  private async applyNow(mutation: XmlMutation): Promise<void> {
    const documentUri = this.context.getDocumentUri();
    if (!documentUri) {
      this.context.postEditResult(false, this.context.getCopy().noAttachedDocument);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const currentText = document.getText();
      const nextXml = mutation.mutate(currentText);

      const changed = await this.replaceDocumentTextWithUndo(
        document,
        currentText,
        nextXml,
        this.context.getCopy().xmlUpdateRejected
      );
      if (!changed) {
        this.context.postEditResult(true, mutation.unchangedMessage);
        return;
      }

      await this.context.refreshPreviewFromUri();
      this.context.postEditResult(true, mutation.successMessage, "dirty");
    } catch (error) {
      const latestDocumentUri = this.context.getDocumentUri();
      if (latestDocumentUri) {
        this.clearSuppressedDocumentRefresh(latestDocumentUri);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.context.postEditResult(false, `${mutation.failurePrefix} ${message}`);
    }
  }

  private pushUndoSnapshot(source: string): void {
    this.undoStack.push(source);
    if (this.undoStack.length > 50) {
      this.undoStack.splice(0, this.undoStack.length - 50);
    }
  }

  private suppressNextDocumentRefresh(uri: vscode.Uri): void {
    this.suppressedDocumentRefresh = {
      uri: uri.toString(),
      version: null
    };
  }

  private clearSuppressedDocumentRefresh(uri: vscode.Uri): void {
    if (this.suppressedDocumentRefresh?.uri === uri.toString()) {
      this.suppressedDocumentRefresh = null;
    }
  }

  private pinSuppressedDocumentRefreshVersion(document: vscode.TextDocument): void {
    if (this.suppressedDocumentRefresh?.uri === document.uri.toString()) {
      this.suppressedDocumentRefresh.version = document.version;
    }
  }
}
