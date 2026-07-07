(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function buildNoDocumentState(appCopy) {
    const shell = document.createElement("div");
    shell.className = "startup-state";

    const title = document.createElement("strong");
    title.className = "startup-state-title";
    title.textContent = appCopy.startupTitle;

    const summary = document.createElement("p");
    summary.className = "startup-state-summary";
    summary.textContent = appCopy.startupSummary;

    shell.appendChild(title);
    shell.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "startup-state-actions";

    const createButton = document.createElement("button");
    createButton.className = "canvas-btn accent";
    createButton.type = "button";
    createButton.textContent = appCopy.createNewXml;
    createButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "createNewBehaviorTreeDocument" });
    });

    const openButton = document.createElement("button");
    openButton.className = "canvas-btn";
    openButton.type = "button";
    openButton.textContent = appCopy.openExistingXml;
    openButton.addEventListener("click", () => {
      runtime.app.renderDocumentOpeningState?.();
      runtime.vscode.postMessage({ type: "openExistingBehaviorTreeDocument" });
    });

    actions.appendChild(createButton);
    actions.appendChild(openButton);
    shell.appendChild(actions);

    return shell;
  }

  function buildDocumentOpeningState(appCopy) {
    const shell = document.createElement("div");
    shell.className = "startup-state";

    const title = document.createElement("strong");
    title.className = "startup-state-title";
    title.textContent = appCopy.openExistingXml;

    const summary = document.createElement("p");
    summary.className = "startup-state-summary";
    summary.textContent = appCopy.openExistingOpening;

    shell.appendChild(title);
    shell.appendChild(summary);
    return shell;
  }

  function buildPlaybackImportState(appCopy) {
    const shell = document.createElement("div");
    shell.className = "startup-state";

    const title = document.createElement("strong");
    title.className = "startup-state-title";
    title.textContent = appCopy.importPlaybackLog;

    const summary = document.createElement("p");
    summary.className = "startup-state-summary";
    summary.textContent = runtime.state.playbackLogImporting ? appCopy.importPlaybackOpening : appCopy.importPlaybackSummary;

    const importButton = document.createElement("button");
    importButton.className = "canvas-btn accent";
    importButton.type = "button";
    importButton.textContent = appCopy.importPlaybackLog;
    importButton.addEventListener("click", () => {
      if (runtime.mainEvents?.requestPlaybackLogImport) {
        runtime.mainEvents.requestPlaybackLogImport();
        return;
      }
      runtime.vscode.postMessage({ type: "choosePlaybackLogFile" });
    });

    shell.appendChild(title);
    shell.appendChild(summary);
    if (!runtime.state.playbackLogImporting) {
      shell.appendChild(importButton);
    }
    return shell;
  }

  runtime.startupState = {
    buildNoDocumentState,
    buildDocumentOpeningState,
    buildPlaybackImportState
  };
})();
