import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { createTraceContextFileFromPayload } = await import("../dist/panel/traceActions.js");
Module._load = originalLoad;

test("trace context file payload is normalized for webview state", () => {
  const file = createTraceContextFileFromPayload({
    fileName: "C:\\tmp\\async.log",
    text: "first\nsecond"
  });

  assert.deepEqual(file, {
      text: "first\nsecond",
      state: {
        fileName: "async.log",
      filePath: "C:\\tmp\\async.log",
      lineCount: 2,
      charCount: 12,
      truncated: false
    }
  });
});

test("trace context file payload rejects empty text", () => {
  assert.equal(createTraceContextFileFromPayload({ fileName: "empty.log", text: "" }), null);
  assert.equal(createTraceContextFileFromPayload(undefined), null);
});
