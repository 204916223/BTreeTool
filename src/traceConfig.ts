import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";
import { Buffer } from "node:buffer";

export type TraceProviderKind = "openai-compatible" | "claude";

export interface TraceProviderDescriptor {
  id: string;
  label: string;
  kind: TraceProviderKind;
  defaultBaseUrl: string;
  defaultModel: string;
  defaultNote?: string;
}

export interface TraceProviderConfig {
  label: string;
  note: string;
  kind: TraceProviderKind;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface TraceConfig {
  activeProvider: string;
  providers: Record<string, TraceProviderConfig>;
}

export interface TraceProviderStatus {
  id: string;
  label: string;
  note: string;
  kind: TraceProviderKind;
  configured: boolean;
  missing: string[];
  model: string;
}

export interface TraceConfigState {
  ready: boolean;
  configFilePath: string;
  configDirectoryPath: string;
  activeProvider: string;
  activeProviderLabel: string;
  activeModel: string;
  missing: string[];
  notice: string | null;
  providers: TraceProviderStatus[];
}

export interface TraceChatRequest {
  question: string;
  context: string;
  learningContext?: string;
  signal?: AbortSignal;
}

export interface TraceChatResult {
  answer: string;
  provider: string;
  providerLabel: string;
  model: string;
}

export interface TraceChatHandlers {
  onDelta?: (delta: string) => void;
}

const TRACE_CONFIG_FILE_NAME = "trace-providers.json";
const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_CUSTOM_PROVIDER_LABEL = "Custom Provider";
const DEFAULT_CUSTOM_PROVIDER_PREFIX = "custom-provider";

export const TRACE_PROVIDERS: TraceProviderDescriptor[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini"
  },
  {
    id: "claude",
    label: "Claude",
    kind: "claude",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest"
  },
  {
    id: "qwen",
    label: "通义千问",
    kind: "openai-compatible",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat"
  },
  {
    id: "okinto",
    label: "Okinto Third-Party",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.okinto.com/v1",
    defaultModel: "gpt-5.5",
    defaultNote: "Third-party"
  }
];

export async function loadTraceConfig(globalStorageUri: vscode.Uri): Promise<{ config: TraceConfig; configUri: vscode.Uri }> {
  const configUri = vscode.Uri.joinPath(globalStorageUri, TRACE_CONFIG_FILE_NAME);
  await vscode.workspace.fs.createDirectory(globalStorageUri);

  try {
    const raw = await vscode.workspace.fs.readFile(configUri);
    const parsed = JSON.parse(Buffer.from(raw).toString("utf8"));
    return {
      config: normalizeTraceConfig(parsed),
      configUri
    };
  } catch (_error) {
    const config = createDefaultTraceConfig();
    await saveTraceConfig(configUri, config);
    return {
      config,
      configUri
    };
  }
}

export async function saveTraceConfig(configUri: vscode.Uri, config: TraceConfig): Promise<TraceConfig> {
  const normalized = normalizeTraceConfig(config);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(configUri, Buffer.from(content, "utf8"));
  return normalized;
}

export async function addTraceProvider(
  configUri: vscode.Uri,
  config: TraceConfig
): Promise<{ config: TraceConfig; providerId: string }> {
  const normalized = normalizeTraceConfig(config);
  const providerId = generateUniqueProviderId(normalized.providers);
  const providerLabel = generateUniqueProviderLabel(normalized.providers);
  normalized.providers[providerId] = {
    label: providerLabel,
    note: "",
    kind: "openai-compatible",
    enabled: true,
    apiKey: "",
    baseUrl: "",
    model: ""
  };

  if (!hasAnyConfiguredProvider(normalized.providers)) {
    normalized.activeProvider = providerId;
  }

  const saved = await saveTraceConfig(configUri, normalized);
  return {
    config: saved,
    providerId
  };
}

export async function setActiveTraceProvider(
  configUri: vscode.Uri,
  config: TraceConfig,
  providerId: string
): Promise<TraceConfig> {
  const normalized = normalizeTraceConfig(config);
  if (!normalized.providers[providerId]) {
    throw new Error(`Unsupported Trace provider: ${providerId}`);
  }
  normalized.activeProvider = providerId;
  return saveTraceConfig(configUri, normalized);
}

export function getTraceConfigState(config: TraceConfig, configFilePath: string): TraceConfigState {
  const normalized = normalizeTraceConfig(config);
  const providers = sortProviderStatuses(
    Object.entries(normalized.providers).map(([id, providerConfig]) => {
      const missing = getMissingProviderFields(providerConfig);
      return {
        id,
        label: providerConfig.label || id,
        note: providerConfig.note || "",
        kind: providerConfig.kind,
        configured: missing.length === 0,
        missing,
        model: providerConfig.model || getProviderDescriptor(id)?.defaultModel || ""
      };
    })
  );
  const availableProviders = providers.filter((provider) => provider.configured);
  const selectedProvider =
    availableProviders.find((provider) => provider.id === normalized.activeProvider) || availableProviders[0] || providers[0];
  const ready = availableProviders.length > 0;

  return {
    ready,
    configFilePath,
    configDirectoryPath: configFilePath ? path.dirname(configFilePath) : "",
    activeProvider: selectedProvider?.id || "",
    activeProviderLabel: selectedProvider?.label || "",
    activeModel: selectedProvider?.model || "",
    missing: selectedProvider?.missing || [],
    notice: null,
    providers
  };
}

export async function callTraceChat(
  globalStorageUri: vscode.Uri,
  request: TraceChatRequest,
  handlers: TraceChatHandlers = {}
): Promise<TraceChatResult> {
  const { config } = await loadTraceConfig(globalStorageUri);
  const state = getTraceConfigState(config, "");
  if (!state.ready) {
    throw new Error("AI assistant provider is incomplete.");
  }

  const providerConfig = config.providers[state.activeProvider];
  if (!providerConfig) {
    throw new Error(`Unsupported Trace provider: ${state.activeProvider}`);
  }

  const prompt = buildTracePrompt(request);
  const answer =
    providerConfig.kind === "claude"
      ? await callClaudeProvider(providerConfig, prompt, request.signal, handlers)
      : await callOpenAiCompatibleProvider(providerConfig, prompt, request.signal, handlers);

  return {
    answer,
    provider: state.activeProvider,
    providerLabel: providerConfig.label || state.activeProviderLabel,
    model: providerConfig.model
  };
}

function createDefaultTraceConfig(): TraceConfig {
  return {
    activeProvider: "openai",
    providers: Object.fromEntries(TRACE_PROVIDERS.map((provider) => [provider.id, createBuiltInProviderConfig(provider)]))
  };
}

function createBuiltInProviderConfig(provider: TraceProviderDescriptor): TraceProviderConfig {
  return {
    label: provider.label,
    note: provider.defaultNote || "",
    kind: provider.kind,
    enabled: true,
    apiKey: "",
    baseUrl: provider.defaultBaseUrl,
    model: provider.defaultModel
  };
}

function normalizeTraceConfig(value: unknown): TraceConfig {
  const input = isRecord(value) ? value : {};
  const activeProvider = typeof input.activeProvider === "string" ? input.activeProvider : "openai";
  const providerInput = isRecord(input.providers) ? input.providers : {};
  const providers: Record<string, TraceProviderConfig> = {};

  for (const descriptor of TRACE_PROVIDERS) {
    providers[descriptor.id] = normalizeProviderConfig(providerInput[descriptor.id], descriptor);
  }

  for (const [id, entry] of Object.entries(providerInput)) {
    if (providers[id]) {
      continue;
    }
    providers[id] = normalizeProviderConfig(entry, undefined);
  }

  const configuredProviders = Object.entries(providers)
    .filter(([, provider]) => getMissingProviderFields(provider).length === 0)
    .map(([id]) => id);

  return {
    activeProvider: configuredProviders.includes(activeProvider)
      ? activeProvider
      : configuredProviders[0] || getFirstProviderId(providers) || "openai",
    providers
  };
}

function normalizeProviderConfig(
  value: unknown,
  descriptor: TraceProviderDescriptor | undefined
): TraceProviderConfig {
  const input = isRecord(value) ? value : {};
  const fallbackLabel = descriptor?.label || DEFAULT_CUSTOM_PROVIDER_LABEL;
  return {
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : fallbackLabel,
    note: typeof input.note === "string" ? input.note.trim() : descriptor?.defaultNote || "",
    kind: normalizeProviderKind(input.kind, descriptor?.kind || "openai-compatible"),
    enabled: input.enabled !== false,
    apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "",
    baseUrl: normalizeBaseUrl(input.baseUrl, descriptor?.defaultBaseUrl || ""),
    model: typeof input.model === "string" ? input.model.trim() : descriptor?.defaultModel || ""
  };
}

function normalizeProviderKind(value: unknown, fallback: TraceProviderKind): TraceProviderKind {
  return value === "claude" ? "claude" : fallback === "claude" ? "claude" : "openai-compatible";
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
  return candidate || fallback;
}

function getMissingProviderFields(config: TraceProviderConfig): string[] {
  const missing: string[] = [];
  if (!config.enabled) {
    missing.push("enabled");
  }
  if (!config.apiKey) {
    missing.push("apiKey");
  }
  if (!config.baseUrl) {
    missing.push("baseUrl");
  }
  if (!config.model) {
    missing.push("model");
  }
  return missing;
}

function sortProviderStatuses(providers: TraceProviderStatus[]): TraceProviderStatus[] {
  return [...providers].sort((left, right) => {
    if (left.configured !== right.configured) {
      return left.configured ? -1 : 1;
    }
    const labelComparison = left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    if (labelComparison !== 0) {
      return labelComparison;
    }
    return left.id.localeCompare(right.id, undefined, { sensitivity: "base" });
  });
}

function hasAnyConfiguredProvider(providers: Record<string, TraceProviderConfig>): boolean {
  return Object.values(providers).some((provider) => getMissingProviderFields(provider).length === 0);
}

function generateUniqueProviderId(providers: Record<string, TraceProviderConfig>): string {
  let index = 1;
  while (providers[`${DEFAULT_CUSTOM_PROVIDER_PREFIX}-${index}`]) {
    index += 1;
  }
  return `${DEFAULT_CUSTOM_PROVIDER_PREFIX}-${index}`;
}

function generateUniqueProviderLabel(providers: Record<string, TraceProviderConfig>): string {
  const existing = new Set(Object.values(providers).map((provider) => provider.label));
  if (!existing.has(DEFAULT_CUSTOM_PROVIDER_LABEL)) {
    return DEFAULT_CUSTOM_PROVIDER_LABEL;
  }
  let index = 2;
  while (existing.has(`${DEFAULT_CUSTOM_PROVIDER_LABEL} ${index}`)) {
    index += 1;
  }
  return `${DEFAULT_CUSTOM_PROVIDER_LABEL} ${index}`;
}

function getFirstProviderId(providers: Record<string, TraceProviderConfig>): string {
  return Object.keys(providers)[0] || "";
}

function getProviderDescriptor(providerId: string): TraceProviderDescriptor | undefined {
  return TRACE_PROVIDERS.find((provider) => provider.id === providerId);
}

function buildTracePrompt(request: TraceChatRequest): string {
  return [
    "You are the AI assistant embedded in BTreeTool.",
    "Scope: only diagnose the currently opened btlog playback file and the frame context provided below.",
    "Answer in the user's language. Be concise, evidence-driven, and point to the likely first meaningful failure.",
    "Always answer with the conclusion first, then the core evidence.",
    "Format the answer as two required short sections, '结论：...' and '核心证据：...', plus an optional '猜测：...' section only when uncertainty remains.",
    "Do not list every provided evidence item. Report only the conclusion, the core evidence, and the next check when needed.",
    "Base the behavior-tree branch conclusion on btlog evidence. If the provided context also contains attached async log evidence, use it as valid external evidence for the deeper upstream cause.",
    "If the context contains 'Attached async log evidence', do not say async logs were not provided; cite the attached async evidence when it changes or deepens the conclusion.",
    "For behavior-position complaints such as 卸货点位不对, do not start from the final root status. First identify the relevant subtree from the btlog flow, then use that subtree start time to align async evidence.",
    "For unload-position complaints, the relevant subtree is usually Loading. Inspect the distance changes from Loading start until LoadRelease and read the Loading XML logic before concluding.",
    "Do not equate NavStatus or 'NavStop successed!' with navigation arrival. In this log pattern /jz_nav/get_status data=0 means no live navigation task; if Loading proceeds after the distance threshold and NavStop successed, conclude that navigation was stopped/not alive while close to the target and hand off to navigation stop/cancel/preempt/final-target-pose investigation.",
    "If the btlog evidence shows the root and relevant chain succeeded with no error evidence and there is no attached async error evidence, conclude that the btlog shows normal successful completion.",
    "If there is concrete error evidence such as populated out_error fields, known error code/name, root FAILURE, or a confirmed failure chain, conclude the error from that evidence even if final/root status is non-terminal.",
    "If the final/root status is RUNNING or otherwise non-terminal and there is no concrete error evidence, conclude that the btlog is incomplete or inconclusive; do not conclude success or failure.",
    "Do not describe behavior abnormality as likely unless the provided context contains concrete evidence for it. Put missing external information only in the next-check or guess part.",
    "Do not put uncertain guesses in the conclusion. Put guesses only after the evidence under '猜测：'.",
    "",
    "Current btlog context:",
    request.context,
    "",
    formatLearningContextForPrompt(request.learningContext),
    "",
    "User question:",
    request.question
  ].join("\n");
}

function formatLearningContextForPrompt(learningContext: string | undefined): string {
  const value = typeof learningContext === "string" ? learningContext.trim() : "";
  if (!value) {
    return "Historical feedback examples: none.";
  }
  return [
    "Historical feedback examples from prior reviewed AI assistant answers:",
    "Use reasonable examples as guidance when they match the current evidence.",
    "Use nonsense examples as negative examples; avoid repeating their unsupported conclusions.",
    value
  ].join("\n");
}

async function callOpenAiCompatibleProvider(
  config: TraceProviderConfig,
  prompt: string,
  signal: AbortSignal | undefined,
  handlers: TraceChatHandlers
): Promise<string> {
  const endpoint = joinUrl(config.baseUrl, "chat/completions");
  const response = await requestProviderResponse(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: {
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
      stream: true
    },
    signal
  }, {
    onSseEvent: (event) => {
      if (!event.data || event.data === "[DONE]") {
        return;
      }
      const payload = safeParseJson(event.data);
      const delta = payload?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        handlers.onDelta?.(delta);
      }
    }
  });

  if (response.streamed) {
    const content = extractOpenAiStreamContent(response.raw);
    if (!content.trim()) {
      throw new Error("AI assistant provider returned an empty response.");
    }
    return content.trim();
  }

  const content = response?.json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI assistant provider returned an empty response.");
  }
  await emitProgressively(content.trim(), handlers, signal);
  return content.trim();
}

async function callClaudeProvider(
  config: TraceProviderConfig,
  prompt: string,
  signal: AbortSignal | undefined,
  handlers: TraceChatHandlers
): Promise<string> {
  const endpoint = joinUrl(config.baseUrl, "v1/messages");
  const response = await requestProviderResponse(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: {
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
      stream: true
    },
    signal
  }, {
    onSseEvent: (event) => {
      if (!event.data) {
        return;
      }
      const payload = safeParseJson(event.data);
      const delta = typeof payload?.delta?.text === "string"
        ? payload.delta.text
        : typeof payload?.delta?.content === "string"
          ? payload.delta.content
          : typeof payload?.text === "string"
            ? payload.text
            : "";
      if (delta) {
        handlers.onDelta?.(delta);
      }
    }
  });

  if (response.streamed) {
    const text = extractClaudeStreamContent(response.raw);
    if (!text) {
      throw new Error("AI assistant provider returned an empty response.");
    }
    return text.trim();
  }

  const text = Array.isArray(response?.json?.content)
    ? response.json.content
        .map((part: unknown) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim()
    : "";
  if (!text) {
    throw new Error("AI assistant provider returned an empty response.");
  }
  await emitProgressively(text, handlers, signal);
  return text;
}

function joinUrl(baseUrl: string, pathPart: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${pathPart.replace(/^\/+/, "")}`;
}

function requestProviderResponse(
  url: string,
  options: { method: "POST"; headers: Record<string, string>; body: unknown; signal?: AbortSignal },
  handlers: { onSseEvent?: (event: { event: string; data: string }) => void } = {}
): Promise<{ raw: string; json: any; streamed: boolean }> {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const body = JSON.stringify(options.body);
    const request = https.request(
      endpoint,
      {
        method: options.method,
        headers: {
          ...options.headers,
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: REQUEST_TIMEOUT_MS,
        signal: options.signal
      },
      (response) => {
        const chunks: Buffer[] = [];
        const streamed = String(response.headers["content-type"] || "").includes("text/event-stream");
        const parser = streamed ? createSseParser(handlers.onSseEvent || (() => undefined)) : null;

        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buffer);
          if (parser) {
            parser.push(buffer.toString("utf8"));
          }
        });
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: any = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (_error) {
            parsed = raw;
          }

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(formatApiError(response.statusCode, parsed)));
            return;
          }
          if (parser) {
            parser.finish();
          }
          resolve({
            raw,
            json: parsed,
            streamed
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("AI assistant provider request timed out."));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function createSseParser(onEvent: (event: { event: string; data: string }) => void) {
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];

  function flushEvent() {
    if (dataLines.length === 0) {
      eventName = "";
      return;
    }
    onEvent({
      event: eventName || "message",
      data: dataLines.join("\n")
    });
    eventName = "";
    dataLines = [];
  }

  function handleLine(line: string) {
    if (line === "") {
      flushEvent();
      return;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    },
    finish() {
      if (buffer) {
        handleLine(buffer.replace(/\r$/, ""));
        buffer = "";
      }
      flushEvent();
    }
  };
}

function safeParseJson(value: string): any {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_error) {
    return null;
  }
}

function extractOpenAiStreamContent(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .filter((line) => line && line !== "[DONE]")
    .map((line) => {
      const parsed = safeParseJson(line);
      return typeof parsed?.choices?.[0]?.delta?.content === "string" ? parsed.choices[0].delta.content : "";
    })
    .join("");
}

function extractClaudeStreamContent(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .map((line) => {
      const parsed = safeParseJson(line);
      if (typeof parsed?.delta?.text === "string") {
        return parsed.delta.text;
      }
      if (typeof parsed?.delta?.content === "string") {
        return parsed.delta.content;
      }
      if (typeof parsed?.text === "string") {
        return parsed.text;
      }
      return "";
    })
    .join("");
}

async function emitProgressively(
  text: string,
  handlers: TraceChatHandlers,
  signal: AbortSignal | undefined
): Promise<void> {
  if (!handlers.onDelta) {
    return;
  }
  const chunks = text.split(/(\n+)/).filter((chunk) => chunk.length > 0);
  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw new Error("AI assistant request cancelled.");
    }
    handlers.onDelta(chunk);
    await delay(8);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatApiError(statusCode: number | undefined, response: unknown): string {
  const status = statusCode ? `HTTP ${statusCode}` : "HTTP error";
  if (isRecord(response)) {
    const error = response.error;
    if (isRecord(error) && typeof error.message === "string") {
      return `${status}: ${error.message}`;
    }
    if (typeof response.message === "string") {
      return `${status}: ${response.message}`;
    }
  }
  if (typeof response === "string" && response.trim()) {
    return `${status}: ${response.slice(0, 240)}`;
  }
  return status;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
