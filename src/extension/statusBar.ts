import * as vscode from "vscode";

export type PreviewStatusBarController = {
  item: vscode.StatusBarItem;
  update: (editor: vscode.TextEditor | undefined) => void;
};

export function createPreviewStatusBarController(
  isBehaviorTreeDocument: (document: vscode.TextDocument | undefined) => boolean
): PreviewStatusBarController {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "btreeTool.openPreview";
  item.name = "BTreeTool Preview";
  item.text = "$(preview) Visualize BT";

  return {
    item,
    update(editor) {
      item.tooltip = isBehaviorTreeDocument(editor?.document)
        ? "Open the BTreeTool visualization for the current XML file"
        : "Open BTreeTool. Open an XML file for editing, or import a playback log.";
      item.show();
    }
  };
}
