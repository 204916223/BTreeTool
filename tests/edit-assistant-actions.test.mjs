import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { parseBehaviorTreeDocument } = await import("../dist/core/parse.js");
const { buildPreviewDocument } = await import("../dist/core/viewModel.js");
const { DEFAULT_USER_SETTINGS } = await import("../dist/userSettings.js");
const { handleEditAssistantAskAction, loadAtlasNodeIndex } = await import("../dist/panel/editAssistantActions.js");
Module._load = originalLoad;

function buildPreview(xml, settings = DEFAULT_USER_SETTINGS) {
  return buildPreviewDocument(parseBehaviorTreeDocument(xml, settings), settings);
}

test("edit assistant action explains selected nodes with atlas details", () => {
  const settings = {
    ...DEFAULT_USER_SETTINGS,
    language: "zh-CN"
  };
  const preview = buildPreview(`
<root main_tree_to_execute="MainTree">
  <BehaviorTree ID="MainTree">
    <Sequence>
      <AlwaysSuccess name="done" />
    </Sequence>
  </BehaviorTree>
</root>
`, settings);
  const messages = [];

  handleEditAssistantAskAction(
    {
      requestId: "request-1",
      action: "explainNode",
      treeId: "MainTree",
      nodePath: "0.0"
    },
    {
      preview,
      settings,
      copy: { nodeCreateUnchanged: "unchanged" },
      atlasNodes: new Map([
        [
          "AlwaysSuccess",
          {
            title: "总是成功",
            description: "立即返回 SUCCESS",
            mainline: {
              rules: ["无条件成功"],
              params: {
                name: {
                  role: "标识",
                  type: "string",
                  description: "实例名"
                }
              }
            }
          }
        ]
      ]),
      postMessage: (message) => messages.push(message)
    }
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "editAssistantAnswer");
  assert.equal(messages[0].payload.action, "explainNode");
  assert.match(messages[0].payload.answer, /节点：总是成功 \(AlwaysSuccess\)/);
  assert.match(messages[0].payload.answer, /规则：无条件成功/);
  assert.match(messages[0].payload.answer, /当前属性：name=done/);
});

test("atlas node index loads valid object entries and ignores malformed files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btree-tool-atlas-"));
  const validPath = path.join(dir, "nodes.json");
  const invalidPath = path.join(dir, "invalid.json");
  fs.writeFileSync(
    validPath,
    JSON.stringify({
      Sequence: { title: "Sequence" },
      Invalid: null
    }),
    "utf8"
  );
  fs.writeFileSync(invalidPath, "{", "utf8");

  const validIndex = loadAtlasNodeIndex(validPath);
  const invalidIndex = loadAtlasNodeIndex(invalidPath);

  assert.equal(validIndex.size, 1);
  assert.deepEqual(validIndex.get("Sequence"), { title: "Sequence" });
  assert.equal(invalidIndex.size, 0);
});
