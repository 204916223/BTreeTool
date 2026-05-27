(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

  function createDeleteConfirmBar() {
    const element = document.createElement("div");
    element.className = "delete-confirm";
    element.hidden = true;
    const overlayCopy = runtime.i18n.getOverlayCopy();

    const text = document.createElement("div");
    text.className = "delete-confirm-text";

    const actions = document.createElement("div");
    actions.className = "delete-confirm-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "canvas-btn subtle";
    cancelButton.textContent = overlayCopy.cancel;
    cancelButton.addEventListener("click", hideDeleteConfirm);

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "canvas-btn danger";
    confirmButton.textContent = overlayCopy.delete;
    confirmButton.addEventListener("click", () => {
      const pending = overlayState.deleteConfirmBar.state;
      if (!pending) {
        return;
      }

      runtime.vscode.postMessage({
        type: "deleteNode",
        payload: {
          treeId: pending.treeId,
          nodePath: pending.nodePath
        }
      });
      hideDeleteConfirm();
    });

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    element.appendChild(text);
    element.appendChild(actions);

    return {
      element,
      text,
      cancelButton,
      confirmButton,
      state: null
    };
  }

  function requestDeleteConfirmation(state) {
    if (!runtime.app.canPerformAction("requestNodeDelete", state || {})) {
      return;
    }

    if (!state?.treeId || !state.nodePath) {
      return;
    }

    runtime.state.selectedNodePath = state.parentPath || (state.nodePath === "0" ? "__btree_root__" : "0");
    runtime.app.persistUiState();
    if (runtime.state.currentSettings?.requireNodeDeleteConfirmation !== true) {
      deleteNodeImmediately(state);
      return;
    }

    showDeleteConfirm(state);
  }

  function deleteNodeImmediately(state) {
    hideDeleteConfirm();
    runtime.vscode.postMessage({
      type: "deleteNode",
      payload: {
        treeId: state.treeId,
        nodePath: state.nodePath
      }
    });
  }

  function showDeleteConfirm(state) {
    const title = state.nodeTitle || "this node";
    const overlayCopy = runtime.i18n.getOverlayCopy();
    overlayState.deleteConfirmBar.state = state;
    overlayState.deleteConfirmBar.cancelButton.textContent = overlayCopy.cancel;
    overlayState.deleteConfirmBar.confirmButton.textContent = overlayCopy.delete;
    overlayState.deleteConfirmBar.text.textContent = overlayCopy.deleteConfirm(title);
    overlayState.deleteConfirmBar.element.hidden = false;
    shared.syncBlockingOverlay();
  }

  function hideDeleteConfirm() {
    if (!overlayState.deleteConfirmBar) {
      return;
    }

    overlayState.deleteConfirmBar.state = null;
    overlayState.deleteConfirmBar.element.hidden = true;
    shared.syncBlockingOverlay();
  }

  overlayRuntime.parts.deleteConfirm = {
    createDeleteConfirmBar,
    requestDeleteConfirmation,
    hideDeleteConfirm
  };
})();
