import { BtNodeAst, BtWarning } from "./btAst";

export const BLOCKING_WARNING_CODES = new Set([
  "empty_document",
  "unexpected_root_tag",
  "empty_behavior_tree",
  "missing_subtree_target",
  "missing_subtree_definition",
  "missing_explicit_node_id",
  "invalid_decorator_children",
  "invalid_leaf_children",
  "empty_control_node",
  "multiple_root_nodes",
  "invalid_parallel_success_count",
  "invalid_parallel_failure_count",
  "parallel_success_count_exceeds_children",
  "parallel_failure_count_exceeds_children"
]);

export function isBlockingWarning(warning: BtWarning): boolean {
  return warning.severity === "error" || BLOCKING_WARNING_CODES.has(warning.code);
}

export function validateNodeSemantics(
  node: BtNodeAst,
  warnings: BtWarning[],
  scopedNode: string,
  treeId: string,
  nodePath: string
): void {
  if (node.tagName === "Parallel" || node.tagName === "ParallelAll") {
    validateParallelThreshold(node, "success_count", warnings, scopedNode, treeId, nodePath);
    validateParallelThreshold(node, "failure_count", warnings, scopedNode, treeId, nodePath);
  }
}

function validateParallelThreshold(
  node: BtNodeAst,
  key: "success_count" | "failure_count",
  warnings: BtWarning[],
  scopedNode: string,
  treeId: string,
  nodePath: string
): void {
  const rawValue = node.attributes[key];
  if (rawValue == null || rawValue === "") {
    return;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue)) {
    warnings.push({
      code: `invalid_parallel_${key}`,
      message: `Parallel node ${scopedNode} has a non-integer ${key} value "${rawValue}".`,
      severity: "warning",
      treeId,
      nodePath
    });
    return;
  }

  if (parsedValue === 0 || parsedValue < -1) {
    warnings.push({
      code: `invalid_parallel_${key}`,
      message: `Parallel node ${scopedNode} has an invalid ${key} value "${rawValue}". Use -1 or a positive integer.`,
      severity: "warning",
      treeId,
      nodePath
    });
    return;
  }

  if (parsedValue > node.children.length) {
    warnings.push({
      code: `parallel_${key}_exceeds_children`,
      message: `Parallel node ${scopedNode} sets ${key}=${parsedValue}, but only ${node.children.length} child nodes are available.`,
      severity: "warning",
      treeId,
      nodePath
    });
  }
}
