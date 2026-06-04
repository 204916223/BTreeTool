import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadTreeSwitcherRuntime(state = {}) {
  const treeSwitcherElement = new ElementStub("div");
  const runtime = {
    state: {
      selectedTreeId: "MainTree",
      treeSwitcherScrollLeft: 0,
      ...state
    },
    refs: {
      treeSwitcher: treeSwitcherElement
    },
    app: {
      selected: null,
      selectTreeInActivePane(treeId, result) {
        this.selected = { treeId, result };
      }
    }
  };
  const documentStub = {
    createDocumentFragment() {
      return new FragmentStub();
    },
    createElement(tagName) {
      return new ElementStub(tagName);
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: documentStub,
    requestAnimationFrame(callback) {
      callback();
    }
  };
  const scriptPath = path.resolve("media/runtime/tree/tree-switcher.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
}

test("tree switcher renders duplicate BehaviorTree IDs once", () => {
  const runtime = loadTreeSwitcherRuntime();
  const preview = {
    behaviorTrees: [
      { id: "MainTree" },
      { id: "report" },
      { id: "report" },
      { id: "Exit" },
      { id: "report" }
    ]
  };

  runtime.treeSwitcher.render(preview);

  assert.deepEqual(
    runtime.refs.treeSwitcher.children.map((child) => child.textContent),
    ["MainTree", "report", "Exit"]
  );

  const reportButton = runtime.refs.treeSwitcher.children[1];
  reportButton.listeners.click();
  assert.equal(runtime.app.selected.treeId, "report");
  assert.equal(runtime.app.selected.result, preview);
});

class FragmentStub {
  constructor() {
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

class ElementStub extends FragmentStub {
  constructor(tagName) {
    super();
    this.tagName = tagName;
    this.dataset = {};
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.scrollLeft = 0;
    this.listeners = {};
    this.classList = {
      toggle: (className, enabled) => {
        const classes = new Set(String(this.className || "").split(/\s+/).filter(Boolean));
        if (enabled) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
        this.className = [...classes].join(" ");
      }
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  replaceChildren(fragment) {
    this.children = fragment?.children ? [...fragment.children] : [];
  }

  querySelectorAll(selector) {
    if (selector !== ".tree-tab") {
      return [];
    }
    return this.children.filter((child) => String(child.className || "").split(/\s+/).includes("tree-tab"));
  }

  scrollIntoView() {}
}
