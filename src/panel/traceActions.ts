import { Buffer } from "node:buffer";
import * as vscode from "vscode";
import { BtPlaybackLog } from "../core/btlog";
import {
  addTraceProvider,
  callTraceChat,
  getTraceConfigState,
  loadTraceConfig,
  setActiveTraceProvider,
  TraceConfigState
} from "../traceConfig";
import { enrichTraceContextWithQuestionEvidence } from "../traceEvidence";
import { loadTraceLearningContext } from "../traceLearning";
import { BtUserSettings } from "../userSettings";
import { openDocumentInEditor, toBaseName } from "./panelUtils";

export type TraceAskPayload =
  | {
      requestId?: string;
      logFilePath?: string;
      question?: string;
      context?: string;
    }
  | undefined;

export type TraceAskOptions = {
  payload: TraceAskPayload;
  globalStorageUri: vscode.Uri;
  latestPlaybackLog: BtPlaybackLog | null;
  currentSettings: BtUserSettings;
  externalContext?: string;
  controllers: TraceRequestControllers;
  postMessage: (message: unknown) => void;
  refreshTraceConfig: () => void;
};

export type TraceRequestControllers = Map<string, AbortController>;

export type TraceConfigStateMessage = {
  configUri: vscode.Uri | null;
  message: {
    type: "traceConfigState";
    payload: TraceConfigState;
  };
};

export type TraceContextFileState = {
  fileName: string;
  filePath: string;
  lineCount: number;
  charCount: number;
  truncated: boolean;
};

export type TraceContextFile = {
  state: TraceContextFileState;
  text: string;
};

export function createTraceRequestControllers(): TraceRequestControllers {
  return new Map<string, AbortController>();
}

export function cancelTraceRequest(
  controllers: TraceRequestControllers,
  payload: { requestId?: string } | undefined
): void {
  const requestId = payload?.requestId || "";
  const controller = requestId ? controllers.get(requestId) : null;
  if (!controller || controller.signal.aborted) {
    return;
  }
  controller.abort();
}

export async function handleTraceAskAction(options: TraceAskOptions): Promise<void> {
  const { payload, globalStorageUri, latestPlaybackLog, currentSettings, externalContext, controllers, postMessage, refreshTraceConfig } = options;
  const requestId = payload?.requestId || "";
  const question = payload?.question?.trim() || "";
  const context = payload?.context?.trim() || "";
  const logFilePath = payload?.logFilePath || "";

  try {
    if (!requestId || !question || !context) {
      throw new Error("AI assistant request is incomplete.");
    }
    if (!latestPlaybackLog || latestPlaybackLog.filePath !== logFilePath) {
      throw new Error("AI assistant only works with the currently opened btlog file.");
    }

    const enrichedContext = enrichTraceContextWithQuestionEvidence(context, [question, externalContext || ""].join("\n"));
    const controller = new AbortController();
    controllers.set(requestId, controller);
    const learningContext = await loadTraceLearningContext(currentSettings, question, enrichedContext, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    const result = await callTraceChat(
      globalStorageUri,
      { question, context: enrichedContext, learningContext, signal: controller.signal },
      {
        onDelta: (delta) => {
          if (!delta || controller.signal.aborted) {
            return;
          }
          postMessage({
            type: "traceAnswerChunk",
            payload: {
              requestId,
              delta
            }
          });
        }
      }
    );
    if (controller.signal.aborted) {
      return;
    }
    postMessage({
      type: "traceAnswer",
      payload: {
        requestId,
        ok: true,
        answer: result.answer,
        provider: result.providerLabel,
        model: result.model
      }
    });
  } catch (error) {
    const controller = requestId ? controllers.get(requestId) : null;
    const cancelled = controller?.signal.aborted === true || isAbortError(error);
    const message = error instanceof Error ? error.message : String(error);
    postMessage({
      type: "traceAnswer",
      payload: {
        requestId,
        ok: false,
        cancelled,
        error: cancelled ? "" : message
      }
    });
    if (!cancelled) {
      refreshTraceConfig();
    }
  } finally {
    if (requestId) {
      controllers.delete(requestId);
    }
  }
}

export async function loadTraceConfigStateMessage(globalStorageUri: vscode.Uri): Promise<TraceConfigStateMessage> {
  try {
    const { config, configUri } = await loadTraceConfig(globalStorageUri);
    return {
      configUri,
      message: {
        type: "traceConfigState",
        payload: getTraceConfigState(config, configUri.fsPath)
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      configUri: null,
      message: {
        type: "traceConfigState",
        payload: {
          ready: false,
          configFilePath: "",
          configDirectoryPath: "",
          activeProvider: "",
          activeProviderLabel: "",
          activeModel: "",
          missing: [message],
          notice: message,
          providers: []
        }
      }
    };
  }
}

export async function openTraceConfigFileAction(
  globalStorageUri: vscode.Uri,
  traceConfigFileUri: vscode.Uri | null
): Promise<vscode.Uri> {
  const configUri = traceConfigFileUri || (await loadTraceConfig(globalStorageUri)).configUri;
  await openDocumentInEditor(configUri);
  return configUri;
}

export async function handleAddTraceProviderAction(globalStorageUri: vscode.Uri): Promise<TraceConfigStateMessage> {
  const { config, configUri } = await loadTraceConfig(globalStorageUri);
  const updated = await addTraceProvider(configUri, config);
  await openDocumentInEditor(configUri);
  return {
    configUri,
    message: {
      type: "traceConfigState",
      payload: getTraceConfigState(updated.config, configUri.fsPath)
    }
  };
}

export async function handleSetTraceProviderAction(
  globalStorageUri: vscode.Uri,
  payload: { providerId?: string } | undefined
): Promise<TraceConfigStateMessage | null> {
  const providerId = payload?.providerId || "";
  if (!providerId) {
    return null;
  }

  const { config, configUri } = await loadTraceConfig(globalStorageUri);
  const updated = await setActiveTraceProvider(configUri, config, providerId);
  return {
    configUri,
    message: {
      type: "traceConfigState",
      payload: getTraceConfigState(updated, configUri.fsPath)
    }
  };
}

export async function chooseTraceContextFile(): Promise<TraceContextFile | null> {
  const files = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Attach async log",
    filters: {
      "Log files": ["log", "txt", "1"],
      "All files": ["*"]
    }
  });
  const file = files?.[0];
  if (!file) {
    return null;
  }

  const bytes = await vscode.workspace.fs.readFile(file);
  const text = Buffer.from(bytes).toString("utf8");
  return createTraceContextFile(file.fsPath, file.fsPath, text);
}

export function createTraceContextFileFromPayload(
  payload: { fileName?: string; text?: string } | undefined
): TraceContextFile | null {
  const text = typeof payload?.text === "string" ? payload.text : "";
  if (!text) {
    return null;
  }

  const fileName = payload?.fileName?.trim() || "async.log";
  return createTraceContextFile(fileName, fileName, text);
}

function createTraceContextFile(fileName: string, filePath: string, text: string): TraceContextFile {
  return {
    text,
    state: {
      fileName: toBaseName(fileName),
      filePath,
      lineCount: text.split(/\r?\n/).length,
      charCount: text.length,
      truncated: false
    }
  };
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
  );
}
