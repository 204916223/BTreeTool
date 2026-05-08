import test from "node:test";
import assert from "node:assert/strict";
import { BtDocumentAst } from "../core/btAst";
import { serializeBehaviorTreeDocument } from "../core/serialize";

function createDocument(): BtDocumentAst {
  return {
    xmlDeclaration: null,
    rootTagName: "root",
    rootAttributes: {},
    mainTreeToExecute: "MainTree",
    includes: [],
    behaviorTrees: [
      {
        id: "MainTree",
        node: {
          tagName: "Sequence",
          attributes: {},
          children: [
            {
              tagName: "ActionA",
              attributes: {},
              children: []
            }
          ]
        }
      },
      {
        id: "Secondary",
        node: {
          tagName: "ActionB",
          attributes: {},
          children: []
        }
      }
    ],
    nodeModels: [],
    topLevelOrder: ["behaviorTree", "behaviorTree"],
    warnings: []
  };
}

test("serializeBehaviorTreeDocument inserts a blank line before each BehaviorTree block", () => {
  const output = serializeBehaviorTreeDocument(createDocument());

  assert.equal(
    output,
    [
      '<root BTCPP_format="4" main_tree_to_execute="MainTree">',
      "",
      "  <BehaviorTree ID=\"MainTree\">",
      "    <Sequence>",
      "      <ActionA />",
      "    </Sequence>",
      "  </BehaviorTree>",
      "",
      "  <BehaviorTree ID=\"Secondary\">",
      "    <ActionB />",
      "  </BehaviorTree>",
      "</root>",
      ""
    ].join("\n")
  );
});

test("serializeBehaviorTreeDocument orders BehaviorTree and TreeNodesModel entries by id", () => {
  const document = createDocument();
  document.behaviorTrees = [
    { id: "Servo", node: null },
    { id: "report", node: null },
    { id: "SafeCheck", node: null },
    { id: "SpeedController", node: null }
  ];
  document.nodeModels = [
    { id: "SpeedManager", modelKind: "Action", attributes: { ID: "SpeedManager" }, ports: [] },
    { id: "ReportSchedule", modelKind: "Action", attributes: { ID: "ReportSchedule" }, ports: [] },
    { id: "ServoStatus", modelKind: "Action", attributes: { ID: "ServoStatus" }, ports: [] },
    {
      id: "ResetEStopStatusCheck",
      modelKind: "Action",
      attributes: { ID: "ResetEStopStatusCheck" },
      ports: []
    }
  ];
  document.topLevelOrder = ["behaviorTree", "behaviorTree", "behaviorTree", "behaviorTree", "treeNodesModel"];

  const output = serializeBehaviorTreeDocument(document);

  assert.deepEqual(
    Array.from(output.matchAll(/<BehaviorTree ID="([^"]+)"/g), (match) => match[1]),
    ["report", "SafeCheck", "Servo", "SpeedController"]
  );
  assert.deepEqual(
    Array.from(output.matchAll(/<Action ID="([^"]+)"/g), (match) => match[1]),
    ["ReportSchedule", "ResetEStopStatusCheck", "ServoStatus", "SpeedManager"]
  );
});
