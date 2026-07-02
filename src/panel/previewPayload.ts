import * as vscode from "vscode";
import { parseBehaviorTreeDocument } from "../core/parse";
import { buildPreviewDocument } from "../core/viewModel";
import { BtUserSettings, cloneUserSettings, DEFAULT_USER_SETTINGS } from "../userSettings";
import { PreviewPayload } from "./messages";

export const EMPTY_PREVIEW_PAYLOAD: PreviewPayload = {
  fileName: "No active document",
  languageId: "unknown",
  hasDocument: false,
  isDirty: false,
  preview: null,
  parseError: null,
  settings: cloneUserSettings(DEFAULT_USER_SETTINGS),
  settingsFilePath: ""
};

export function buildPreviewPayload(
  document: vscode.TextDocument | undefined,
  currentSettings: BtUserSettings,
  effectiveSettings: BtUserSettings,
  settingsFilePath: string
): PreviewPayload {
  if (!document) {
    return {
      ...EMPTY_PREVIEW_PAYLOAD,
      settings: cloneUserSettings(currentSettings),
      settingsFilePath
    };
  }

  return {
    fileName: document.fileName,
    languageId: document.languageId,
    hasDocument: true,
    isDirty: document.isDirty,
    settings: cloneUserSettings(currentSettings),
    settingsFilePath,
    ...buildPayloadState(document.getText(), effectiveSettings)
  };
}

function buildPayloadState(source: string, effectiveSettings: BtUserSettings): Pick<PreviewPayload, "preview" | "parseError"> {
  try {
    const ast = parseBehaviorTreeDocument(source, effectiveSettings);
    return {
      preview: buildPreviewDocument(ast, effectiveSettings),
      parseError: null
    };
  } catch (error) {
    return {
      preview: null,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
