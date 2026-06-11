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

test("parseBehaviorTreeDocument preserves preset port directions when inferring models", () => {
  const settings = {
    presetNodes: [
      {
        key: "ServoStatus",
        title: "ServoStatus",
        category: "Condition",
        modelKind: "Condition",
        allowCustomAttributes: true,
        fields: [
          {
            key: "target_status",
            role: "input",
            required: true,
            editableKey: false,
            editableValue: true,
            removable: false,
            defaultValue: ""
          },
          {
            key: "servo_status",
            role: "output",
            required: true,
            editableKey: false,
            editableValue: true,
            removable: false,
            defaultValue: "{servo_status}"
          },
          {
            key: "shared_state",
            role: "inout",
            required: false,
            editableKey: false,
            editableValue: true,
            removable: false,
            defaultValue: ""
          }
        ]
      }
    ]
  } as any;

  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <ServoStatus target_status="{target_status}" servo_status="{servo_status}" shared_state="{shared_state}" />
  </BehaviorTree>
</root>
`, settings);

  assert.deepEqual(
    document.nodeModels.find((model) => model.id === "ServoStatus")?.ports.map((port) => [
      port.tagName,
      port.attributes.name
    ]),
    [
      ["input_port", "target_status"],
      ["output_port", "servo_status"],
      ["inout_port", "shared_state"]
    ]
  );

  const output = serializeBehaviorTreeDocument(document);
  const reparsedWithoutSettings = parseBehaviorTreeDocument(output);

  assert.deepEqual(
    reparsedWithoutSettings.nodeModels.find((model) => model.id === "ServoStatus")?.ports.map((port) => [
      port.tagName,
      port.attributes.name
    ]),
    [
      ["input_port", "target_status"],
      ["output_port", "servo_status"],
      ["inout_port", "shared_state"]
    ]
  );
});

test("parseBehaviorTreeDocument corrects previously inferred port directions from presets", () => {
  const settings = {
    presetNodes: [
      {
        key: "ServoStatus",
        title: "ServoStatus",
        category: "Condition",
        modelKind: "Condition",
        allowCustomAttributes: true,
        fields: [
          {
            key: "servo_status",
            role: "output",
            required: true,
            editableKey: false,
            editableValue: true,
            removable: false,
            defaultValue: ""
          }
        ]
      }
    ]
  } as any;

  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <ServoStatus servo_status="{servo_status}" />
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="ServoStatus">
      <input_port name="servo_status" default="{servo_status}" />
    </Condition>
  </TreeNodesModel>
</root>
`, settings);

  assert.equal(
    document.nodeModels
      .find((model) => model.id === "ServoStatus")
      ?.ports.find((port) => port.attributes.name === "servo_status")?.tagName,
    "output_port"
  );
});
