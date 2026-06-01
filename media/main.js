(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const vscode = acquireVsCodeApi();

  runtime.editController.start({
    vscode,
    persistedState: vscode.getState() || {},
    initialMode: window.BTreeToolInitialMode === "playback" ? "playback" : "edit",
    initialSettings: window.BTreeToolInitialSettings || {}
  });
})();
