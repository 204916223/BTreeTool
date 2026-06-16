import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { parseBehaviorTreeDocument } = await import("../dist/core/parse.js");
const { buildPreviewDocument } = await import("../dist/core/viewModel.js");
const { scanEditAssistantRules } = await import("../dist/core/editAssistantScan.js");
Module._load = originalLoad;

function scanXml(xml, queueTreeIds = ["MainTree"], currentTreeId = "MainTree") {
  const ast = parseBehaviorTreeDocument(xml);
  const preview = buildPreviewDocument(ast);
  return scanEditAssistantRules(preview, {
    queueTreeIds,
    currentTreeId,
    language: "zh-CN"
  });
}

test("edit assistant scan reports structural and logic rule issues with uids", () => {
  const result = scanXml(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence>
      <IfThenElse>
        <AlwaysSuccess />
        <AlwaysSuccess />
      </IfThenElse>
      <Switch3 variable="{mode}" case_1="a" case_2="b" case_3="c">
        <AlwaysSuccess />
        <AlwaysFailure />
        <AlwaysSuccess />
      </Switch3>
      <RetryUntilSuccessful>
        <AlwaysSuccess />
        <AlwaysFailure />
      </RetryUntilSuccessful>
    </Sequence>
  </BehaviorTree>
</root>
`);

  assert.deepEqual(result.scannedTreeIds, ["MainTree"]);
  assert.equal(result.queueEmpty, false);

  const ruleIds = result.issues.map((issue) => issue.ruleId);
  assert.ok(ruleIds.includes("if_then_else_child_count"));
  assert.ok(ruleIds.includes("if_then_else_first_child"));
  assert.ok(ruleIds.includes("switch_child_count"));
  assert.ok(ruleIds.includes("decorator_child_count"));
  assert.ok(ruleIds.includes("required_parameter_missing"));
  assert.equal(result.issues.every((issue) => typeof issue.uid === "number"), true);
});

test("edit assistant scan checks Parallel required counts, threshold, and integer types", () => {
  const result = scanXml(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Parallel success_count="3" failure_count="x">
      <AlwaysSuccess />
      <AlwaysFailure />
    </Parallel>
  </BehaviorTree>
</root>
`);

  const ruleIds = result.issues.map((issue) => issue.ruleId);
  assert.ok(ruleIds.includes("parallel_success_count_exceeds_children"));
  assert.ok(ruleIds.includes("invalid_parameter_type"));
  assert.equal(ruleIds.includes("required_parameter_missing"), false);
});

test("edit assistant scan respects the explicit tree queue", () => {
  const result = scanXml(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence>
      <AlwaysSuccess />
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="BrokenTree">
    <Sequence />
  </BehaviorTree>
</root>
`, ["MainTree", "MissingTree"]);

  assert.deepEqual(result.scannedTreeIds, ["MainTree"]);
  assert.deepEqual(result.missingTreeIds, ["MissingTree"]);
  assert.deepEqual(
    result.issues.map((issue) => issue.ruleId),
    ["queued_tree_missing"]
  );
});

test("edit assistant scan scans only the current tree closure when the queue is empty", () => {
  const result = scanXml(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence>
      <SubTree ID="SupportTree" />
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="SupportTree">
    <Sequence />
  </BehaviorTree>
  <BehaviorTree ID="BrokenTree">
    <Sequence />
  </BehaviorTree>
</root>
`, []);

  assert.equal(result.queueEmpty, true);
  assert.deepEqual(result.scannedTreeIds, ["MainTree", "SupportTree"]);
  assert.deepEqual(result.groups.map((group) => group.scope), ["document"]);
  assert.deepEqual(
    result.issues.map((issue) => issue.ruleId),
    ["control_empty"]
  );
});

test("edit assistant scan separates queue and current window scopes", () => {
  const result = scanXml(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence />
  </BehaviorTree>
  <BehaviorTree ID="CurrentTree">
    <Parallel success_count="3" failure_count="1">
      <AlwaysSuccess />
    </Parallel>
  </BehaviorTree>
</root>
`, ["MainTree"], "CurrentTree");

  assert.deepEqual(result.groups.map((group) => group.scope), ["queue", "current"]);
  assert.deepEqual(result.groups[0].scannedTreeIds, ["MainTree"]);
  assert.deepEqual(result.groups[1].scannedTreeIds, ["CurrentTree"]);
  assert.deepEqual(result.groups[0].issues.map((issue) => issue.ruleId), ["control_empty"]);
  assert.deepEqual(result.groups[1].issues.map((issue) => issue.ruleId), ["parallel_success_count_exceeds_children"]);
});

test("edit assistant scan omits current window scope when current tree is queued", () => {
  const result = scanXml(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence />
  </BehaviorTree>
</root>
`, ["MainTree"], "MainTree");

  assert.deepEqual(result.groups.map((group) => group.scope), ["queue"]);
});

test("edit assistant scan follows subtree references from the current tree only", () => {
  const result = scanXml(`
<root main_tree_to_execute="EnterServo">
  <BehaviorTree ID="EnterServo">
    <Sequence>
      <SubTree ID="EnterCarrierCtrl" />
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="EnterCarrierCtrl">
    <Sequence>
      <SubTree ID="EnterHeightServo" />
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="EnterHeightServo">
    <Sequence />
  </BehaviorTree>
  <BehaviorTree ID="UnusedTree">
    <Sequence />
  </BehaviorTree>
</root>
`, [], "EnterServo");

  assert.deepEqual(result.scannedTreeIds, ["EnterServo", "EnterCarrierCtrl", "EnterHeightServo"]);
  assert.deepEqual(result.groups[0].scannedTreeIds, ["EnterServo", "EnterCarrierCtrl", "EnterHeightServo"]);
  assert.equal(result.scannedTreeIds.includes("UnusedTree"), false);
});
