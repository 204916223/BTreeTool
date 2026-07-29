const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { validateAtlas } = require("./atlas-core.js");

const repoRoot = path.resolve(__dirname, "../..");
const atlasDir = path.join(repoRoot, "node-library", "atlas");
const atlasFiles = {
  nodes: path.join(atlasDir, "nodes.json"),
  variables: path.join(atlasDir, "variables.json"),
  meta: path.join(atlasDir, "meta.json")
};
const defaultMeta = {
  schemaVersion: 1,
  atlasVersion: "1",
  updatedAt: "",
  source: {
    asyncTag: "unknown"
  }
};

let editorWindow = null;
let editorDirty = false;
let allowClose = false;

function assertAtlasKind(kind) {
  if (!Object.prototype.hasOwnProperty.call(atlasFiles, kind)) {
    throw new Error(`Unsupported atlas file kind: ${kind}`);
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readJson(kind) {
  assertAtlasKind(kind);
  const text = await readTextIfExists(atlasFiles[kind]);
  if (text == null) {
    if (kind === "meta") {
      return structuredClone(defaultMeta);
    }
    throw new Error(`Missing atlas file: ${atlasFiles[kind]}`);
  }
  return JSON.parse(text);
}

function hashText(text) {
  return text == null ? null : crypto.createHash("sha256").update(text).digest("hex");
}

async function currentHash(kind) {
  assertAtlasKind(kind);
  return hashText(await readTextIfExists(atlasFiles[kind]));
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function createSaveError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function validateBundle(bundle) {
  const nodes = Object.prototype.hasOwnProperty.call(bundle, "nodes") ? bundle.nodes : await readJson("nodes");
  const variables = Object.prototype.hasOwnProperty.call(bundle, "variables") ? bundle.variables : await readJson("variables");
  const meta = Object.prototype.hasOwnProperty.call(bundle, "meta") ? bundle.meta : await readJson("meta");
  const issues = validateAtlas(nodes, variables, meta);
  const errors = issues.filter((issue) => issue.level === "error");
  if (errors.length > 0) {
    throw createSaveError(`图鉴校验失败：\n${errors.slice(0, 12).map((issue) => `- ${issue.message}`).join("\n")}`, "ATLAS_VALIDATION_FAILED");
  }
  return issues;
}

async function saveBundle(values, expectedHashes = {}) {
  const kinds = Object.keys(values);
  kinds.forEach(assertAtlasKind);
  await validateBundle(values);

  for (const kind of kinds) {
    const actualHash = await currentHash(kind);
    const expectedHash = expectedHashes[kind] ?? null;
    if (actualHash !== expectedHash) {
      throw createSaveError(
        `${path.basename(atlasFiles[kind])} 在加载后已被其他操作修改。请先重载磁盘并检查差异。`,
        "ATLAS_FILE_CONFLICT"
      );
    }
  }

  const transactionId = `${process.pid}-${Date.now()}`;
  const staged = new Map();
  const originals = new Map();
  const replaced = [];
  try {
    for (const kind of kinds) {
      const target = atlasFiles[kind];
      const temporary = `${target}.tmp-${transactionId}`;
      originals.set(kind, await readTextIfExists(target));
      await fs.writeFile(temporary, serializeJson(values[kind]), "utf8");
      staged.set(kind, temporary);
    }
    for (const kind of kinds) {
      await fs.rename(staged.get(kind), atlasFiles[kind]);
      replaced.push(kind);
    }
  } catch (error) {
    for (const kind of replaced.reverse()) {
      const original = originals.get(kind);
      if (original == null) {
        await fs.rm(atlasFiles[kind], { force: true });
      } else {
        await fs.writeFile(atlasFiles[kind], original, "utf8");
      }
    }
    throw error;
  } finally {
    await Promise.all(Array.from(staged.values(), (temporary) => fs.rm(temporary, { force: true })));
  }

  const hashes = {};
  for (const kind of kinds) {
    hashes[kind] = await currentHash(kind);
  }
  return { hashes };
}

async function loadAtlasPayload() {
  const files = {
    nodes: await readJson("nodes"),
    variables: await readJson("variables"),
    meta: await readJson("meta")
  };
  const hashes = {
    nodes: await currentHash("nodes"),
    variables: await currentHash("variables"),
    meta: await currentHash("meta")
  };
  return { repoRoot, atlasDir, files, hashes, issues: validateAtlas(files.nodes, files.variables, files.meta) };
}

function createWindow() {
  editorWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    title: "BTreeTool Atlas Editor",
    backgroundColor: "#101317",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "electron-preload.cjs")
    }
  });

  editorWindow.on("close", (event) => {
    if (!editorDirty || allowClose) {
      return;
    }
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(editorWindow, {
      type: "warning",
      buttons: ["继续编辑", "放弃未保存更改"],
      defaultId: 0,
      cancelId: 0,
      title: "存在未保存的图鉴更改",
      message: "图鉴仍有未保存的更改，确定要关闭吗？"
    });
    if (choice === 1) {
      allowClose = true;
      editorWindow.close();
    }
  });
  editorWindow.on("closed", () => {
    editorWindow = null;
    editorDirty = false;
    allowClose = false;
  });
  editorWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("atlas-editor:load", loadAtlasPayload);
  ipcMain.handle("atlas-editor:validate", async (_event, values) => validateAtlas(values?.nodes, values?.variables, values?.meta));
  ipcMain.handle("atlas-editor:save", async (_event, kind, value, meta, expectedHashes) => {
    assertAtlasKind(kind);
    const nextMeta = {
      ...(meta || defaultMeta),
      schemaVersion: 1,
      updatedAt: new Date().toISOString()
    };
    const result = await saveBundle({ [kind]: value, meta: nextMeta }, expectedHashes);
    return { ...result, meta: nextMeta };
  });
  ipcMain.handle("atlas-editor:save-all", async (_event, values, expectedHashes) => {
    const nextMeta = {
      ...(values?.meta || defaultMeta),
      schemaVersion: 1,
      updatedAt: new Date().toISOString()
    };
    const result = await saveBundle({ nodes: values?.nodes, variables: values?.variables, meta: nextMeta }, expectedHashes);
    return { ...result, meta: nextMeta };
  });
  ipcMain.handle("atlas-editor:set-dirty", (_event, dirty) => {
    editorDirty = dirty === true;
  });
  ipcMain.handle("atlas-editor:open-atlas-dir", async () => shell.openPath(atlasDir));

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
