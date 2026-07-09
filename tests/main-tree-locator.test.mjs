import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.hidden = false;
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener() {}
}

function loadMainTreeLocatorRuntime(state, host, parentReferences) {
  const runtime = {
    state,
    refs: {
      mainTreeLocator: host
    },
    modeRules: {
      isEditingEnabled() {
        return true;
      }
    },
    i18n: {
      getMainTreeLocatorCopy() {
        return {
          ariaLabel: "locator",
          currentTree: (treeId) => `Current ${treeId}`,
          openSubTree: (treeId) => `Open ${treeId}`,
          focusNode: (treeId, title) => `Focus ${treeId} ${title}`
        };
      }
    },
    app: {
      getTreeMap(result) {
        return new Map(result.behaviorTrees.map((tree) => [tree.id, tree]));
      }
    },
    treeNavigation: {
      findParentTreeReference(_result, treeId) {
        return parentReferences.get(treeId) || null;
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: {
      createElement(tagName) {
        return new FakeElement(tagName);
      },
      createElementNS(_namespace, tagName) {
        return new FakeElement(tagName);
      }
    },
    requestAnimationFrame(callback) {
      callback();
    }
  };
  const scriptPath = path.resolve("media/runtime/tree/main-tree-locator.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.mainTreeLocator;
}

function walkElement(element, visitor) {
  visitor(element);
  element.children.forEach((child) => walkElement(child, visitor));
}

test("main tree locator adds nested SubTree references without expanding ordinary subtree nodes", () => {
  const host = new FakeElement("section");
  const preview = {
    defaultTreeId: "MainTree",
    mainTreeToExecute: "MainTree",
    behaviorTrees: [
      {
        id: "MainTree",
        node: {
          kind: "Sequence",
          title: "MainRoot",
          nodePath: "0",
          children: [
            { kind: "Action", title: "MainAction", nodePath: "0.0", children: [] },
            { kind: "SubTree", title: "CallA", targetTreeId: "SubA", nodePath: "0.1", children: [] }
          ]
        }
      },
      {
        id: "SubA",
        node: {
          kind: "Fallback",
          title: "SubARoot",
          nodePath: "0",
          children: [
            { kind: "Action", title: "SubAAction", nodePath: "0.0", children: [] },
            { kind: "SubTree", title: "CallB", targetTreeId: "SubB", nodePath: "0.1", children: [] },
            {
              kind: "Decorator",
              title: "SubADecorator",
              nodePath: "0.2",
              children: [
                { kind: "SubTree", title: "CallC", targetTreeId: "SubC", nodePath: "0.2.0", children: [] }
              ]
            }
          ]
        }
      },
      {
        id: "SubB",
        node: {
          kind: "Sequence",
          title: "SubBRoot",
          nodePath: "0",
          children: [{ kind: "Action", title: "SubBAction", nodePath: "0.0", children: [] }]
        }
      },
      {
        id: "SubC",
        node: {
          kind: "Sequence",
          title: "SubCRoot",
          nodePath: "0",
          children: [{ kind: "Action", title: "SubCAction", nodePath: "0.0", children: [] }]
        }
      }
    ]
  };
  const parentReferences = new Map([
    ["SubA", { treeId: "MainTree", nodePath: "0.1" }],
    ["SubB", { treeId: "SubA", nodePath: "0.1" }],
    ["SubC", { treeId: "SubA", nodePath: "0.2.0" }]
  ]);
  const locator = loadMainTreeLocatorRuntime(
    {
      currentSettings: {},
      selectedTreeId: "SubC"
    },
    host,
    parentReferences
  );

  locator.render(preview, preview.behaviorTrees[3]);

  const labels = [];
  const currentTitles = [];
  walkElement(host, (element) => {
    if (element.getAttribute("class") === "main-tree-locator-node-label") {
      labels.push(element.textContent);
    }
    if (element.getAttribute("class").includes("is-current")) {
      const titleElement = element.children.find((child) => child.tagName === "title");
      currentTitles.push(titleElement?.textContent || "");
    }
  });

  assert.equal(host.hidden, false);
  assert.deepEqual(labels, ["MainRoot", "MainAction", "CallA", "CallB", "CallC"]);
  assert.deepEqual(currentTitles, ["SubA / CallC / SubC"]);
});
