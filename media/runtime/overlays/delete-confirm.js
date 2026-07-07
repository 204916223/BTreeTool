(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

  function createDeleteConfirmBar() {
    const element = document.createElement("div");
    element.className = "delete-confirm-host";
    element.hidden = true;

    return {
      element,
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

    requestDeleteConfirmDialog(state);
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

  async function requestDeleteConfirmDialog(state) {
    const title = state.nodeTitle || "this node";
    const overlayCopy = runtime.i18n.getOverlayCopy();
    overlayState.deleteConfirmBar.state = state;
    const confirmed = await runtime.overlays.confirm({
      title: overlayCopy.deleteNode,
      message: overlayCopy.deleteConfirm(title),
      cancelText: overlayCopy.cancel,
      confirmText: overlayCopy.delete,
      tone: "danger"
    });
    if (confirmed && overlayState.deleteConfirmBar?.state === state) {
      deleteNodeImmediately(state);
      return;
    }
    hideDeleteConfirm();
  }

  function showDeleteConfirm(state) {
    requestDeleteConfirmDialog(state);
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
