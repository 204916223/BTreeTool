import * as vscode from "vscode";
import { BtPlaybackLog } from "../core/btlog";
import { callTraceChat } from "../traceConfig";

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
  controllers: TraceRequestControllers;
  postMessage: (message: unknown) => void;
  refreshTraceConfig: () => void;
};

export type TraceRequestControllers = Map<string, AbortController>;

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
  const { payload, globalStorageUri, latestPlaybackLog, controllers, postMessage, refreshTraceConfig } = options;
  const requestId = payload?.requestId || "";
  const question = payload?.question?.trim() || "";
  const context = payload?.context?.trim() || "";
  const logFilePath = payload?.logFilePath || "";

  try {
    if (!requestId || !question || !context) {
      throw new Error("Trace request is incomplete.");
    }
    if (!latestPlaybackLog || latestPlaybackLog.filePath !== logFilePath) {
      throw new Error("Trace only works with the currently opened btlog file.");
    }

    const controller = new AbortController();
    controllers.set(requestId, controller);
    const result = await callTraceChat(
      globalStorageUri,
      { question, context, signal: controller.signal },
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

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
  );
}
