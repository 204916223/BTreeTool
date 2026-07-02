import { readFileSync } from "node:fs";
import { scanEditAssistantRules } from "../core/editAssistantScan";
import { BtPreviewDocument, BtPreviewNode } from "../core/viewModel";
import { BtUserSettings } from "../userSettings";
import type { getPanelCopy } from "./panelCopy";

export type EditAssistantAskPayload =
  | {
      requestId?: string;
      prompt?: string;
      action?: string;
      silent?: boolean;
      treeId?: string;
      nodePath?: string;
      queueTreeIds?: string[];
    }
  | undefined;

export type AtlasNodeEntry = {
  title?: unknown;
  description?: unknown;
  department?: unknown;
  maintainer?: unknown;
  source_notes?: unknown;
  mainline?: {
    status?: unknown;
    rules?: unknown;
    examples?: unknown;
    params?: unknown;
  };
};

export type EditAssistantMessage = {
  type: "editAssistantAnswer";
  payload: {
    requestId: string;
    ok: true;
    action?: "scan" | "explainNode";
    silent?: boolean;
    scan?: ReturnType<typeof scanEditAssistantRules>;
    answer?: string;
    notice?: string;
  };
};

type PanelCopy = ReturnType<typeof getPanelCopy>;

export type EditAssistantActionContext = {
  preview: BtPreviewDocument | null;
  settings: BtUserSettings;
  copy: PanelCopy;
  atlasNodes: ReadonlyMap<string, AtlasNodeEntry>;
  postMessage: (message: EditAssistantMessage) => void;
};

export function loadAtlasNodeIndex(atlasPath: string): ReadonlyMap<string, AtlasNodeEntry> {
  try {
    const parsed = JSON.parse(readFileSync(atlasPath, "utf8")) as Record<string, AtlasNodeEntry>;
    return new Map(
      Object.entries(parsed).filter((entry): entry is [string, AtlasNodeEntry] =>
        Boolean(entry[0]) && entry[1] !== null && typeof entry[1] === "object" && !Array.isArray(entry[1])
      )
    );
  } catch (_error) {
    return new Map();
  }
}

export function handleEditAssistantAskAction(
  payload: EditAssistantAskPayload,
  context: EditAssistantActionContext
): void {
  const prompt = payload?.prompt?.trim() || "";
  const treeId = payload?.treeId?.trim() || context.preview?.defaultTreeId || "";
  const nodePath = payload?.nodePath?.trim() || "0";
  if (payload?.action === "scan") {
    const scan = scanEditAssistantRules(context.preview, {
      queueTreeIds: payload.queueTreeIds,
      currentTreeId: treeId,
      warningWhitelist: context.settings.editAssistantWarningWhitelist,
      language: context.settings.language
    });
    context.postMessage({
      type: "editAssistantAnswer",
      payload: {
        requestId: payload?.requestId || "",
        ok: true,
        action: "scan",
        silent: payload?.silent === true,
        scan
      }
    });
    return;
  }

  if (payload?.action === "explainNode") {
    context.postMessage({
      type: "editAssistantAnswer",
      payload: {
        requestId: payload?.requestId || "",
        ok: true,
        action: "explainNode",
        answer: buildSelectedNodeExplanation({
          preview: context.preview,
          treeId,
          nodePath,
          prompt,
          language: context.settings.language,
          atlasNodes: context.atlasNodes
        })
      }
    });
    return;
  }

  const warnings = context.preview?.warnings.length ?? 0;
  const target = treeId ? `树 "${treeId}" / 节点 ${nodePath}` : "当前行为树";
  const answer = prompt
    ? `已收到针对 ${target} 的请求：${prompt}\n\n当前框架已接入编辑模式右侧面板和消息通道。本阶段还没有执行规则扫描或生成编辑操作；下一步可以把本地规则检查、模板化编辑计划和 AI 规划分别接到这个入口。当前文档告警数量：${warnings}。`
    : "编辑助手请求为空。";

  context.postMessage({
    type: "editAssistantAnswer",
    payload: {
      requestId: payload?.requestId || "",
      ok: true,
      answer,
      notice: context.copy.nodeCreateUnchanged
    }
  });
}

function buildSelectedNodeExplanation(options: {
  preview: BtPreviewDocument | null;
  treeId: string;
  nodePath: string;
  prompt: string;
  language: BtUserSettings["language"];
  atlasNodes: ReadonlyMap<string, AtlasNodeEntry>;
}): string {
  const { preview, treeId, nodePath, prompt, atlasNodes } = options;
  const node = findPreviewNode(preview, treeId, nodePath);
  const isChinese = options.language === "zh-CN";
  if (!preview || !node) {
    return isChinese
      ? `没有找到要解释的节点。当前请求：${prompt || "解释选中节点"}`
      : `The selected node could not be found. Request: ${prompt || "Explain selected node"}`;
  }

  const location = isChinese ? `树 "${treeId}" / 节点 ${node.nodePath}` : `Tree "${treeId}" / node ${node.nodePath}`;
  const atlasEntry = atlasNodes.get(node.kind) || null;
  const atlasTitle = toOptionalString(atlasEntry?.title);
  const title = atlasTitle || node.title || node.kind;
  const kind = node.kind && node.kind !== title ? `${title} (${node.kind})` : title;
  const role = describeNodeRole(node, isChinese, atlasEntry);
  const details = [
    isChinese ? `节点：${kind}` : `Node: ${kind}`,
    isChinese ? `位置：${location}` : `Location: ${location}`,
    isChinese ? `分类：${node.category}${node.modelKind ? ` / ${node.modelKind}` : ""}` : `Category: ${node.category}${node.modelKind ? ` / ${node.modelKind}` : ""}`,
    isChinese ? `作用：${role}` : `Purpose: ${role}`
  ];

  const atlasIntro = formatAtlasFunctionIntro(atlasEntry, isChinese);
  if (atlasIntro) {
    details.push(atlasIntro);
  }
  if (node.targetTreeId) {
    details.push(isChinese ? `子树目标：${node.targetTreeId}` : `SubTree target: ${node.targetTreeId}`);
  }
  const fieldSummary = formatNodeFieldSummary(node, isChinese);
  if (fieldSummary) {
    details.push(fieldSummary);
  }
  const attributeSummary = formatNodeAttributeSummary(node, isChinese);
  if (attributeSummary) {
    details.push(attributeSummary);
  }
  details.push(isChinese ? `子节点：${node.children.length} 个` : `Children: ${node.children.length}`);
  if (node.warnings.length > 0) {
    details.push(
      isChinese
        ? `当前告警：${node.warnings.map((warning) => warning.message).join("；")}`
        : `Current warnings: ${node.warnings.map((warning) => warning.message).join("; ")}`
    );
  }

  return details.join("\n");
}

function findPreviewNode(preview: BtPreviewDocument | null, treeId: string, nodePath: string): BtPreviewNode | null {
  const tree = preview?.behaviorTrees.find((entry) => entry.id === treeId) || null;
  if (!tree?.node) {
    return null;
  }
  return findPreviewNodeByPath(tree.node, nodePath || "0");
}

function findPreviewNodeByPath(rootNode: BtPreviewNode, nodePath: string): BtPreviewNode | null {
  const parts = nodePath.split(".");
  let cursor: BtPreviewNode | undefined = rootNode;
  for (let index = 1; index < parts.length; index += 1) {
    const childIndex = Number(parts[index]);
    if (!Number.isInteger(childIndex) || childIndex < 0) {
      return null;
    }
    cursor = cursor.children[childIndex];
    if (!cursor) {
      return null;
    }
  }
  return cursor || null;
}

function describeNodeRole(node: BtPreviewNode, isChinese: boolean, atlasEntry: AtlasNodeEntry | null = null): string {
  const atlasDescription = toOptionalString(atlasEntry?.description);
  const semanticText = [atlasDescription, node.description, node.summary, node.code]
    .map((value) => value.trim())
    .filter(Boolean);
  if (semanticText.length > 0) {
    return Array.from(new Set(semanticText)).join(isChinese ? "；" : "; ");
  }
  if (node.category === "Control") {
    return isChinese ? "控制子节点的执行顺序、分支选择或并行策略。" : "Controls child execution order, branching, or parallel behavior.";
  }
  if (node.category === "Decorator") {
    return isChinese ? "修饰子节点的执行条件、次数、结果或时序。" : "Decorates a child node by changing its condition, repeat behavior, result, or timing.";
  }
  if (node.category === "Condition") {
    return isChinese ? "读取当前状态并返回条件是否满足。" : "Reads current state and returns whether a condition is satisfied.";
  }
  if (node.category === "SubTree") {
    return isChinese ? "调用另一个行为树作为当前流程的一部分。" : "Calls another behavior tree as part of the current flow.";
  }
  return isChinese ? "执行一个具体动作，并根据执行结果返回节点状态。" : "Executes an action and returns the resulting node status.";
}

function formatAtlasFunctionIntro(entry: AtlasNodeEntry | null, isChinese: boolean): string {
  if (!entry) {
    return "";
  }

  const lines: string[] = [];
  const rules = toStringList(entry.mainline?.rules);
  if (rules.length > 0) {
    lines.push(isChinese ? `规则：${rules.join("；")}` : `Rules: ${rules.join("; ")}`);
  }
  const examples = toStringList(entry.mainline?.examples);
  if (examples.length > 0) {
    lines.push(isChinese ? `示例：${examples.join("；")}` : `Examples: ${examples.join("; ")}`);
  }
  const paramIntro = formatAtlasParamIntro(entry, isChinese);
  if (paramIntro) {
    lines.push(paramIntro);
  }
  const notes = toStringList(entry.source_notes);
  if (notes.length > 0) {
    lines.push(isChinese ? `备注：${notes.join("；")}` : `Notes: ${notes.join("; ")}`);
  }
  if (lines.length === 0) {
    return "";
  }
  return isChinese ? `图鉴功能介绍：\n${lines.join("\n")}` : `Atlas function introduction:\n${lines.join("\n")}`;
}

function formatAtlasParamIntro(entry: AtlasNodeEntry, isChinese: boolean): string {
  const params = toRecord(entry.mainline?.params);
  const lines = Object.entries(params)
    .map(([name, value]) => {
      const param = toRecord(value);
      const description = toOptionalString(param.description);
      const type = toOptionalString(param.type);
      const role = toOptionalString(param.role);
      const required = param.required === true ? (isChinese ? "必填" : "required") : "";
      const parts = [role, type, required, description].filter(Boolean);
      return parts.length > 0 ? `${name}: ${parts.join(" / ")}` : "";
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  return isChinese ? `关键参数：${lines.join("；")}` : `Key parameters: ${lines.join("; ")}`;
}

function formatNodeFieldSummary(node: BtPreviewNode, isChinese: boolean): string {
  const inputText = formatPreviewAttributes(node.ioGroups.inputs);
  const outputText = formatPreviewAttributes(node.ioGroups.outputs);
  const paramText = formatPreviewAttributes(node.ioGroups.params);
  const parts = [
    inputText ? (isChinese ? `输入：${inputText}` : `Inputs: ${inputText}`) : "",
    outputText ? (isChinese ? `输出：${outputText}` : `Outputs: ${outputText}`) : "",
    paramText ? (isChinese ? `参数：${paramText}` : `Params: ${paramText}`) : ""
  ].filter(Boolean);
  return parts.join("\n");
}

function formatNodeAttributeSummary(node: BtPreviewNode, isChinese: boolean): string {
  const fields = Object.entries(node.attributes)
    .filter(([key]) => key !== "_uid")
    .map(([key, value]) => `${key}=${value || '""'}`)
    .slice(0, 12);
  if (fields.length === 0) {
    return "";
  }
  return isChinese ? `当前属性：${fields.join(", ")}` : `Current attributes: ${fields.join(", ")}`;
}

function formatPreviewAttributes(attributes: Array<{ key: string; value: string }>): string {
  return attributes
    .map((field) => (field.value ? `${field.key}=${field.value}` : field.key))
    .filter(Boolean)
    .join(", ");
}

function toOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
