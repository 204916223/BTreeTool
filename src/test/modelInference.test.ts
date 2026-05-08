import test from "node:test";
import assert from "node:assert/strict";
import { parseBehaviorTreeDocument } from "../core/parse";
import { serializeBehaviorTreeDocument } from "../core/serialize";

test("parseBehaviorTreeDocument infers missing TreeNodesModel entries", () => {
  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <MyControl speed="1">
      <MyLeaf foo="bar" />
      <Decorator ID="CustomDecorator" retries="3">
        <Action ID="CustomAction" target="goal" />
      </Decorator>
    </MyControl>
  </BehaviorTree>
</root>
`);

  assert.deepEqual(
    document.nodeModels.map((model) => ({
      id: model.id,
      modelKind: model.modelKind,
      ports: model.ports.map((port) => ({ tagName: port.tagName, attributes: port.attributes }))
    })),
    [
      {
        id: "MyControl",
        modelKind: "Control",
        ports: [
          {
            tagName: "input_port",
            attributes: { name: "speed", default: "1" }
          }
        ]
      },
      {
        id: "MyLeaf",
        modelKind: "Action",
        ports: [
          {
            tagName: "input_port",
            attributes: { name: "foo", default: "bar" }
          }
        ]
      },
      {
        id: "CustomDecorator",
        modelKind: "Decorator",
        ports: [
          {
            tagName: "input_port",
            attributes: { name: "retries", default: "3" }
          }
        ]
      },
      {
        id: "CustomAction",
        modelKind: "Action",
        ports: [
          {
            tagName: "input_port",
            attributes: { name: "target", default: "goal" }
          }
        ]
      }
    ]
  );
  assert.equal(document.warnings.some((warning) => warning.code === "unknown_node_type"), false);
});

test("serializeBehaviorTreeDocument writes inferred TreeNodesModel entries back to XML", () => {
  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <MyDecorator speed="1">
      <MyLeaf foo="bar" />
    </MyDecorator>
  </BehaviorTree>
</root>
`);

  const output = serializeBehaviorTreeDocument(document);

  assert.match(output, /<TreeNodesModel>/);
  assert.match(output, /<Action ID="MyLeaf">/);
  assert.match(output, /<Decorator ID="MyDecorator">/);
  assert.match(output, /<input_port name="speed" default="1" \/>/);
  assert.match(output, /<input_port name="foo" default="bar" \/>/);
});
