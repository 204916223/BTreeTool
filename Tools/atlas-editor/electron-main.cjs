const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const atlasDir = path.join(repoRoot, "node-library", "atlas");
const atlasFiles = {
  nodes: path.join(atlasDir, "nodes.json"),
  variables: path.join(atlasDir, "variables.json")
};

function assertAtlasKind(kind) {
  if (!Object.prototype.hasOwnProperty.call(atlasFiles, kind)) {
    throw new Error(`Unsupported atlas file kind: ${kind}`);
  }
}

async function readJson(kind) {
  assertAtlasKind(kind);
  const text = await fs.readFile(atlasFiles[kind], "utf8");
  return JSON.parse(text);
}

async function writeJson(kind, value) {
  assertAtlasKind(kind);
  const target = atlasFiles[kind];
  const temporary = `${target}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(temporary, text, "utf8");
  await fs.rename(temporary, target);
  return { kind, path: target };
}

function createWindow() {
  const window = new BrowserWindow({
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

  window.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("atlas-editor:load", async () => ({
    repoRoot,
    atlasDir,
    files: {
      nodes: await readJson("nodes"),
      variables: await readJson("variables")
    }
  }));

  ipcMain.handle("atlas-editor:save", async (_event, kind, value) => writeJson(kind, value));
  ipcMain.handle("atlas-editor:save-all", async (_event, values) => {
    const result = [];
    for (const kind of Object.keys(atlasFiles)) {
      result.push(await writeJson(kind, values?.[kind]));
    }
    return result;
  });
  ipcMain.handle("atlas-editor:open-atlas-dir", async () => {
    await shell.openPath(atlasDir);
  });

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
