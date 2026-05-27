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

const { buildPreviewDocument } = await import("../dist/core/viewModel.js");
Module._load = originalLoad;

function createDocument() {
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
              tagName: "SubTree",
              attributes: { ID: "Target" },
              children: []
            }
          ]
        }
      },
      {
        id: "Caller",
        node: {
          tagName: "SubTree",
          attributes: { ID: "Target" },
          children: []
        }
      },
      {
        id: "Target",
        node: {
          tagName: "AlwaysSuccess",
          attributes: {},
          children: []
        }
      },
      {
        id: "Detached",
        node: {
          tagName: "AlwaysSuccess",
          attributes: {},
          children: []
        }
      }
    ],
    nodeModels: [],
    topLevelOrder: ["behaviorTree", "behaviorTree", "behaviorTree", "behaviorTree"],
    warnings: []
  };
}

test("buildPreviewDocument marks only detached non-entry behavior trees in the SubTree catalog", () => {
  const preview = buildPreviewDocument(createDocument());
  const subtreeGroup = preview.catalog.find((group) => group.category === "SubTree");
  assert.ok(subtreeGroup);

  const byKey = new Map(subtreeGroup.items.map((item) => [item.key, item]));
  assert.equal(byKey.get("SubTree")?.isDetachedTree, false);
  assert.equal(byKey.get("MainTree")?.isDetachedTree, false);
  assert.equal(byKey.get("MainTree")?.removableTreeId, null);
  assert.equal(byKey.get("Caller")?.isDetachedTree, false);
  assert.equal(byKey.get("Target")?.isDetachedTree, false);
  assert.equal(byKey.get("Detached")?.isDetachedTree, true);
  assert.equal(byKey.get("Detached")?.removableTreeId, "Detached");
});

test("buildPreviewDocument keeps model ports visible even when node attributes are empty", () => {
  const document = createDocument();
  document.behaviorTrees = [
    {
      id: "MainTree",
      node: {
        tagName: "ServoStatus",
        attributes: {
          errorMsg: "{errorMsg}"
        },
        children: []
      }
    }
  ];
  document.nodeModels = [
    {
      id: "ServoStatus",
      modelKind: "Action",
      attributes: { ID: "ServoStatus" },
      ports: [
        { tagName: "input_port", attributes: { name: "target_status" } },
        { tagName: "output_port", attributes: { name: "servo_status" } },
        { tagName: "output_port", attributes: { name: "errorMsg" } },
        { tagName: "output_port", attributes: { name: "out_error_id" } },
        { tagName: "inout_port", attributes: { name: "shared_state" } }
      ]
    }
  ];

  const preview = buildPreviewDocument(document);
  const node = preview.behaviorTrees[0].node;

  assert.deepEqual(
    node.attributeFields.map((field) => [field.key, field.value, field.role]),
    [
      ["target_status", "", "input"],
      ["servo_status", "", "output"],
      ["errorMsg", "{errorMsg}", "output"],
      ["out_error_id", "", "output"],
      ["shared_state", "", "inout"]
    ]
  );
  assert.deepEqual(
    node.ioGroups.inputs.map((field) => [field.key, field.value]),
    [
      ["target_status", ""],
      ["shared_state", ""]
    ]
  );
  assert.deepEqual(
    node.ioGroups.outputs.map((field) => [field.key, field.value]),
    [
      ["servo_status", ""],
      ["errorMsg", "{errorMsg}"],
      ["out_error_id", ""],
      ["shared_state", ""]
    ]
  );
});

test("buildPreviewDocument classifies builtin decorators without relying on children", () => {
  const document = createDocument();
  document.behaviorTrees = [
    {
      id: "MainTree",
      node: {
        tagName: "KeepRunningUntilFailure",
        attributes: {},
        children: []
      }
    }
  ];

  const preview = buildPreviewDocument(document);
  const node = preview.behaviorTrees[0].node;

  assert.equal(node.category, "Decorator");
  assert.equal(node.modelKind, "Decorator");
});
