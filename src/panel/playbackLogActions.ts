import * as vscode from "vscode";
import { BtPlaybackLog, decodeBtlogFile } from "../core/btlog";
import { BtUserSettings } from "../userSettings";

export type ChoosePlaybackLogResult =
  | { canceled: true }
  | { canceled: false; playbackLog: BtPlaybackLog }
  | { canceled: false; error: string };

export async function choosePlaybackLogFile(
  title: string,
  currentSettings: BtUserSettings
): Promise<ChoosePlaybackLogResult> {
  const files = await vscode.window.showOpenDialog({
    title,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      "BehaviorTree Logs": ["btlog", "json", "jsonl", "gz", "log", "txt"],
      "All Files": ["*"]
    }
  });
  const file = files?.[0];
  if (!file) {
    return { canceled: true };
  }

  try {
    return {
      canceled: false,
      playbackLog: decodeBtlogFile(file.fsPath, currentSettings, {
        allowTruncatedLog: currentSettings.allowUnclosedPlaybackLog === true
      })
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
