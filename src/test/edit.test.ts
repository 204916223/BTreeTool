import test from "node:test";
import assert from "node:assert/strict";
import { BtDocumentAst } from "../core/btAst";
import {
  createBehaviorTree,
  deleteBehaviorTree,
  deleteNode,
  findBehaviorTreeReferences,
  insertNode,
  insertNodeCopy
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

test("insertNode rejects adding a second child under the virtual root", () => {
  const document = createDocument();

  assert.throws(
    () => insertNode(document, "MainTree", "__btree_root__", 0, "Sequence", "Control"),
    /already has a root node/
  );
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
