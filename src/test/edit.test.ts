import test from "node:test";
import assert from "node:assert/strict";
import { BtDocumentAst } from "../core/btAst";
import { parseBehaviorTreeDocument } from "../core/parse";
import { serializeBehaviorTreeDocument } from "../core/serialize";
import {
  createBehaviorTree,
  deleteBehaviorTree,
  deleteNode,
  findBehaviorTreeReferences,
  insertNode,
  insertNodeCopy,
  mergeCopiedNodeModels,
  renameBehaviorTree,
  replaceNodeModels
} from "../core/edit";

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
              attributes: { foo: "bar" },
              children: [
                {
                  tagName: "NestedAction",
                  attributes: {},
                  children: []
                }
              ]
            }
          ]
        }
      }
    ],
    nodeModels: [],
    topLevelOrder: ["behaviorTree"],
    warnings: []
  };
}

test("insertNodeCopy inserts a shallow node copy without children", () => {
  const document = createDocument();

  const insertedPath = insertNodeCopy(document, "MainTree", "0", 1, {
    tagName: "ActionA",
    attributes: { foo: "bar" }
  });

  const root = document.behaviorTrees[0].node;
  assert.equal(insertedPath, "0.1");
  assert.equal(root?.children.length, 2);
  assert.deepEqual(root?.children[1], {
    tagName: "ActionA",
    attributes: { foo: "bar" },
    children: []
  });
});

test("insertNodeCopy inserts a copied subtree when children are included", () => {
  const document = createDocument();

  const insertedPath = insertNodeCopy(document, "MainTree", "0", 1, {
    tagName: "ActionA",
    attributes: { foo: "bar" },
    children: [
      {
        tagName: "NestedAction",
        attributes: { depth: "1" },
        children: [
          {
            tagName: "LeafAction",
            attributes: { depth: "2" },
            children: []
          }
        ]
      }
    ]
  });

  const root = document.behaviorTrees[0].node;
  assert.equal(insertedPath, "0.1");
  assert.deepEqual(root?.children[1], {
    tagName: "ActionA",
    attributes: { foo: "bar" },
    children: [
      {
        tagName: "NestedAction",
        attributes: { depth: "1" },
        children: [
          {
            tagName: "LeafAction",
            attributes: { depth: "2" },
            children: []
          }
        ]
      }
    ]
  });
});

test("mergeCopiedNodeModels preserves copied port directions in the target document", () => {
  const document = createDocument();
  document.nodeModels = [
    {
      id: "Calculate",
      modelKind: "Action",
      attributes: { ID: "Calculate" },
      ports: [
        { tagName: "input_port", attributes: { name: "result" } },
        { tagName: "input_port", attributes: { name: "target_only" } }
      ]
    }
  ];
  document.topLevelOrder.push("treeNodesModel");

  mergeCopiedNodeModels(document, [
    {
      id: "Calculate",
      modelKind: "Action",
      attributes: { ID: "Calculate" },
      ports: [
        { tagName: "input_port", attributes: { name: "source" } },
        { tagName: "output_port", attributes: { name: "result" } }
      ]
    }
  ]);

  assert.deepEqual(document.nodeModels[0].ports, [
    { tagName: "output_port", attributes: { name: "result" } },
    { tagName: "input_port", attributes: { name: "target_only" } },
    { tagName: "input_port", attributes: { name: "source" } }
  ]);
});

test("mergeCopiedNodeModels adds a missing model for cross-document paste", () => {
  const document = createDocument();

  mergeCopiedNodeModels(document, [
    {
      id: "Calculate",
      modelKind: "Action",
      attributes: { ID: "Calculate" },
      ports: [
        { tagName: "input_port", attributes: { name: "source" } },
        { tagName: "output_port", attributes: { name: "result" } },
        { tagName: "inout_port", attributes: { name: "state" } }
      ]
    }
  ]);

  assert.deepEqual(document.nodeModels, [
    {
      id: "Calculate",
      modelKind: "Action",
      attributes: { ID: "Calculate" },
      ports: [
        { tagName: "input_port", attributes: { name: "source" } },
        { tagName: "output_port", attributes: { name: "result" } },
        { tagName: "inout_port", attributes: { name: "state" } }
      ]
    }
  ]);
  assert.equal(document.topLevelOrder.at(-1), "treeNodesModel");
});

test("createBehaviorTree adds a valid AlwaysSuccess placeholder tree", () => {
  const document = createDocument();

  createBehaviorTree(document, "SafeCheck");

  assert.equal(document.topLevelOrder.at(-1), "behaviorTree");
  assert.deepEqual(document.behaviorTrees.at(-1), {
    id: "SafeCheck",
    node: {
      tagName: "AlwaysSuccess",
      attributes: {},
      children: []
    }
  });
});

test("insertNode can create the first real child under the virtual root", () => {
  const document = createDocument();
  document.behaviorTrees.push({
    id: "EmptyTree",
    node: null
  });
  document.topLevelOrder.push("behaviorTree");

  const insertedPath = insertNode(document, "EmptyTree", "__btree_root__", 0, "Sequence", "Control");

  assert.equal(insertedPath, "0");
  assert.deepEqual(document.behaviorTrees[1].node, {
    tagName: "Sequence",
    attributes: {},
    children: []
  });
});

test("insertNode wraps the root node when adding to the virtual root", () => {
  const document = createDocument();

  const insertedPath = insertNode(document, "MainTree", "__btree_root__", 0, "Sequence", "Control");

  assert.equal(insertedPath, "0");
  assert.deepEqual(document.behaviorTrees[0].node, {
    tagName: "Sequence",
    attributes: {},
    children: [
      {
        tagName: "Sequence",
        attributes: {},
        children: [
          {
            tagName: "ActionA",
            attributes: { foo: "bar" },
            children: [
              {
                tagName: "NestedAction",
                attributes: {},
                children: []
              }
            ]
          }
        ]
      }
    ]
  });
});

test("deleteNode can remove the real root and leave an empty virtual root", () => {
  const document = createDocument();

  const nextSelection = deleteNode(document, "MainTree", "0");

  assert.equal(nextSelection, "__btree_root__");
  assert.equal(document.behaviorTrees[0].node, null);
});

test("deleteBehaviorTree removes a non-entry tree", () => {
  const document = createDocument();
  createBehaviorTree(document, "SafeCheck");

  deleteBehaviorTree(document, "SafeCheck");

  assert.deepEqual(document.behaviorTrees.map((tree) => tree.id), ["MainTree"]);
  assert.deepEqual(document.topLevelOrder, ["behaviorTree"]);
});

test("renameBehaviorTree updates the tree id and SubTree references", () => {
  const document = createDocument();
  document.behaviorTrees[0].node?.children.push({
    tagName: "SubTree",
    attributes: { ID: "SafeCheck" },
    children: []
  });
  document.behaviorTrees.push({
    id: "SafeCheck",
    node: {
      tagName: "Sequence",
      attributes: {},
      children: [
        {
          tagName: "SubTree",
          attributes: { ID: "SafeCheck" },
          children: []
        }
      ]
    }
  });

  renameBehaviorTree(document, "SafeCheck", "SafetyGate");

  assert.deepEqual(document.behaviorTrees.map((tree) => tree.id), ["MainTree", "SafetyGate"]);
  assert.equal(document.behaviorTrees[0].node?.children.at(-1)?.attributes.ID, "SafetyGate");
  assert.equal(document.behaviorTrees[1].node?.children[0].attributes.ID, "SafetyGate");
});

test("renameBehaviorTree updates the entry tree target", () => {
  const document = createDocument();

  renameBehaviorTree(document, "MainTree", "RootTree");

  assert.equal(document.mainTreeToExecute, "RootTree");
  assert.deepEqual(document.behaviorTrees.map((tree) => tree.id), ["RootTree"]);
});

test("renameBehaviorTree rejects duplicate names", () => {
  const document = createDocument();
  createBehaviorTree(document, "SafeCheck");

  assert.throws(
    () => renameBehaviorTree(document, "SafeCheck", "MainTree"),
    /already exists/
  );
});

test("findBehaviorTreeReferences lists trees that point to a subtree", () => {
  const document = createDocument();
  document.behaviorTrees[0].node?.children.push({
    tagName: "SubTree",
    attributes: { ID: "SafeCheck" },
    children: []
  });
  document.behaviorTrees.push({
    id: "Report",
    node: {
      tagName: "Sequence",
      attributes: {},
      children: [
        {
          tagName: "SubTree",
          attributes: { ID: "SafeCheck" },
          children: []
        }
      ]
    }
  });
  document.behaviorTrees.push({
    id: "SafeCheck",
    node: {
      tagName: "SubTree",
      attributes: { ID: "SafeCheck" },
      children: []
    }
  });

  assert.deepEqual(findBehaviorTreeReferences(document, "SafeCheck"), ["MainTree", "Report"]);
});

test("deleteBehaviorTree rejects removing a referenced subtree", () => {
  const document = createDocument();
  createBehaviorTree(document, "SafeCheck");
  document.behaviorTrees[0].node?.children.push({
    tagName: "SubTree",
    attributes: { ID: "SafeCheck" },
    children: []
  });

  assert.throws(
    () => deleteBehaviorTree(document, "SafeCheck"),
    /referenced by: MainTree/
  );
  assert.deepEqual(document.behaviorTrees.map((tree) => tree.id), ["MainTree", "SafeCheck"]);
});

test("deleteBehaviorTree rejects removing the entry tree", () => {
  const document = createDocument();

  assert.throws(
    () => deleteBehaviorTree(document, "MainTree"),
    /current entry tree/
  );
});

test("replaceNodeModels removes deleted ports from matching node instances", () => {
  const document = parseBehaviorTreeDocument(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence>
      <ActionA foo="1" keep="2" extra="3" />
      <Action ID="ExplicitAction" foo="4" keep="5" />
      <OtherAction foo="6" keep="7" />
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ActionA">
      <input_port name="foo" />
      <input_port name="keep" />
    </Action>
    <Action ID="ExplicitAction">
      <input_port name="foo" />
      <input_port name="keep" />
    </Action>
    <Action ID="OtherAction">
      <input_port name="foo" />
      <input_port name="keep" />
    </Action>
  </TreeNodesModel>
</root>
`);

  replaceNodeModels(document, [
    {
      id: "ActionA",
      modelKind: "Action",
      attributes: { ID: "ActionA" },
      ports: [{ tagName: "input_port", attributes: { name: "keep" } }]
    },
    {
      id: "ExplicitAction",
      modelKind: "Action",
      attributes: { ID: "ExplicitAction" },
      ports: [{ tagName: "input_port", attributes: { name: "keep" } }]
    },
    {
      id: "OtherAction",
      modelKind: "Action",
      attributes: { ID: "OtherAction" },
      ports: [
        { tagName: "input_port", attributes: { name: "foo" } },
        { tagName: "input_port", attributes: { name: "keep" } }
      ]
    }
  ]);

  const output = serializeBehaviorTreeDocument(document);
  assert.match(output, /<ActionA keep="2" \/>/);
  assert.match(output, /<Action ID="ExplicitAction" keep="5" \/>/);
  assert.match(output, /<OtherAction foo="6" keep="7" \/>/);
  assert.doesNotMatch(output, /<ActionA[^>]*foo=/);
  assert.doesNotMatch(output, /<ActionA[^>]*extra=/);
  assert.doesNotMatch(output, /<Action ID="ExplicitAction"[^>]*foo=/);

  const reparsed = parseBehaviorTreeDocument(output);
  assert.deepEqual(
    reparsed.nodeModels.find((model) => model.id === "ActionA")?.ports.map((port) => port.attributes.name),
    ["keep"]
  );
  assert.deepEqual(
    reparsed.nodeModels.find((model) => model.id === "ExplicitAction")?.ports.map((port) => port.attributes.name),
    ["keep"]
  );
});
