import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

class ElementStub {
  constructor(tagName = "DIV") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.textContent = "";
    this.value = "";
    this.title = "";
    this.type = "";
    this.draggable = false;
    this.spellcheck = false;
    this.readOnly = false;
    this.tabIndex = 0;
    this.parentElement = null;
    this.style = {
      setProperty() {}
    };
    this.classList = {
      add: (...names) => this.updateClasses(names, true),
      remove: (...names) => this.updateClasses(names, false),
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
        shouldAdd ? classes.add(name) : classes.delete(name);
        this.className = Array.from(classes).join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
    this.className = "";
  }

  updateClasses(names, shouldAdd) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    names.forEach((name) => {
      if (shouldAdd) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    });
    this.className = Array.from(classes).join(" ");
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  dispatch(type, overrides = {}) {
    const event = {
      type,
      target: this,
      stopPropagation() {},
      preventDefault() {},
      ...overrides
    };
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  closest() {
    return null;
  }
}

function findInputs(element, result = []) {
  if (element.tagName === "INPUT") {
    result.push(element);
  }
  element.children.forEach((child) => findInputs(child, result));
  return result;
}

function loadCanvasRuntime() {
  const messages = [];
  const runtime = {
    state: {
      selectedTreeId: "MainTree",
      selectedNodePath: "0",
      pendingAttributeSnapshots: {},
      currentSettings: {},
      searchMatchedNodePaths: new Set(),
      searchResults: [],
      activeSearchResultIndex: -1
    },
    vscode: {
      postMessage(message) {
        messages.push(message);
      }
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      }
    },
    app: {
      canPerformAction() {
        return true;
      },
      persistUiState() {},
      getTreeMap() {
        return new Map();
      }
    },
    viewport: {},
    overlays: {},
    catalog: {},
    i18n: {
      getAttributeCopy() {
        return {
          valuePlaceholder: "Value",
          requiredAttributeValue(key) {
            return `${key} is required`;
          }
        };
      }
    }
  };
  const document = {
    body: {
      classList: {
        add() {},
        remove() {}
      }
    },
    createElement(tagName) {
      return new ElementStub(tagName);
    },
    createElementNS(_namespace, tagName) {
      return new ElementStub(tagName);
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime,
      setTimeout(callback) {
        callback();
      }
    },
    document,
    CSS: {
      escape(value) {
        return String(value);
      }
    },
    Date
  };
  const scriptPath = path.resolve("media/runtime/canvas.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return { runtime, messages };
}

test("copying two output values across split panes keeps the first pending target value", () => {
  const { runtime, messages } = loadCanvasRuntime();
  const sourceNode = {
    nodePath: "0.1",
    title: "LoadTemplate",
    kind: "LoadTemplate",
    category: "Action",
    attributes: {
      out_error_id: "{out_error_id}",
      out_error_level: "{out_error_level}"
    },
    attributeFields: [
      { key: "out_error_id", value: "{out_error_id}", role: "output", editableValue: true, required: false },
      { key: "out_error_level", value: "{out_error_level}", role: "output", editableValue: true, required: false }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };
  const targetNode = {
    nodePath: "0.1",
    title: "Move",
    kind: "Move",
    category: "Action",
    attributes: {
      errorMsg: "{errorMsg}"
    },
    attributeFields: [
      { key: "errorMsg", value: "{errorMsg}", role: "output", editableValue: true, required: false },
      { key: "out_error_id", value: "", role: "output", editableValue: true, required: false },
      { key: "out_error_level", value: "", role: "output", editableValue: true, required: false }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const sourceCard = runtime.canvas.buildNodeCard(sourceNode, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "SourceTree"
  });
  const targetCard = runtime.canvas.buildNodeCard(targetNode, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "TargetTree"
  });
  const sourceInputsByKey = new Map(findInputs(sourceCard).map((input) => [input.dataset.attributeKey, input]));
  const targetInputsByKey = new Map(findInputs(targetCard).map((input) => [input.dataset.attributeKey, input]));
  const targetErrorIdInput = targetInputsByKey.get("out_error_id");
  const targetErrorLevelInput = targetInputsByKey.get("out_error_level");

  targetErrorIdInput.value = sourceInputsByKey.get("out_error_id").value;
  targetErrorIdInput.dispatch("change");
  targetErrorLevelInput.value = sourceInputsByKey.get("out_error_level").value;
  targetErrorLevelInput.dispatch("change");

  assert.equal(messages.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload.attributes)), {
    errorMsg: "{errorMsg}",
    out_error_id: "{out_error_id}"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(messages[1].payload.attributes)), {
    errorMsg: "{errorMsg}",
    out_error_id: "{out_error_id}",
    out_error_level: "{out_error_level}"
  });
});

test("editing after a light refresh still uses pending attributes from the unchanged DOM", () => {
  const { runtime, messages } = loadCanvasRuntime();
  const node = {
    nodePath: "0.1",
    title: "Move",
    kind: "Move",
    category: "Action",
    attributes: {},
    attributeFields: [
      { key: "out_error_id", value: "", role: "output", editableValue: true, required: false },
      { key: "out_error_level", value: "", role: "output", editableValue: true, required: false }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const card = runtime.canvas.buildNodeCard(node, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "TargetTree"
  });
  const inputsByKey = new Map(findInputs(card).map((input) => [input.dataset.attributeKey, input]));
  const errorIdInput = inputsByKey.get("out_error_id");
  const errorLevelInput = inputsByKey.get("out_error_level");

  errorIdInput.value = "{out_error_id}";
  errorIdInput.dispatch("change");
  runtime.canvas.finishPendingAttributeEdit(true);

  errorLevelInput.value = "{out_error_level}";
  errorLevelInput.dispatch("change");

  assert.equal(messages.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[1].payload.attributes)), {
    out_error_id: "{out_error_id}",
    out_error_level: "{out_error_level}"
  });
});
