import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadDomRefsRuntime() {
  const runtime = {};
  const context = {
    window: {
      BTreeToolRuntime: runtime
    }
  };
  const scriptPath = path.resolve("media/runtime/app/dom-refs.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.domRefs;
}

test("dom refs resolves the webview elements used by main runtime", () => {
  const domRefs = loadDomRefsRuntime();
  const ids = [];
  const root = {
    getElementById(id) {
      ids.push(id);
      return { id };
    },
    querySelector(selector) {
      return { selector };
    }
  };

  const refs = domRefs.createRefs(root);

  assert.equal(refs.treeSwitcher.id, "tree-switcher");
  assert.equal(refs.treeWorkspace.selector, ".tree-workspace");
  assert.equal(refs.openSettingsButton.id, "open-settings");
  assert.equal(ids.includes("tree-content"), true);
  assert.equal(ids.includes("tree-search-node"), true);
  assert.equal(ids.includes("catalog-search"), true);
});
