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
    this.rows = 0;
    this.hidden = false;
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
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((entry) => entry !== child);
    }
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

  focus() {}

  blur() {}

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

function findFormControls(element, result = []) {
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    result.push(element);
  }
  element.children.forEach((child) => findFormControls(child, result));
  return result;
}

function findByClass(element, className, result = []) {
  if (element.classList?.contains?.(className)) {
    result.push(element);
  }
  element.children.forEach((child) => findByClass(child, className, result));
  return result;
}

function loadCanvasRuntime(options = {}) {
  const messages = [];
  const workspace = new ElementStub();
  workspace.className = "tree-workspace";
  const playbackCanvasPane = options.playbackMode ? new ElementStub() : null;
  if (playbackCanvasPane) {
    playbackCanvasPane.className = "playback-canvas-pane";
  }
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
        return options.playbackMode === true;
      }
    },
    app: {
      canPerformAction() {
        return true;
      },
      activateTreePane() {},
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
    activeElement: null,
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
    querySelector(selector) {
      if (selector === ".playback-canvas-pane") {
        return playbackCanvasPane;
      }
      if (selector === ".tree-workspace") {
        return workspace;
      }
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
  return { runtime, messages, document, workspace, playbackCanvasPane };
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

test("editing a modeled field preserves empty sibling model attributes", () => {
  const { runtime, messages } = loadCanvasRuntime();
  const node = {
    nodePath: "0.1",
    title: "ReportSchedule",
    kind: "ReportSchedule",
    category: "Action",
    attributes: {
      errorMsg: "{errorMsg}"
    },
    attributeFields: [
      {
        key: "schedule_report_action",
        value: "",
        role: "input",
        editableValue: true,
        required: false,
        source: "model"
      },
      {
        key: "schedule_report_extra_data",
        value: "",
        role: "input",
        editableValue: true,
        required: false,
        source: "model"
      },
      {
        key: "errorMsg",
        value: "{errorMsg}",
        role: "output",
        editableValue: true,
        required: false,
        source: "model"
      },
      {
        key: "schedule_report_result",
        value: "",
        role: "output",
        editableValue: true,
        required: false,
        source: "model"
      }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const card = runtime.canvas.buildNodeCard(node, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const inputsByKey = new Map(findInputs(card).map((input) => [input.dataset.attributeKey, input]));
  const actionInput = inputsByKey.get("schedule_report_action");

  actionInput.value = "{appoint_action}";
  actionInput.dispatch("change");

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload.attributes)), {
    errorMsg: "{errorMsg}",
    schedule_report_action: "{appoint_action}",
    schedule_report_extra_data: "",
    schedule_report_result: ""
  });
});

test("clearing a visible attribute writes an empty XML attribute instead of deleting it", () => {
  const { runtime, messages } = loadCanvasRuntime();
  const node = {
    nodePath: "0.1",
    title: "ReportSchedule",
    kind: "ReportSchedule",
    category: "Action",
    attributes: {
      schedule_report_extra_data: "{payload}"
    },
    attributeFields: [
      {
        key: "schedule_report_extra_data",
        value: "{payload}",
        role: "input",
        editableValue: true,
        required: false,
        source: "model"
      }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const card = runtime.canvas.buildNodeCard(node, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const input = findInputs(card).find((entry) => entry.dataset.attributeKey === "schedule_report_extra_data");

  input.value = "";
  input.dispatch("change");

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload.attributes)), {
    schedule_report_extra_data: ""
  });
});

test("stale optimistic attributes are ignored when a new node reuses the same path", () => {
  const { runtime, messages } = loadCanvasRuntime();
  const switchNode = {
    nodePath: "0.1",
    title: "Switch2",
    kind: "Switch2",
    category: "Control",
    attributes: {
      variable: "",
      case_1: "",
      case_2: ""
    },
    attributeFields: [
      { key: "variable", value: "", role: "input", editableValue: true, required: false },
      { key: "case_1", value: "", role: "input", editableValue: true, required: false },
      { key: "case_2", value: "", role: "input", editableValue: true, required: false }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };
  const preconditionNode = {
    nodePath: "0.1",
    title: "Precondition",
    kind: "Precondition",
    category: "Decorator",
    attributes: {
      if: "",
      else: "FAILURE"
    },
    attributeFields: [
      { key: "if", value: "", role: "param", editableValue: true, required: true },
      { key: "else", value: "FAILURE", role: "param", editableValue: true, required: false }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const switchCard = runtime.canvas.buildNodeCard(switchNode, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const switchInputsByKey = new Map(findInputs(switchCard).map((input) => [input.dataset.attributeKey, input]));
  switchInputsByKey.get("variable").value = "v";
  switchInputsByKey.get("variable").dispatch("change");
  runtime.canvas.finishPendingAttributeEdit(true);

  const preconditionCard = runtime.canvas.buildNodeCard(preconditionNode, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const preconditionInputsByKey = new Map(findInputs(preconditionCard).map((input) => [input.dataset.attributeKey, input]));
  preconditionInputsByKey.get("if").value = "v == \"2\"";
  preconditionInputsByKey.get("if").dispatch("change");

  assert.equal(messages.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[1].payload.attributes)), {
    if: "v == \"2\"",
    else: "FAILURE"
  });
});

test("long attribute values can be edited from the preview editor without multiline attributes", () => {
  const { runtime, messages, document, workspace } = loadCanvasRuntime();
  const node = {
    nodePath: "0.1",
    title: "Precondition",
    kind: "Precondition",
    category: "Decorator",
    attributes: {
      if: "current_dist > 0 && current_dist < (prepare_dist + 0.1)",
      else: "FAILURE"
    },
    attributeFields: [
      {
        key: "if",
        value: "current_dist > 0 && current_dist < (prepare_dist + 0.1)",
        role: "param",
        editableValue: true,
        required: true
      },
      { key: "else", value: "FAILURE", role: "param", editableValue: true, required: false }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const card = runtime.canvas.buildNodeCard(node, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const conditionControl = findFormControls(card).find((entry) => entry.dataset.attributeKey === "if");
  assert.equal(conditionControl.tagName, "INPUT");

  document.activeElement = conditionControl;
  conditionControl.dispatch("focus");

  const previewHost = workspace.children.find((entry) => entry.className === "attribute-input-preview");
  const previewEditor = previewHost.children.find((entry) => entry.className === "attribute-input-preview-editor");
  assert.equal(previewEditor.hidden, false);
  assert.equal(previewEditor.value, "current_dist > 0 && current_dist < (prepare_dist + 0.1)");

  previewEditor.value = "current_dist > 0 &&\ncurrent_dist < (prepare_dist + 0.2)";
  previewEditor.dispatch("input");
  assert.equal(conditionControl.value, "current_dist > 0 && current_dist < (prepare_dist + 0.2)");
  assert.equal(previewEditor.value, "current_dist > 0 && current_dist < (prepare_dist + 0.2)");

  previewEditor.dispatch("blur");

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload.attributes)), {
    if: "current_dist > 0 && current_dist < (prepare_dist + 0.2)",
    else: "FAILURE"
  });
});

test("readonly attribute preview is anchored to playback canvas pane in playback mode", () => {
  const { runtime, workspace, playbackCanvasPane } = loadCanvasRuntime({ playbackMode: true });
  const node = {
    nodePath: "0.1",
    title: "Precondition",
    kind: "Precondition",
    category: "Decorator",
    attributes: {
      if: "dist_to_target < baffle_enable_dist"
    },
    attributeFields: [
      {
        key: "if",
        value: "dist_to_target < baffle_enable_dist",
        role: "param",
        editableValue: true,
        required: false
      }
    ],
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  };

  const card = runtime.canvas.buildNodeCard(node, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const conditionChip = findByClass(card, "flow-attribute-chip-value")[0];

  conditionChip.dispatch("focus");

  const previewHost = playbackCanvasPane.children.find((entry) => entry.className === "attribute-input-preview");
  assert.ok(previewHost);
  assert.equal(workspace.children.some((entry) => entry.className === "attribute-input-preview"), false);
  assert.equal(previewHost.hidden, false);
  assert.equal(previewHost.children[0].textContent, "dist_to_target < baffle_enable_dist");
});

test("releasing a moved node without a committed drop uses cancellation cleanup", () => {
  const { runtime, document } = loadCanvasRuntime();
  document.body = new ElementStub("body");
  let cleanupOptions = null;
  let endingClassWasActive = false;
  runtime.viewport.endDragPreviewViewport = (options) => {
    cleanupOptions = options;
    endingClassWasActive = document.body.classList.contains("is-ending-node-drag");
  };
  runtime.viewport.refreshDropTargetVisibility = () => {};
  runtime.catalog.clearCatalogDeleteTarget = () => {};
  runtime.catalog.syncDeleteTargetIndicator = () => {};
  runtime.overlays.hideNodeContextMenu = () => {};

  const card = runtime.canvas.buildNodeCard({
    nodePath: "0.1",
    title: "Sleep",
    kind: "Sleep",
    category: "Action",
    attributes: {},
    children: [],
    warnings: [],
    warningCount: 0,
    hasError: false
  }, { behaviorTrees: [] }, {
    interactive: true,
    currentTreeId: "MainTree"
  });
  const heading = findByClass(card, "flow-card-heading")[0];
  runtime.state.currentDragState = { kind: "move", sourceNodePath: "0.1" };
  document.body.classList.add("is-reordering-nodes");

  heading.dispatch("dragend");

  assert.equal(cleanupOptions?.cancelled, true);
  assert.equal(endingClassWasActive, true);
  assert.equal(runtime.state.currentDragState, null);
  assert.equal(document.body.classList.contains("is-reordering-nodes"), false);
  assert.equal(document.body.classList.contains("is-ending-node-drag"), false);
});

test("moving nodes and subtree references keeps their card visible as the drag image", () => {
  for (const category of ["Action", "SubTree"]) {
    const { runtime, document } = loadCanvasRuntime();
    document.body = new ElementStub("body");
    runtime.viewport.beginDragPreviewViewport = () => {};
    runtime.viewport.refreshDropTargetVisibility = () => {};
    runtime.catalog.syncDeleteTargetIndicator = () => {};
    const dragImages = [];
    runtime.setVisibleDragImage = (event, source) => {
      dragImages.push({ event, source });
    };

    const card = runtime.canvas.buildNodeCard({
      nodePath: "0.1",
      title: category === "SubTree" ? "Loading" : "Sleep",
      kind: category === "SubTree" ? "SubTree" : "Sleep",
      category,
      attributes: {},
      children: [],
      warnings: [],
      warningCount: 0,
      hasError: false
    }, { behaviorTrees: [] }, {
      interactive: true,
      currentTreeId: "MainTree",
      parentPath: "0",
      siblingIndex: 0
    });
    const heading = findByClass(card, "flow-card-heading")[0];
    const dataTransfer = {
      setData() {},
      effectAllowed: ""
    };

    heading.dispatch("dragstart", { dataTransfer, clientX: 20, clientY: 20 });

    assert.equal(dragImages.length, 1);
    assert.equal(dragImages[0].source, card);
  }
});
