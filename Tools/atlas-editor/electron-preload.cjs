const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atlasEditorBridge", {
  loadAtlas: () => ipcRenderer.invoke("atlas-editor:load"),
  validateAtlas: (values) => ipcRenderer.invoke("atlas-editor:validate", values),
  saveAtlasFile: (kind, value, meta, expectedHashes) =>
    ipcRenderer.invoke("atlas-editor:save", kind, value, meta, expectedHashes),
  saveAllAtlasFiles: (values, expectedHashes) =>
    ipcRenderer.invoke("atlas-editor:save-all", values, expectedHashes),
  setDirty: (dirty) => ipcRenderer.invoke("atlas-editor:set-dirty", dirty),
  openAtlasDir: () => ipcRenderer.invoke("atlas-editor:open-atlas-dir")
});
