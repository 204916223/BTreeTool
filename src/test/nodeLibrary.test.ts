import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNodeLibraryPresets } from "../core/nodeLibrary";

test("loadNodeLibraryPresets reads .btt node definitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "btt-node-library-"));
  try {
    await mkdir(join(root, "Action"), { recursive: true });
    await writeFile(
      join(root, "Action", "AlwaysSuccess.btt"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<node name="AlwaysSuccess" category="Action" modelKind="Action" allowCustomAttributes="true">\n  <param_port name="code" default="" required="true" />\n</node>\n`,
      "utf8"
    );

    const presets = await loadNodeLibraryPresets(root);

    assert.deepEqual(presets, [
      {
        key: "AlwaysSuccess",
        title: "AlwaysSuccess",
        category: "Action",
        modelKind: "Action",
        allowCustomAttributes: true,
        fields: [
          {
            key: "code",
            role: "param",
            required: true,
            editableKey: false,
            editableValue: true,
            removable: false,
            defaultValue: ""
          }
        ]
      }
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundled node library includes BT.CPP builtin ports", async () => {
  const presets = await loadNodeLibraryPresets(join(__dirname, "../../node-library"));
  const byKey = new Map(presets.map((preset) => [preset.key, preset]));

  assert.deepEqual(
    byKey.get("Switch4")?.fields.map((field) => [field.key, field.role, field.defaultValue]),
    [
      ["variable", "input", ""],
      ["case_1", "input", ""],
      ["case_2", "input", ""],
      ["case_3", "input", ""],
      ["case_4", "input", ""]
    ]
  );

  assert.deepEqual(
    byKey.get("LoopInt")?.fields.map((field) => [field.key, field.role, field.defaultValue]),
    [
      ["queue", "inout", ""],
      ["if_empty", "input", "SUCCESS"],
      ["value", "output", ""]
    ]
  );

  assert.deepEqual(
    byKey.get("ParallelAll")?.fields.map((field) => [field.key, field.role, field.defaultValue]),
    [["max_failures", "input", "1"]]
  );

  assert.deepEqual(
    byKey.get("WasEntryUpdated")?.fields.map((field) => [field.key, field.role, field.defaultValue]),
    [["entry", "input", ""]]
  );
});
