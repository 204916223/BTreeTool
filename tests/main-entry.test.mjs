import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

test("main entry delegates startup to the edit controller", () => {
  const persistedState = { selectedTreeId: "MainTree" };
  const calls = [];
  const context = {
    window: {
      BTreeToolRuntime: {
        editController: {
          start(payload) {
            calls.push(payload);
          }
        }
      },
      BTreeToolInitialMode: "playback",
      BTreeToolInitialSettings: {
        themePreset: "rose",
        language: "zh-CN",
        nodeAttributeLayout: "stacked",
        simplifyHiddenSections: ["description"]
      }
    },
    acquireVsCodeApi() {
      return {
        getState() {
          return persistedState;
        }
      };
    }
  };

  const scriptPath = path.resolve("media/main.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].persistedState, persistedState);
  assert.equal(calls[0].initialMode, "playback");
  assert.deepEqual(calls[0].initialSettings, {
    themePreset: "rose",
    language: "zh-CN",
    nodeAttributeLayout: "stacked",
    simplifyHiddenSections: ["description"]
  });
  assert.equal(typeof calls[0].vscode.getState, "function");
});
