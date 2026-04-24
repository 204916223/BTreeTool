import test from "node:test";
import assert from "node:assert/strict";
import { BtDocumentAst } from "../core/btAst";
import { insertNodeCopy } from "../core/edit";

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
