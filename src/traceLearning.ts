import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as vscode from "vscode";
import { BtUserSettings } from "./userSettings";

export type TraceFeedbackVerdict = "reasonable" | "nonsense";

export interface TraceFeedbackRecord {
  createdAt: string;
  action: "learn" | "optimize";
  requestId: string;
  verdict: TraceFeedbackVerdict;
  logFilePath: string;
  frameIndex: number | null;
  question: string;
  answer: string;
  context: string;
  feedbackTarget: string;
  sectionLabel: string;
}

export interface TraceFeedbackPayload {
  requestId?: string;
  verdict?: TraceFeedbackVerdict;
  logFilePath?: string;
  frameIndex?: number;
  question?: string;
  answer?: string;
  context?: string;
  feedbackTarget?: string;
  sectionLabel?: string;
}

interface TraceLearningSearchCase {
  score?: number;
  action?: string;
  verdict?: TraceFeedbackVerdict;
  createdAt?: string;
  question?: string;
  answer?: string;
  context?: string;
  feedbackTarget?: string;
  sectionLabel?: string;
}

const FEEDBACK_FILE_NAME = "trace-feedback.jsonl";
const PENDING_FILE_NAME = "trace-feedback-pending.jsonl";
const TRACE_LEARNING_COLLECTION_ENDPOINT = "http://172.19.3.32:8080/api/trace-feedback";
const TRACE_LEARNING_SEARCH_ENDPOINT = "http://172.19.3.32:8080/api/trace-feedback/search";
const REMOTE_TIMEOUT_MS = 5000;
const SEARCH_TIMEOUT_MS = 2500;
const MAX_PENDING_RETRY_RECORDS = 100;
const MAX_LEARNING_CONTEXT_CHARS = 4000;

export function createTraceFeedbackRecord(payload: TraceFeedbackPayload | undefined): TraceFeedbackRecord | null {
  const verdict = payload?.verdict === "reasonable" ? "reasonable" : payload?.verdict === "nonsense" ? "nonsense" : "";
  if (!payload?.requestId || !verdict) {
    return null;
  }

  return {
    createdAt: new Date().toISOString(),
    action: verdict === "reasonable" ? "learn" : "optimize",
    requestId: payload.requestId,
    verdict,
    logFilePath: payload.logFilePath || "",
    frameIndex: Number.isInteger(payload.frameIndex) ? payload.frameIndex ?? null : null,
    question: payload.question || "",
    answer: payload.answer || "",
    context: payload.context || "",
    feedbackTarget: payload.feedbackTarget || "answer",
    sectionLabel: payload.sectionLabel || ""
  };
}

export async function storeTraceFeedback(
  globalStorageUri: vscode.Uri,
  settings: BtUserSettings,
  record: TraceFeedbackRecord
): Promise<void> {
  const directoryPath = globalStorageUri.fsPath;
  const feedbackFilePath = vscode.Uri.joinPath(globalStorageUri, FEEDBACK_FILE_NAME).fsPath;
  await fs.promises.mkdir(directoryPath, { recursive: true });
  if (await hasTraceFeedbackRecord(feedbackFilePath, record.requestId, record.feedbackTarget)) {
    return;
  }

  await fs.promises.appendFile(feedbackFilePath, `${JSON.stringify(record)}\n`, "utf8");
  await flushTraceFeedbackPending(globalStorageUri, settings);
  await uploadOrQueueTraceFeedback(globalStorageUri, settings, [record]);
}

export async function loadTraceLearningContext(
  settings: BtUserSettings,
  question: string,
  context: string,
  signal?: AbortSignal
): Promise<string> {
  if (settings.traceLearningEnhancementEnabled !== true) {
    return "";
  }

  const endpoint = normalizeEndpoint(TRACE_LEARNING_SEARCH_ENDPOINT);
  if (!endpoint) {
    return "";
  }

  try {
    const body = JSON.stringify({
      question,
      context: context.slice(0, 12000),
      limit: 5
    });
    const response = await postJsonForResponse(
      endpoint,
      {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString()
      },
      body,
      SEARCH_TIMEOUT_MS,
      signal
    );
    const cases = Array.isArray(response?.cases) ? response.cases : [];
    return formatTraceLearningCases(cases);
  } catch (error) {
    if (!isAbortError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`BTreeTool: failed to load trace learning context. Continuing without it. ${message}`);
    }
    return "";
  }
}

async function uploadOrQueueTraceFeedback(
  globalStorageUri: vscode.Uri,
  settings: BtUserSettings,
  records: TraceFeedbackRecord[]
): Promise<void> {
  if (records.length === 0 || !isRemoteLearningConfigured(settings)) {
    return;
  }

  try {
    await postTraceFeedbackRecords(settings, records);
  } catch (error) {
    await appendPendingTraceFeedback(globalStorageUri, records);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`BTreeTool: failed to upload trace feedback. Queued for retry. ${message}`);
  }
}

async function flushTraceFeedbackPending(globalStorageUri: vscode.Uri, settings: BtUserSettings): Promise<void> {
  if (!isRemoteLearningConfigured(settings)) {
    return;
  }

  const pendingFilePath = vscode.Uri.joinPath(globalStorageUri, PENDING_FILE_NAME).fsPath;
  const pendingRecords = await readPendingTraceFeedback(pendingFilePath);
  if (pendingRecords.length === 0) {
    return;
  }

  const retryRecords = pendingRecords.slice(0, MAX_PENDING_RETRY_RECORDS);
  const remainingRecords = pendingRecords.slice(MAX_PENDING_RETRY_RECORDS);
  try {
    await postTraceFeedbackRecords(settings, retryRecords);
    await rewritePendingTraceFeedback(pendingFilePath, remainingRecords);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`BTreeTool: failed to flush pending trace feedback. Will retry later. ${message}`);
  }
}

async function hasTraceFeedbackRecord(filePath: string, requestId: string, feedbackTarget: string): Promise<boolean> {
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .some((line) => {
        try {
          const entry = JSON.parse(line);
          return entry?.requestId === requestId && entry?.feedbackTarget === feedbackTarget;
        } catch (_error) {
          return false;
        }
      });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

async function readPendingTraceFeedback(filePath: string): Promise<TraceFeedbackRecord[]> {
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TraceFeedbackRecord;
        } catch (_error) {
          return null;
        }
      })
      .filter((record): record is TraceFeedbackRecord => Boolean(record));
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

async function appendPendingTraceFeedback(globalStorageUri: vscode.Uri, records: TraceFeedbackRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }
  const pendingFilePath = vscode.Uri.joinPath(globalStorageUri, PENDING_FILE_NAME).fsPath;
  await fs.promises.appendFile(pendingFilePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

async function rewritePendingTraceFeedback(filePath: string, records: TraceFeedbackRecord[]): Promise<void> {
  if (records.length === 0) {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }
    return;
  }
  await fs.promises.writeFile(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

function isRemoteLearningConfigured(settings: BtUserSettings): boolean {
  return settings.traceLearningEnhancementEnabled === true && Boolean(normalizeEndpoint(TRACE_LEARNING_COLLECTION_ENDPOINT));
}

async function postTraceFeedbackRecords(settings: BtUserSettings, records: TraceFeedbackRecord[]): Promise<void> {
  if (settings.traceLearningEnhancementEnabled !== true) {
    return;
  }

  const endpoint = normalizeEndpoint(TRACE_LEARNING_COLLECTION_ENDPOINT);
  if (!endpoint) {
    return;
  }

  const body = JSON.stringify({
    source: "btree-tool",
    schemaVersion: 1,
    sentAt: new Date().toISOString(),
    records
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body).toString()
  };

  await postJson(endpoint, headers, body);
}

function normalizeEndpoint(value: string): URL | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  try {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      return null;
    }
    return endpoint;
  } catch (_error) {
    return null;
  }
}

function postJson(endpoint: URL, headers: Record<string, string>, body: string): Promise<void> {
  return postJsonForResponse(endpoint, headers, body, REMOTE_TIMEOUT_MS).then(() => undefined);
}

function postJsonForResponse(
  endpoint: URL,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<any> {
  return new Promise((resolve, reject) => {
    const transport = endpoint.protocol === "https:" ? https : http;
    const request = transport.request(
      endpoint,
      {
        method: "POST",
        headers,
        timeout: timeoutMs,
        signal
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const statusCode = response.statusCode || 0;
          const raw = Buffer.concat(chunks).toString("utf8");
          if (statusCode >= 200 && statusCode < 300) {
            try {
              resolve(raw ? JSON.parse(raw) : null);
            } catch (_error) {
              resolve(raw);
            }
            return;
          }
          reject(new Error(`Remote learning API returned HTTP ${statusCode}.`));
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Remote learning API request timed out."));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function formatTraceLearningCases(cases: TraceLearningSearchCase[]): string {
  const formatted = cases
    .map((entry, index) => formatTraceLearningCase(entry, index + 1))
    .filter(Boolean)
    .join("\n\n");
  return formatted.slice(0, MAX_LEARNING_CONTEXT_CHARS);
}

function formatTraceLearningCase(entry: TraceLearningSearchCase, index: number): string {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const verdict = entry.verdict === "nonsense" ? "nonsense" : "reasonable";
  const label = verdict === "nonsense" ? "negative example" : "positive example";
  const question = trimForPrompt(entry.question || "", 500);
  const answer = trimForPrompt(entry.answer || "", 800);
  const context = trimForPrompt(entry.context || "", 800);
  if (!question && !answer && !context) {
    return "";
  }

  return [
    `Case ${index} (${label}, score ${Number(entry.score || 0).toFixed(2)}):`,
    question ? `Question: ${question}` : "",
    answer ? `Reviewed answer: ${answer}` : "",
    context ? `Evidence context excerpt: ${context}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function trimForPrompt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: string }).code === "ENOENT" || (error as { code?: string }).code === "FileNotFound")
  );
}
