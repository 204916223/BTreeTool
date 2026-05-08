import test from "node:test";
import assert from "node:assert/strict";
import { BtNodeAst, BtWarning } from "../core/btAst";
import { isBlockingWarning, validateNodeSemantics } from "../core/issueRules";

function createNode(
  tagName: string,
  attributes: Record<string, string> = {},
  children: BtNodeAst[] = []
): BtNodeAst {
  return {
    tagName,
    attributes,
    children
  };
}

test("isBlockingWarning treats semantic blocking codes as blocking", () => {
  const warning: BtWarning = {
    code: "parallel_success_count_exceeds_children",
    message: "invalid",
    severity: "warning"
  };

  assert.equal(isBlockingWarning(warning), true);
});

test("isBlockingWarning treats unknown nodes as non-blocking", () => {
  const warning: BtWarning = {
    code: "unknown_node_type",
    message: "unknown",
    severity: "warning"
  };

  assert.equal(isBlockingWarning(warning), false);
});

test("validateNodeSemantics flags parallel thresholds above child count", () => {
  const warnings: BtWarning[] = [];
  const node = createNode(
    "Parallel",
    {
      success_count: "3",
      failure_count: "1"
    },
    [createNode("AlwaysSuccess"), createNode("AlwaysFailure")]
  );

  validateNodeSemantics(node, warnings, "Parallel", "MainTree", "0");

  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ["parallel_success_count_exceeds_children"]
  );
});

test("validateNodeSemantics accepts legal parallel thresholds", () => {
  const warnings: BtWarning[] = [];
  const node = createNode(
    "ParallelAll",
    {
      success_count: "-1",
      failure_count: "2"
    },
    [createNode("AlwaysSuccess"), createNode("AlwaysFailure")]
  );

  validateNodeSemantics(node, warnings, "ParallelAll", "MainTree", "0");

  assert.equal(warnings.length, 0);
});
