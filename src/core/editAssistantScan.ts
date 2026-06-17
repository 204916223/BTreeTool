import { BtPreviewDocument, BtPreviewNode, BtPreviewTree } from "./viewModel";

export type EditAssistantIssueSeverity = "error" | "warning" | "info";

export interface EditAssistantScanIssue {
  id: string;
  ruleId: string;
  severity: EditAssistantIssueSeverity;
  message: string;
  treeId?: string;
  nodePath?: string;
  uid?: number;
  title?: string;
}

export interface EditAssistantScanResult {
  issues: EditAssistantScanIssue[];
  scannedTreeIds: string[];
  missingTreeIds: string[];
  queueEmpty: boolean;
  groups: EditAssistantScanGroup[];
}

export interface EditAssistantScanGroup {
  scope: "queue" | "current" | "document";
  title: string;
  issues: EditAssistantScanIssue[];
  scannedTreeIds: string[];
  missingTreeIds: string[];
}

export interface EditAssistantScanOptions {
  queueTreeIds?: string[];
  currentTreeId?: string;
  warningWhitelist?: string[];
  language?: "zh-CN" | "en-US";
}

type ScanContext = {
  language: "zh-CN" | "en-US";
  issues: EditAssistantScanIssue[];
  warningWhitelist: Set<string>;
};

const INTEGER_ATTRIBUTE_NAMES = new Set([
  "success_count",
  "failure_count",
  "max_failures",
  "num_attempts",
  "num_cycles",
  "msec",
  "delay_msec"
]);

const STANDARD_BUILTIN_NODE_KINDS = new Set([
  "AlwaysFailure",
  "AlwaysSuccess",
  "AsyncFallback",
  "AsyncSequence",
  "Delay",
  "Fallback",
  "ForceFailure",
  "ForceSuccess",
  "IfThenElse",
  "Inverter",
  "KeepRunningUntilFailure",
  "LoopBool",
  "LoopDouble",
  "LoopInt",
  "LoopString",
  "Parallel",
  "ParallelAll",
  "Precondition",
  "ReactiveFallback",
  "ReactiveSequence",
  "Repeat",
  "RetryUntilFailure",
  "RetryUntilSuccessful",
  "RunOnce",
  "Script",
  "ScriptCondition",
  "Sequence",
  "SequenceWithMemory",
  "SetBlackboard",
  "SkipUnlessUpdated",
  "Sleep",
  "SubTree",
  "Switch",
  "Switch2",
  "Switch3",
  "Switch4",
  "Switch5",
  "Switch6",
  "Timeout",
  "TryCatch",
  "UnsetBlackboard",
  "WaitValueUpdate",
  "WasEntryUpdated",
  "WhileDoElse"
]);

export function scanEditAssistantRules(
  preview: BtPreviewDocument | null | undefined,
  options: EditAssistantScanOptions = {}
): EditAssistantScanResult {
  const language = options.language === "zh-CN" ? "zh-CN" : "en-US";
  const context: ScanContext = {
    language,
    issues: [],
    warningWhitelist: new Set(normalizeStringList(options.warningWhitelist))
  };

  if (!preview) {
    pushGlobalIssue(context, "no_preview", "error", text(language, "当前没有可扫描的行为树。", "No behavior tree is available to scan."));
    return {
      issues: context.issues,
      scannedTreeIds: [],
      missingTreeIds: [],
      queueEmpty: false,
      groups: [
        {
          scope: "document",
          title: text(language, "当前窗口", "Current window"),
          issues: context.issues,
          scannedTreeIds: [],
          missingTreeIds: []
        }
      ]
    };
  }

  const queueTreeIds = normalizeQueue(options.queueTreeIds);
  const treeMap = new Map((preview.behaviorTrees || []).map((tree) => [tree.id, tree]));
  const currentTreeId = String(options.currentTreeId || "").trim();
  const groups: EditAssistantScanGroup[] = [];

  if (queueTreeIds.length === 0) {
    groups.push(scanTreeGroup({
      context,
      treeMap,
      treeIds: currentTreeId ? [currentTreeId] : [],
      scope: "document",
      title: currentTreeId || text(language, "当前窗口", "Current window"),
      missingRuleId: "document_tree_missing",
      missingMessage: (treeId) =>
        text(language, `当前窗口中的子树 "${treeId}" 不存在。`, `Subtree "${treeId}" in the current window does not exist.`)
    }));
  } else {
    groups.push(scanTreeGroup({
      context,
      treeMap,
      treeIds: queueTreeIds,
      scope: "queue",
      title: text(language, "队列", "Queue"),
      missingRuleId: "queued_tree_missing",
      missingMessage: (treeId) =>
        text(language, `队列中的子树 "${treeId}" 不存在。`, `Queued subtree "${treeId}" does not exist.`)
    }));

    if (currentTreeId && !queueTreeIds.includes(currentTreeId)) {
      groups.push(scanTreeGroup({
        context,
        treeMap,
        treeIds: [currentTreeId],
        scope: "current",
        title: currentTreeId || text(language, "当前窗口", "Current window"),
        missingRuleId: "current_tree_missing",
        missingMessage: (treeId) =>
          text(language, `当前窗口中的子树 "${treeId}" 不存在。`, `Current window subtree "${treeId}" does not exist.`)
      }));
    }
  }

  return {
    issues: context.issues,
    scannedTreeIds: unique(groups.flatMap((group) => group.scannedTreeIds)),
    missingTreeIds: unique(groups.flatMap((group) => group.missingTreeIds)),
    queueEmpty: queueTreeIds.length === 0,
    groups
  };
}

function scanTreeGroup(options: {
  context: ScanContext;
  treeMap: Map<string, BtPreviewTree>;
  treeIds: string[];
  scope: EditAssistantScanGroup["scope"];
  title: string;
  missingRuleId: string;
  missingMessage: (treeId: string) => string;
}): EditAssistantScanGroup {
  const startIndex = options.context.issues.length;
  const scannedTreeIds: string[] = [];
  const missingTreeIds: string[] = [];
  const visitedTreeIds = new Set<string>();

  for (const treeId of options.treeIds) {
    scanTreeClosure(treeId, options, visitedTreeIds, scannedTreeIds, missingTreeIds);
  }

  return {
    scope: options.scope,
    title: options.title,
    issues: options.context.issues.slice(startIndex),
    scannedTreeIds,
    missingTreeIds
  };
}

function scanTreeClosure(
  treeId: string,
  options: {
    context: ScanContext;
    treeMap: Map<string, BtPreviewTree>;
    missingRuleId: string;
    missingMessage: (treeId: string) => string;
  },
  visitedTreeIds: Set<string>,
  scannedTreeIds: string[],
  missingTreeIds: string[]
): void {
  const normalizedTreeId = String(treeId || "").trim();
  if (!normalizedTreeId || visitedTreeIds.has(normalizedTreeId)) {
    return;
  }

  visitedTreeIds.add(normalizedTreeId);
  const tree = options.treeMap.get(normalizedTreeId);
  if (!tree) {
    missingTreeIds.push(normalizedTreeId);
    pushGlobalIssue(options.context, options.missingRuleId, "warning", options.missingMessage(normalizedTreeId), normalizedTreeId);
    return;
  }

  scannedTreeIds.push(tree.id);
  if (!tree.node) {
    pushGlobalIssue(
      options.context,
      "behavior_tree_missing_root",
      "error",
      text(options.context.language, `BehaviorTree "${tree.id}" 缺少根节点。`, `BehaviorTree "${tree.id}" is missing a root node.`),
      tree.id
    );
    return;
  }

  walkTree(tree.node, (node) => {
    scanNode(tree.id, node, options.context);
    if (node.kind === "SubTree" && node.targetTreeId && !visitedTreeIds.has(node.targetTreeId)) {
      scanTreeClosure(node.targetTreeId, options, visitedTreeIds, scannedTreeIds, missingTreeIds);
    }
  });
}

function scanNode(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  scanChildShape(treeId, node, context);
  scanIfThenElse(treeId, node, context);
  scanSwitch(treeId, node, context);
  scanRequiredLogicParams(treeId, node, context);
  scanCustomNodeEmptyParams(treeId, node, context);
  scanParallel(treeId, node, context);
  scanAttributeTypes(treeId, node, context);
}

function scanChildShape(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  const childCount = node.children.length;

  if (isLeafNode(node) && childCount > 0) {
    pushNodeIssue(
      context,
      "leaf_has_children",
      "error",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} ${node.title} 不能有子节点，当前有 ${childCount} 个。`,
        `#${node.uid} ${node.title} must not have child nodes, found ${childCount}.`
      )
    );
    return;
  }

  if (isDecoratorNode(node) && childCount !== 1) {
    pushNodeIssue(
      context,
      "decorator_child_count",
      "error",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} ${node.title} 必须且只能有 1 个子节点，当前有 ${childCount} 个。`,
        `#${node.uid} ${node.title} must have exactly 1 child node, found ${childCount}.`
      )
    );
    return;
  }

  if (isControlNode(node) && childCount === 0) {
    pushNodeIssue(
      context,
      "control_empty",
      "warning",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} ${node.title} 是 Control 节点，但没有子节点。`,
        `#${node.uid} ${node.title} is a Control node with no child nodes.`
      )
    );
  }
}

function scanIfThenElse(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  if (node.kind !== "IfThenElse") {
    return;
  }

  if (node.children.length !== 3) {
    pushNodeIssue(
      context,
      "if_then_else_child_count",
      "error",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} IfThenElse 必须固定包含 3 个子节点，当前有 ${node.children.length} 个。`,
        `#${node.uid} IfThenElse must contain exactly 3 child nodes, found ${node.children.length}.`
      )
    );
  }

  const firstChild = node.children[0];
  if (!firstChild || firstChild.kind !== "Precondition") {
    pushNodeIssue(
      context,
      "if_then_else_first_child",
      "error",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} IfThenElse 的第一个子节点必须是 Precondition。`,
        `#${node.uid} IfThenElse must use Precondition as the first child node.`
      )
    );
  }
}

function scanSwitch(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  const caseCount = getSwitchCaseCount(node);
  if (caseCount === 0) {
    return;
  }

  const expectedChildren = caseCount + 1;
  if (node.children.length !== expectedChildren) {
    pushNodeIssue(
      context,
      "switch_child_count",
      "error",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} ${node.title} 有 ${caseCount} 个 case，必须包含 ${caseCount} 个 case 分支和 1 个 default 分支，当前有 ${node.children.length} 个子节点。`,
        `#${node.uid} ${node.title} has ${caseCount} cases and must contain ${caseCount} case branches plus 1 default branch, found ${node.children.length} child nodes.`
      )
    );
  }
}

function scanRequiredLogicParams(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  if (node.kind === "Precondition") {
    requireAttribute(context, treeId, node, "if");
    requireAttribute(context, treeId, node, "else");
  }

  if (node.kind === "RetryUntilSuccessful") {
    requireAttribute(context, treeId, node, "num_attempts");
  }
}

function scanCustomNodeEmptyParams(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  if (isBuiltinNode(node) || isWhitelisted(node, context)) {
    return;
  }

  for (const field of node.attributeFields || []) {
    if (field.source === "extra" || field.source === "subtree" || field.editableValue === false || field.role === "output") {
      continue;
    }
    if (node.attributes?.[field.key] != null && String(node.attributes[field.key]).trim() !== "") {
      continue;
    }

    pushNodeIssue(
      context,
      "custom_parameter_empty",
      "warning",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} ${node.title} 的自定义参数 ${field.key} 未填写，请确认是否允许为空。`,
        `#${node.uid} ${node.title} custom parameter ${field.key} is empty; confirm whether this is intentional.`
      )
    );
  }
}

function scanParallel(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  if (node.kind !== "Parallel") {
    return;
  }

  requireAttribute(context, treeId, node, "success_count");
  requireAttribute(context, treeId, node, "failure_count");

  const successCount = parseIntegerAttribute(node.attributes.success_count);
  if (successCount == null) {
    return;
  }

  if (successCount > node.children.length) {
    pushNodeIssue(
      context,
      "parallel_success_count_exceeds_children",
      "error",
      treeId,
      node,
      text(
        context.language,
        `#${node.uid} Parallel 的 success_count=${successCount}，但只有 ${node.children.length} 个子节点。`,
        `#${node.uid} Parallel has success_count=${successCount}, but only ${node.children.length} child nodes are available.`
      )
    );
  }
}

function scanAttributeTypes(treeId: string, node: BtPreviewNode, context: ScanContext): void {
  for (const [key, value] of Object.entries(node.attributes || {})) {
    if (!INTEGER_ATTRIBUTE_NAMES.has(key) || String(value).trim() === "") {
      continue;
    }

    if (parseIntegerAttribute(value) == null) {
      pushNodeIssue(
        context,
        "invalid_parameter_type",
        "error",
        treeId,
        node,
        text(
          context.language,
          `#${node.uid} ${node.title} 的参数 ${key} 必须是整数，当前值为 "${value}"。`,
          `#${node.uid} ${node.title} parameter ${key} must be an integer, found "${value}".`
        )
      );
    }
  }
}

function requireAttribute(
  context: ScanContext,
  treeId: string,
  node: BtPreviewNode,
  key: string
): void {
  const value = node.attributes?.[key];
  if (typeof value === "string" && value.trim() !== "") {
    return;
  }

  pushNodeIssue(
    context,
    "required_parameter_missing",
    "error",
    treeId,
    node,
    text(
      context.language,
      `#${node.uid} ${node.title} 缺少必填参数 ${key}。`,
      `#${node.uid} ${node.title} is missing required parameter ${key}.`
    )
  );
}

function getSwitchCaseCount(node: BtPreviewNode): number {
  if (node.kind === "Switch") {
    return 2;
  }

  const kindMatch = node.kind.match(/^Switch([2-6])$/);
  if (kindMatch) {
    return Number(kindMatch[1]);
  }

  const fieldCaseCount = (node.attributeFields || []).filter((field) => /^case_\d+$/.test(field.key)).length;
  return fieldCaseCount > 0 ? fieldCaseCount : 0;
}

function isLeafNode(node: BtPreviewNode): boolean {
  return node.category === "Action" || node.category === "Condition" || node.category === "SubTree";
}

function isDecoratorNode(node: BtPreviewNode): boolean {
  return node.category === "Decorator";
}

function isControlNode(node: BtPreviewNode): boolean {
  return node.category === "Control";
}

function isBuiltinNode(node: BtPreviewNode): boolean {
  return STANDARD_BUILTIN_NODE_KINDS.has(node.kind);
}

function isWhitelisted(node: BtPreviewNode, context: ScanContext): boolean {
  const candidates = [node.kind, node.title, node.modelKind, node.attributes?.ID].filter((value): value is string => Boolean(value));
  return candidates.some((candidate) => context.warningWhitelist.has(candidate));
}

function parseIntegerAttribute(value: string | undefined): number | null {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  if (!/^-?\d+$/.test(String(value).trim())) {
    return null;
  }

  return Number(value);
}

function walkTree(node: BtPreviewNode, visitor: (node: BtPreviewNode) => void): void {
  visitor(node);
  node.children.forEach((child) => walkTree(child, visitor));
}

function normalizeQueue(queueTreeIds: string[] | undefined): string[] {
  return normalizeStringList(queueTreeIds);
}

function normalizeStringList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function pushGlobalIssue(
  context: ScanContext,
  ruleId: string,
  severity: EditAssistantIssueSeverity,
  message: string,
  treeId?: string
): void {
  context.issues.push({
    id: `${ruleId}:${treeId || context.issues.length}`,
    ruleId,
    severity,
    message,
    treeId
  });
}

function pushNodeIssue(
  context: ScanContext,
  ruleId: string,
  severity: EditAssistantIssueSeverity,
  treeId: string,
  node: BtPreviewNode,
  message: string
): void {
  context.issues.push({
    id: `${treeId}:${node.nodePath}:${ruleId}:${context.issues.length}`,
    ruleId,
    severity,
    message,
    treeId,
    nodePath: node.nodePath,
    uid: node.uid,
    title: node.title
  });
}

function text(language: "zh-CN" | "en-US", zh: string, en: string): string {
  return language === "zh-CN" ? zh : en;
}
