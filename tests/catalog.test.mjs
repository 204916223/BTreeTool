import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadCatalogRuntime(collapsedCatalogGroups = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), "media", "runtime", "catalog.js"), "utf8");
  const context = {
    window: {
      BTreeToolRuntime: {
        state: {
          collapsedCatalogGroups
        }
      }
    },
    console
  };
  vm.runInNewContext(source, context);
  return context.window.BTreeToolRuntime.catalog;
}

test("catalog groups default to collapsed when no user state exists", () => {
  const catalog = loadCatalogRuntime();

  assert.equal(catalog.isCatalogGroupCollapsed("Action"), true);
});

test("catalog group collapsed state preserves explicit user choices", () => {
  const catalog = loadCatalogRuntime({
    Action: false,
    SubTree: true
  });

  assert.equal(catalog.isCatalogGroupCollapsed("Action"), false);
  assert.equal(catalog.isCatalogGroupCollapsed("SubTree"), true);
});
