(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const parts = overlayRuntime.parts || {};
  const api = (overlayRuntime.api = overlayRuntime.api || {});

  function getPart(name) {
    const part = parts[name];
    if (!part) {
      throw new Error(`BTreeTool overlay part not loaded: ${name}`);
    }
    return part;
  }

  function init() {
    const contextMenus = getPart("contextMenus");
    overlayState.nodeContextMenu = contextMenus.createNodeContextMenu();
    overlayState.canvasContextMenu = contextMenus.createCanvasContextMenu();
    overlayState.deleteConfirmBar = getPart("deleteConfirm").createDeleteConfirmBar();
    overlayState.nodePicker = getPart("nodePicker").createNodePicker();
    overlayState.settingsDialog = getPart("settingsDialog").createSettingsDialog();
    overlayState.behaviorTreeDialog = getPart("behaviorTreeDialog").createBehaviorTreeDialog();
    overlayState.treeNodesModelDialog = getPart("treeModelDialog").createTreeNodesModelDialog();
    overlayState.nodeEditorDialog = getPart("nodeEditorDialog").createNodeEditorDialog();

    document.body.appendChild(overlayState.nodeContextMenu.element);
    document.body.appendChild(overlayState.canvasContextMenu.element);
    document.body.appendChild(overlayState.deleteConfirmBar.element);
    document.body.appendChild(overlayState.nodePicker.element);
    document.body.appendChild(overlayState.settingsDialog.element);
    document.body.appendChild(overlayState.behaviorTreeDialog.element);
    document.body.appendChild(overlayState.treeNodesModelDialog.element);
    document.body.appendChild(overlayState.nodeEditorDialog.element);
  }

  function hideAll() {
    api.hideNodeContextMenu();
    api.hideCanvasContextMenu();
    api.hideDeleteConfirm();
    api.hideNodePicker();
    api.hideSettingsDialog();
    api.hideBehaviorTreeDialog();
    api.hideTreeNodesModelDialog();
    api.hideNodeEditorDialog();
  }

  function handleEditResult(payload) {
    const behaviorTreeDialog = overlayState.behaviorTreeDialog;
    if (behaviorTreeDialog && !behaviorTreeDialog.element.hidden) {
      if (payload?.ok && behaviorTreeDialog.state.pendingAction) {
        api.hideBehaviorTreeDialog();
        return;
      }

      if (behaviorTreeDialog.state.pendingAction) {
        behaviorTreeDialog.state.pendingAction = null;
        behaviorTreeDialog.createButton.disabled = false;
      }
      getPart("behaviorTreeDialog").renderStatus(
        payload?.message || runtime.i18n.getBehaviorTreeDialogCopy().saveFinished,
        payload?.ok ? "success" : "error"
      );
      return;
    }

    const nodeEditor = overlayState.nodeEditorDialog;
    if (nodeEditor && !nodeEditor.element.hidden) {
      if (payload?.ok && nodeEditor.state.pendingAction) {
        api.hideNodeEditorDialog();
        return;
      }

      if (nodeEditor.state.pendingAction) {
        nodeEditor.state.pendingAction = null;
      }
      getPart("nodeEditorDialog").renderStatus(
        payload?.message || runtime.i18n.getNodeEditorCopy().saveFinished,
        payload?.ok ? "success" : "error"
      );
      return;
    }

    const treeModel = overlayState.treeNodesModelDialog;
    if (!treeModel || treeModel.element.hidden) {
      return;
    }

    if (payload?.ok && treeModel.state.pendingAction) {
      api.hideTreeNodesModelDialog();
      return;
    }

    getPart("treeModelDialog").renderStatus(
      payload?.message || runtime.i18n.getTreeNodesModelCopy().saveFinished,
      payload?.ok ? "success" : "error"
    );
  }

  Object.assign(api, {
    init,
    hideAll,
    showNodeContextMenu: (...args) => getPart("contextMenus").showNodeContextMenu(...args),
    hideNodeContextMenu: (...args) => getPart("contextMenus").hideNodeContextMenu(...args),
    showCanvasContextMenu: (...args) => getPart("contextMenus").showCanvasContextMenu(...args),
    hideCanvasContextMenu: (...args) => getPart("contextMenus").hideCanvasContextMenu(...args),
    executeNodeShortcutAction: (...args) => getPart("contextMenus").executeNodeShortcutAction(...args),
    requestDeleteConfirmation: (...args) => getPart("deleteConfirm").requestDeleteConfirmation(...args),
    hideDeleteConfirm: (...args) => getPart("deleteConfirm").hideDeleteConfirm(...args),
    showNodePicker: (...args) => getPart("nodePicker").showNodePicker(...args),
    hideNodePicker: (...args) => getPart("nodePicker").hideNodePicker(...args),
    showSettingsDialog: (...args) => getPart("settingsDialog").showSettingsDialog(...args),
    hideSettingsDialog: (...args) => getPart("settingsDialog").hideSettingsDialog(...args),
    showBehaviorTreeDialog: (...args) => getPart("behaviorTreeDialog").showBehaviorTreeDialog(...args),
    showBehaviorTreeDeleteDialog: (...args) => getPart("behaviorTreeDialog").showBehaviorTreeDeleteDialog(...args),
    hideBehaviorTreeDialog: (...args) => getPart("behaviorTreeDialog").hideBehaviorTreeDialog(...args),
    showTreeNodesModelDialog: (...args) => getPart("treeModelDialog").showTreeNodesModelDialog(...args),
    hideTreeNodesModelDialog: (...args) => getPart("treeModelDialog").hideTreeNodesModelDialog(...args),
    showNodeEditorDialog: (...args) => getPart("nodeEditorDialog").showNodeEditorDialog(...args),
    hideNodeEditorDialog: (...args) => getPart("nodeEditorDialog").hideNodeEditorDialog(...args),
    handleEditResult
  });

  runtime.overlays = api;
})();
