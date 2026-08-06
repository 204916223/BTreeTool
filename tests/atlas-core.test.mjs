import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  applyCandidateChanges,
  diffCandidate,
  parseCandidate,
  parseTreeNodesModel,
  reorderObjectEntry,
  validateAtlas
} = require("../Tools/atlas-editor/atlas-core.js");

function createMeta() {
  return {
    schemaVersion: 1,
    atlasVersion: "1",
    updatedAt: "",
    source: { asyncTag: "test" }
  };
}

function createNode(params = {}) {
  return {
    title: "测试节点",
    category: "Action",
    description: "",
    department: "测试",
    maintainer: "测试",
    source_notes: [],
    mainline: {
      status: "stable",
      params,
      rules: [],
      examples: []
    },
    custom: {}
  };
}

test("atlas validation blocks invalid contract fields", () => {
  const nodes = {
    Demo: createNode({
      value: { role: "sideways", type: "double", required: false, description: "" }
    })
  };
  const issues = validateAtlas(nodes, {}, createMeta());
  assert.equal(issues.some((issue) => issue.code === "invalid_param_role" && issue.level === "error"), true);
});

test("TreeNodesModel candidates preserve version, types, required flags and defaults", () => {
  const candidate = parseTreeNodesModel(`
<TreeNodesModel atlas_tag="3.2605.9">
  <Action ID="Demo">
    <input_port name="count" type="int" required="true" description="次数" />
    <output_port name="result" type="string" default="{result}" />
  </Action>
</TreeNodesModel>`);

  assert.equal(candidate.atlasTag, "3.2605.9");
  assert.deepEqual(candidate.nodes.Demo.params.count, {
    role: "input",
    type: "int",
    required: true,
    description: "次数"
  });
  assert.equal(candidate.nodes.Demo.params.result.default, "{result}");
});

test("candidate diff defaults additions to selected and removals to manual review", () => {
  const current = {
    Demo: createNode({
      old_port: { role: "input", type: "string", required: false, description: "旧端口" }
    }),
    Legacy: createNode()
  };
  const candidate = parseTreeNodesModel(`
<TreeNodesModel atlas_tag="next">
  <Action ID="Demo">
    <input_port name="new_port" type="double" required="true" />
  </Action>
</TreeNodesModel>`);
  const changes = diffCandidate(current, candidate);

  assert.equal(changes.find((change) => change.type === "param_add")?.defaultSelected, true);
  assert.equal(changes.find((change) => change.type === "param_remove")?.defaultSelected, false);
  assert.equal(changes.find((change) => change.type === "node_remove")?.defaultSelected, false);

  const selected = changes.filter((change) => change.defaultSelected).map((change) => change.id);
  const applied = applyCandidateChanges(current, candidate, selected);
  assert.equal(applied.Demo.mainline.params.new_port.type, "double");
  assert.ok(applied.Demo.mainline.params.old_port);
  assert.ok(applied.Legacy);
});

test("atlas candidate JSON can be reviewed by the same importer", () => {
  const candidate = parseCandidate(JSON.stringify({
    schemaVersion: 1,
    atlasTag: "json-candidate",
    nodes: {
      Demo: {
        category: "Action",
        params: {
          value: { role: "input", type: "double", required: false, description: "" }
        }
      }
    }
  }));
  assert.equal(candidate.atlasTag, "json-candidate");
  assert.equal(candidate.nodes.Demo.params.value.type, "double");
});

test("atlas parameter ordering can move one entry without changing its data", () => {
  const params = {
    first: { role: "input", type: "int" },
    second: { role: "input", type: "string" },
    result: { role: "output", type: "bool" }
  };

  const before = reorderObjectEntry(params, "second", "first", "before");
  assert.deepEqual(Object.keys(before), ["second", "first", "result"]);
  assert.deepEqual(before.second, params.second);

  const after = reorderObjectEntry(before, "second", "first", "after");
  assert.deepEqual(Object.keys(after), ["first", "second", "result"]);
  assert.deepEqual(params, {
    first: { role: "input", type: "int" },
    second: { role: "input", type: "string" },
    result: { role: "output", type: "bool" }
  });
});

test("TNM build no longer invokes the atlas mutation script", () => {
  const source = readFileSync(new URL("../Tools/buildtnm.sh", import.meta.url), "utf8");
  assert.equal(source.includes("update_atlas_from_btt.py"), false);
  assert.match(source, /official atlas was not modified/);
});

test("atlas editor keeps parameter editing explicit and contains no inference or usage-flow editor", () => {
  const source = readFileSync(new URL("../Tools/atlas-editor/atlas-editor.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../Tools/atlas-editor/index.html", import.meta.url), "utf8");
  assert.equal(source.includes("inferVariableReference"), false);
  assert.equal(source.includes("inferTypeFromName"), false);
  assert.equal(source.includes("setVariableDerivedLock"), false);
  assert.equal(source.includes("updateSelectedNodeUsageFlows"), false);
  assert.doesNotMatch(source, /field\.addEventListener\("focus"[^\n]*selectParamCard/);
  assert.equal(html.includes("usage-flow-editor"), false);
  assert.equal(html.includes("param-variable-help"), false);
  assert.match(source, /bindParamDrag\(button, card\.dataset\.paramName \|\| name, lane\.key\)/);
  assert.match(source, /bindParamDrag\(row, name, lane\)/);
  assert.match(source, /BTreeAtlasCore\.reorderObjectEntry/);
  assert.doesNotMatch(source, /Object\.keys\(params\)\.sort\(compareText\)/);
});

test("atlas variable editor writes a default value without legacy common-node or example fields", () => {
  const source = readFileSync(new URL("../Tools/atlas-editor/atlas-editor.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../Tools/atlas-editor/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../Tools/atlas-editor/atlas-editor.css", import.meta.url), "utf8");
  assert.match(html, /id="variable-default"/);
  assert.equal(html.includes("variable-common-nodes"), false);
  assert.equal(html.includes("variable-examples"), false);
  assert.match(source, /default: refs\.variableDefault\.value/);
  assert.equal(source.includes("refs.variableCommonNodes"), false);
  assert.equal(source.includes("refs.variableExamples"), false);
  assert.match(source, /ATLAS_DRAFT_KEY/);
  assert.match(source, /function persistCachedDraft\(\)/);
  assert.match(source, /function restoreCachedDraft\(\)/);
  assert.match(source, /state\.pendingVariableKeys\[key\] = nextDraftKey/);
  assert.match(source, /description: createVariableDescriptionTemplate\(key\)/);
  assert.match(source, /对应\[配置来源\]中用户配置项 \[配置项名称\]\\n通常用于\[使用场景或判断逻辑\]/);
  assert.match(css, /body\[data-view="variables"\] \.workspace\s*\{[^}]*grid-template-columns:\s*310px minmax\(0, 1fr\)/s);
  assert.match(css, /body\[data-view="variables"\] \.editor-panel,[^}]*body\[data-view="variables"\] \.panel-resizer\s*\{\s*display:\s*none/s);
});
