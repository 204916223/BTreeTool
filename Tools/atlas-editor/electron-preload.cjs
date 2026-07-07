const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atlasEditorBridge", {
  loadAtlas: () => ipcRenderer.invoke("atlas-editor:load"),
  saveAtlasFile: (kind, value) => ipcRenderer.invoke("atlas-editor:save", kind, value),
  saveAllAtlasFiles: (values) => ipcRenderer.invoke("atlas-editor:save-all", values),
  openAtlasDir: () => ipcRenderer.invoke("atlas-editor:open-atlas-dir")
});
