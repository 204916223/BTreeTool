import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

class ElementStub {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.rows = 0;
    this.spellcheck = true;
    this.type = "";
    this.title = "";
    this.hidden = false;
    this.style = {};
    this.classList = {
      add: (...names) => this.updateClasses(names, true),
      remove: (...names) => this.updateClasses(names, false),
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
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

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  dispatch(type, overrides = {}) {
    const event = {
      type,
      target: this,
      preventDefault() {},
      stopPropagation() {},
      ...overrides
    };
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  querySelector(selector) {
    return findElement(this, selector);
  }

  querySelectorAll(selector) {
    return findElements(this, selector);
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

function findElement(root, selector) {
  return findElements(root, selector)[0] || null;
}

function findElements(root, selector, result = []) {
  if (matchesSelector(root, selector)) {
    result.push(root);
  }
  root.children.forEach((child) => findElements(child, selector, result));
  return result;
}

function matchesSelector(element, selector) {
  if (selector === "[data-edit-assistant-input]") {
    return element.dataset.editAssistantInput === "true";
  }
  if (selector === "[data-assistant-messages]") {
    return element.dataset.assistantMessages === "true";
  }
  if (selector.startsWith(".")) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  return false;
}

function loadEditAssistantRuntime() {
  const panel = new ElementStub("aside");
  const animationFrames = [];
  const runtime = {
    refs: {
      editAssistantPanel: panel
    },
    state: {
      currentPreview: {
        defaultTreeId: "MainTree",
        behaviorTrees: [
          {
            id: "MainTree",
            node: {
              uid: 69,
              title: "Enter",
              kind: "SubTree",
              category: "SubTree",
              nodePath: "0",
              children: []
            }
          }
        ],
        warnings: []
      },
      selectedTreeId: "MainTree",
      selectedNodePath: "0",
      editAssistantMessages: [],
      editAssistantTreeQueue: []
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      }
    },
    icons: {
      iconHtml(name) {
        return `<${name}>`;
      }
    },
    app: {
      persistUiState() {}
    },
    vscode: {
      postMessage() {}
    }
  };
  const document = {
    createElement(tagName) {
      return new ElementStub(tagName);
    },
    querySelector(selector) {
      return panel.querySelector(selector);
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime,
      requestAnimationFrame(callback) {
        animationFrames.push(callback);
      },
      setTimeout(callback) {
        callback();
      }
    },
    document
  };
  const scriptPath = path.resolve("media/runtime/edit/edit-assistant.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  runtime.editAssistant.render();
  animationFrames.splice(0).forEach((callback) => callback());
  return { runtime, input: panel.querySelector("[data-edit-assistant-input]") };
}

test("edit assistant clears generated selected-node prompt on blur", () => {
  const { input } = loadEditAssistantRuntime();

  assert.equal(input.value, "Explain selected SubTree: Enter (69)");
  input.dispatch("blur");

  assert.equal(input.value, "");
  assert.equal(input.dataset.generatedNodePrompt, "false");
  assert.equal(input.dataset.generatedPromptText, "");
  assert.equal(input.dataset.generatedPromptNode, "");
});

test("edit assistant keeps generated prompt after user edits it", () => {
  const { input } = loadEditAssistantRuntime();

  input.value = `${input.value} please`;
  input.dispatch("input");
  input.dispatch("blur");

  assert.equal(input.value, "Explain selected SubTree: Enter (69) please");
  assert.equal(input.dataset.generatedNodePrompt, "false");
});

test("edit assistant clears generated prompt when selected node is cleared", () => {
  const { runtime, input } = loadEditAssistantRuntime();

  runtime.state.selectedNodePath = null;
  runtime.editAssistant.syncSelectedNodePrompt();

  assert.equal(input.value, "");
  assert.equal(input.dataset.generatedNodePrompt, "false");
});
