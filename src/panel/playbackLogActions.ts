import * as vscode from "vscode";
import { BtPlaybackLog, decodeBtlogFile } from "../core/btlog";
import { BtUserSettings } from "../userSettings";

export type ChoosePlaybackLogResult =
  | { canceled: true }
  | { canceled: false; playbackLog: BtPlaybackLog }
  | { canceled: false; error: string };

export type PlaybackLogActionMessage =
  | { type: "playbackLogImportFinished" }
  | { type: "playbackLog"; payload: BtPlaybackLog }
  | { type: "playbackLogError"; payload: { message: string } };

export type PlaybackLogActionResult =
  | { kind: "canceled"; message: PlaybackLogActionMessage; clearTraceContext: false }
  | {
      kind: "loaded";
      playbackLog: BtPlaybackLog;
      panelTitle: string;
      message: PlaybackLogActionMessage;
      clearTraceContext: true;
    }
  | {
      kind: "error";
      playbackLog: null;
      message: PlaybackLogActionMessage;
      errorMessage: string;
      clearTraceContext: true;
    };

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

export async function handleChoosePlaybackLogFileAction(
  title: string,
  currentSettings: BtUserSettings
): Promise<PlaybackLogActionResult> {
  try {
    const result = await choosePlaybackLogFile(title, currentSettings);
    if (result.canceled) {
      return {
        kind: "canceled",
        message: { type: "playbackLogImportFinished" },
        clearTraceContext: false
      };
    }

    if ("playbackLog" in result) {
      return {
        kind: "loaded",
        playbackLog: result.playbackLog,
        panelTitle: `BTreeTool: ${result.playbackLog.fileName}`,
        message: {
          type: "playbackLog",
          payload: result.playbackLog
        },
        clearTraceContext: true
      };
    }

    return toPlaybackLogErrorResult(result.error);
  } catch (error) {
    return toPlaybackLogErrorResult(error instanceof Error ? error.message : String(error));
  }
}

function toPlaybackLogErrorResult(message: string): PlaybackLogActionResult {
  return {
    kind: "error",
    playbackLog: null,
    message: {
      type: "playbackLogError",
      payload: { message }
    },
    errorMessage: message,
    clearTraceContext: true
  };
}
