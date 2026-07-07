import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function createElementStub(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    className: "",
    type: "",
    textContent: "",
    children: [],
    listeners: {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

function loadStartupStateRuntime() {
  const runtime = {
    state: {
      playbackLogImporting: false
    },
    app: {
      openingCount: 0,
      renderDocumentOpeningState() {
        this.openingCount += 1;
      }
    },
    vscode: {
      messages: [],
      postMessage(message) {
        this.messages.push(message);
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: {
      createElement: createElementStub
    }
  };

  const scriptPath = path.resolve("media/runtime/app/startup-state.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
}

test("startup open XML action enters the opening transition before posting to the extension", () => {
  const runtime = loadStartupStateRuntime();
  const state = runtime.startupState.buildNoDocumentState({
    startupTitle: "No XML document open",
    startupSummary: "Choose an action to start working.",
    createNewXml: "New BehaviorTree XML",
    openExistingXml: "Open existing XML"
  });

  const actions = state.children[2];
  const openButton = actions.children[1];
  openButton.listeners.click();

  assert.equal(runtime.app.openingCount, 1);
  assert.equal(JSON.stringify(runtime.vscode.messages), JSON.stringify([{ type: "openExistingBehaviorTreeDocument" }]));
});

test("startup state can render the XML opening page", () => {
  const runtime = loadStartupStateRuntime();
  const state = runtime.startupState.buildDocumentOpeningState({
    openExistingXml: "Open existing XML",
    openExistingOpening: "Opening XML..."
  });

  assert.equal(state.children[0].textContent, "Open existing XML");
  assert.equal(state.children[1].textContent, "Opening XML...");
});
