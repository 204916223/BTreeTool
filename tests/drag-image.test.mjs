import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadDragImageRuntime() {
  const runtime = {};
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    Number,
    Math
  };
  const scriptPath = path.resolve("media/runtime/app/drag-image.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.dragImage;
}

test("node drag uses the visible source as its drag image", () => {
  const dragImage = loadDragImageRuntime();
  const source = {
    getBoundingClientRect() {
      return { left: 100, top: 40, width: 240, height: 120 };
    }
  };
  const calls = [];

  dragImage.setVisibleDragImage({
    clientX: 160,
    clientY: 70,
    dataTransfer: {
      setDragImage(...args) {
        calls.push(args);
      }
    }
  }, source);

  assert.deepEqual(calls, [[source, 60, 30]]);
});

test("drag image pointer offset is kept inside the source bounds", () => {
  const dragImage = loadDragImageRuntime();
  const source = {
    getBoundingClientRect() {
      return { left: 100, top: 40, width: 240, height: 120 };
    }
  };
  const calls = [];

  dragImage.setVisibleDragImage({
    clientX: 500,
    clientY: 0,
    dataTransfer: {
      setDragImage(...args) {
        calls.push(args);
      }
    }
  }, source);

  assert.deepEqual(calls, [[source, 240, 0]]);
});
