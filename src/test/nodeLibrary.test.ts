import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMergedNodeLibraryPresets, loadNodeLibraryPresets } from "../core/nodeLibrary";
import {
  createDefaultNodeLibraryBackup,
  importTreeNodesModelToNodeLibrary,
  restoreDefaultNodeLibrary
} from "../core/nodeLibraryImport";

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

test("loadMergedNodeLibraryPresets lets imported nodes override bundled presets", async () => {
  const bundledRoot = await mkdtemp(join(tmpdir(), "btt-node-library-bundled-"));
  const importedRoot = await mkdtemp(join(tmpdir(), "btt-node-library-imported-"));
  try {
    await mkdir(join(bundledRoot, "Action"), { recursive: true });
    await mkdir(join(importedRoot, "Action"), { recursive: true });
    await writeFile(
      join(bundledRoot, "Action", "SharedNode.btt"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<node name="SharedNode" category="Action" modelKind="Action" allowCustomAttributes="true">\n  <input_port name="value" default="bundled" required="true" />\n</node>\n`,
      "utf8"
    );
    await writeFile(
      join(importedRoot, "Action", "SharedNode.btt"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<node name="SharedNode" category="Action" modelKind="Action" allowCustomAttributes="true">\n  <input_port name="value" default="imported" required="true" />\n</node>\n`,
      "utf8"
    );
    await writeFile(
      join(importedRoot, "Action", "ImportedOnly.btt"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<node name="ImportedOnly" category="Action" modelKind="Action" allowCustomAttributes="true" />\n`,
      "utf8"
    );

    const presets = await loadMergedNodeLibraryPresets([bundledRoot, importedRoot]);
    const byKey = new Map(presets.map((preset) => [preset.key, preset]));

    assert.deepEqual(Array.from(byKey.keys()).sort(), ["ImportedOnly", "SharedNode"]);
    assert.deepEqual(
      byKey.get("SharedNode")?.fields.map((field) => [field.key, field.defaultValue]),
      [["value", "imported"]]
    );
  } finally {
    await rm(bundledRoot, { recursive: true, force: true });
    await rm(importedRoot, { recursive: true, force: true });
  }
});

test("importTreeNodesModelToNodeLibrary writes .btt files by model category", async () => {
  const root = await mkdtemp(join(tmpdir(), "btt-node-library-import-"));
  try {
    const result = await importTreeNodesModelToNodeLibrary(
      `<TreeNodesModel>
  <Action ID="TESTTT">
    <input_port name="TESTTT" type="int" default="23" description="xx" />
    <output_port name="TESTT" type="string" default="{testt}" description="dd" />
  </Action>
  <Condition ID="Ready">
    <input_port name="flag" type="bool" default="true" description="ready flag" />
  </Condition>
</TreeNodesModel>`,
      root
    );

    assert.equal(result.importedCount, 2);
    assert.equal(result.skippedCount, 0);

    const action = await readFile(join(root, "Action", "TESTTT.btt"), "utf8");
    assert.match(action, /<node name="TESTTT" category="Action" modelKind="Action" allowCustomAttributes="true">/);
    assert.match(action, /<input_port name="TESTTT" type="int" default="23" description="xx" \/>/);
    assert.match(action, /<output_port name="TESTT" type="string" default="\{testt\}" description="dd" \/>/);

    const condition = await readFile(join(root, "Condition", "Ready.btt"), "utf8");
    assert.match(condition, /<node name="Ready" category="Condition" modelKind="Condition" allowCustomAttributes="true">/);
    assert.match(condition, /<input_port name="flag" type="bool" default="true" description="ready flag" \/>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("importTreeNodesModelToNodeLibrary lets callers skip conflicting nodes", async () => {
  const root = await mkdtemp(join(tmpdir(), "btt-node-library-conflict-"));
  try {
    await mkdir(join(root, "Action"), { recursive: true });
    await writeFile(join(root, "Action", "TESTTT.btt"), "existing content\n", "utf8");

    const result = await importTreeNodesModelToNodeLibrary(
      `<TreeNodesModel>
  <Action ID="TESTTT">
    <input_port name="value" default="1" />
  </Action>
  <Action ID="NewNode">
    <input_port name="flag" default="true" />
  </Action>
</TreeNodesModel>`,
      root,
      {
        resolveConflicts: async (conflicts) => {
          assert.deepEqual(conflicts.map((conflict) => `${conflict.category}/${conflict.nodeId}`), ["Action/TESTTT"]);
          return "skip";
        }
      }
    );

    assert.equal(result.importedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.canceled, false);
    assert.equal(await readFile(join(root, "Action", "TESTTT.btt"), "utf8"), "existing content\n");
    assert.match(await readFile(join(root, "Action", "NewNode.btt"), "utf8"), /<node name="NewNode"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("importTreeNodesModelToNodeLibrary detects conflicts in read-only library roots", async () => {
  const bundledRoot = await mkdtemp(join(tmpdir(), "btt-node-library-conflict-bundled-"));
  const importedRoot = await mkdtemp(join(tmpdir(), "btt-node-library-conflict-imported-"));
  try {
    await mkdir(join(bundledRoot, "Action"), { recursive: true });
    await writeFile(join(bundledRoot, "Action", "TESTTT.btt"), "bundled content\n", "utf8");

    const result = await importTreeNodesModelToNodeLibrary(
      `<TreeNodesModel>
  <Action ID="TESTTT">
    <input_port name="value" default="1" />
  </Action>
</TreeNodesModel>`,
      importedRoot,
      {
        conflictRootPaths: [bundledRoot],
        resolveConflicts: async (conflicts) => {
          assert.deepEqual(conflicts.map((conflict) => `${conflict.category}/${conflict.nodeId}`), ["Action/TESTTT"]);
          assert.equal(conflicts[0]?.filePath, join(importedRoot, "Action", "TESTTT.btt"));
          return "skip";
        }
      }
    );

    assert.equal(result.importedCount, 0);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.canceled, false);
    await assert.rejects(readFile(join(importedRoot, "Action", "TESTTT.btt"), "utf8"), /ENOENT/);
  } finally {
    await rm(bundledRoot, { recursive: true, force: true });
    await rm(importedRoot, { recursive: true, force: true });
  }
});

test("importTreeNodesModelToNodeLibrary cancels before writing any files", async () => {
  const root = await mkdtemp(join(tmpdir(), "btt-node-library-cancel-"));
  try {
    await mkdir(join(root, "Action"), { recursive: true });
    await writeFile(join(root, "Action", "TESTTT.btt"), "existing content\n", "utf8");

    const result = await importTreeNodesModelToNodeLibrary(
      `<TreeNodesModel>
  <Action ID="TESTTT">
    <input_port name="value" default="1" />
  </Action>
  <Action ID="NewNode">
    <input_port name="flag" default="true" />
  </Action>
</TreeNodesModel>`,
      root,
      {
        resolveConflicts: async () => "cancel"
      }
    );

    assert.equal(result.importedCount, 0);
    assert.equal(result.skippedCount, 2);
    assert.equal(result.canceled, true);
    assert.equal(await readFile(join(root, "Action", "TESTTT.btt"), "utf8"), "existing content\n");
    await assert.rejects(readFile(join(root, "Action", "NewNode.btt"), "utf8"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restoreDefaultNodeLibrary restores the backup snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "btt-node-library-restore-"));
  try {
    await mkdir(join(root, "Action"), { recursive: true });
    await mkdir(join(root, "Condition"), { recursive: true });
    await writeFile(join(root, "Action", "BaseAction.btt"), "base action\n", "utf8");
    await writeFile(join(root, "Condition", "BaseCondition.btt"), "base condition\n", "utf8");

    const backup = await createDefaultNodeLibraryBackup(root);
    assert.equal(backup.backedUpCount, 2);

    await writeFile(join(root, "Action", "BaseAction.btt"), "changed action\n", "utf8");
    await writeFile(join(root, "Action", "ImportedAction.btt"), "imported action\n", "utf8");

    const result = await restoreDefaultNodeLibrary(root);

    assert.equal(result.restoredCount, 2);
    assert.equal(await readFile(join(root, "Action", "BaseAction.btt"), "utf8"), "base action\n");
    assert.equal(await readFile(join(root, "Condition", "BaseCondition.btt"), "utf8"), "base condition\n");
    await assert.rejects(readFile(join(root, "Action", "ImportedAction.btt"), "utf8"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
