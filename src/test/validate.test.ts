import test from "node:test";
import assert from "node:assert/strict";
import { parseBehaviorTreeDocument } from "../core/parse";
import { isBlockingWarning } from "../core/issueRules";

test("unknown compact node tags are inferred from their child shape", () => {
  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <UnknownControl>
      <UnknownLeaf />
      <UnknownDecorator>
        <AnotherUnknownLeaf />
      </UnknownDecorator>
    </UnknownControl>
  </BehaviorTree>
</root>
`);

  assert.deepEqual(document.warnings.map((warning) => warning.code), []);
  assert.equal(document.warnings.some(isBlockingWarning), false);
  assert.deepEqual(
    document.nodeModels.map((model) => model.id),
    ["UnknownControl", "UnknownLeaf", "UnknownDecorator", "AnotherUnknownLeaf"]
  );
});

test("unknown explicit syntax nodes use their XML category", () => {
  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Control ID="CustomControl">
      <Action ID="CustomAction" />
      <Decorator ID="CustomDecorator">
        <Condition ID="CustomCondition" />
      </Decorator>
    </Control>
  </BehaviorTree>
</root>
`);

  assert.deepEqual(document.warnings.map((warning) => warning.code), []);
  assert.equal(document.warnings.some(isBlockingWarning), false);
  assert.deepEqual(
    document.nodeModels.map((model) => model.id),
    ["CustomControl", "CustomAction", "CustomDecorator", "CustomCondition"]
  );
});

test("empty BehaviorTree is a blocking virtual root warning", () => {
  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="EmptyTree">
  <BehaviorTree ID="EmptyTree">
  </BehaviorTree>
</root>
`);

  const warning = document.warnings.find((entry) => entry.code === "empty_behavior_tree");
  assert.equal(warning?.treeId, "EmptyTree");
  assert.equal(warning?.nodePath, "__btree_root__");
  assert.equal(warning ? isBlockingWarning(warning) : false, true);
});
