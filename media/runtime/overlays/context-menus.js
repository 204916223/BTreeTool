(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;
  const overlayApi = (overlayRuntime.api = overlayRuntime.api || {});

  function createNodeContextMenu() {
    const element = document.createElement("div");
    element.className = "node-context-menu";
    element.hidden = true;
    const overlayCopy = runtime.i18n.getOverlayCopy();

    const copyNodeButton = shared.createMenuButton(overlayCopy.copyNode, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state?.nodeTemplate) {
        return;
      }

      runtime.state.copiedNodeTemplate = {
        title: state.nodeTitle || state.nodeTemplate.tagName,
        tagName: state.nodeTemplate.tagName,
        attributes: { ...(state.nodeTemplate.attributes || {}) }
      };
      hideNodeContextMenu();
    });

    const addBeforeButton = shared.createMenuButton(overlayCopy.addNewBefore, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      overlayApi.showNodePicker({
        treeId: state.treeId,
        paneId: state.paneId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex,
        title: runtime.i18n.getOverlayCopy().addNodeBeforeTitle(state.nodeTitle)
      });
      hideNodeContextMenu();
    });

    const addAfterButton = shared.createMenuButton(overlayCopy.addNewAfter, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      overlayApi.showNodePicker({
        treeId: state.treeId,
        paneId: state.paneId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex + 1,
        title: runtime.i18n.getOverlayCopy().addNodeAfterTitle(state.nodeTitle)
      });
      hideNodeContextMenu();
    });

    const addChildButton = shared.createMenuButton(overlayCopy.addNewChild, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.allowAppendChild) {
        return;
      }

      overlayApi.showNodePicker({
        treeId: state.treeId,
        paneId: state.paneId,
        targetParentPath: state.nodePath,
        targetIndex: state.childCount || 0,
        title: runtime.i18n.getOverlayCopy().addChildTitle(state.nodeTitle)
      });
      hideNodeContextMenu();
    });

    const pasteBeforeButton = shared.createMenuButton(overlayCopy.pasteCopyBefore, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      pasteCopiedNode({
        treeId: state.treeId,
        paneId: state.paneId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex
      });
      hideNodeContextMenu();
    });

    const pasteAfterButton = shared.createMenuButton(overlayCopy.pasteCopyAfter, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      pasteCopiedNode({
        treeId: state.treeId,
        paneId: state.paneId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex + 1
      });
      hideNodeContextMenu();
    });

    const pasteChildButton = shared.createMenuButton(overlayCopy.pasteCopyAsChild, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.allowAppendChild) {
        return;
      }

      pasteCopiedNode({
        treeId: state.treeId,
        paneId: state.paneId,
        targetParentPath: state.nodePath,
        targetIndex: state.childCount || 0
      });
      hideNodeContextMenu();
    });

    const deleteButton = shared.createMenuButton(overlayCopy.deleteNode, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state) {
        return;
      }

      overlayApi.requestDeleteConfirmation(state);
      hideNodeContextMenu();
    }, "danger");

    element.appendChild(copyNodeButton);
    element.appendChild(addBeforeButton);
    element.appendChild(addAfterButton);
    element.appendChild(addChildButton);
    element.appendChild(pasteBeforeButton);
    element.appendChild(pasteAfterButton);
    element.appendChild(pasteChildButton);
    element.appendChild(deleteButton);

    return {
      element,
      state: null,
      copyNodeButton,
      addBeforeButton,
      addAfterButton,
      addChildButton,
      pasteBeforeButton,
      pasteAfterButton,
      pasteChildButton,
      deleteButton
    };
  }

  function pasteCopiedNode(target) {
    const copiedNodeTemplate = runtime.state.copiedNodeTemplate;
    if (!copiedNodeTemplate) {
      return;
    }

    runtime.state.selectedNodePath = target.targetParentPath === "__btree_root__"
      ? "0"
      : `${target.targetParentPath}.${target.targetIndex}`;
    if (target.paneId) {
      runtime.app.activateTreePane(target.paneId, target.treeId, runtime.state.selectedNodePath);
    } else {
      runtime.app.activateTreePaneByTreeId(target.treeId, runtime.state.selectedNodePath);
    }
    runtime.app.persistUiState();
    runtime.vscode.postMessage({
      type: "createNodeCopy",
      payload: {
        ...target,
        nodeTemplate: {
          tagName: copiedNodeTemplate.tagName,
          attributes: { ...(copiedNodeTemplate.attributes || {}) }
        }
      }
    });
  }

  function createCanvasContextMenu() {
    const element = document.createElement("div");
    element.className = "node-context-menu";
    element.hidden = true;

    const toggleDetailsButton = shared.createMenuButton("", () => {
      runtime.state.forceHideNodeDetails = !runtime.state.forceHideNodeDetails;
      hideCanvasContextMenu();
      if (runtime.state.currentPreview) {
        runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
      }
    });

    element.appendChild(toggleDetailsButton);

    return {
      element,
      toggleDetailsButton
    };
  }

  function showNodeContextMenu(x, y, state) {
    if (!runtime.app.canPerformAction("openNodeContextMenu", state || {})) {
      return;
    }

    const overlayCopy = runtime.i18n.getOverlayCopy();
    runtime.app.activateTreePane(state?.paneId, state?.treeId, state?.nodePath);
    overlayState.nodeContextMenu.state = state;
    const hasCopiedNode = Boolean(runtime.state.copiedNodeTemplate);
    overlayState.nodeContextMenu.copyNodeButton.textContent = overlayCopy.copyNode;
    overlayState.nodeContextMenu.addBeforeButton.textContent = overlayCopy.addNewBefore;
    overlayState.nodeContextMenu.addAfterButton.textContent = overlayCopy.addNewAfter;
    overlayState.nodeContextMenu.addChildButton.textContent = overlayCopy.addNewChild;
    overlayState.nodeContextMenu.pasteBeforeButton.textContent = overlayCopy.pasteCopyBefore;
    overlayState.nodeContextMenu.pasteAfterButton.textContent = overlayCopy.pasteCopyAfter;
    overlayState.nodeContextMenu.pasteChildButton.textContent = overlayCopy.pasteCopyAsChild;
    overlayState.nodeContextMenu.deleteButton.textContent = overlayCopy.deleteNode;
    overlayState.nodeContextMenu.copyNodeButton.hidden = !state?.nodeTemplate;
    overlayState.nodeContextMenu.addBeforeButton.hidden = !state?.parentPath || !Number.isInteger(state?.siblingIndex);
    overlayState.nodeContextMenu.addAfterButton.hidden = !state?.parentPath || !Number.isInteger(state?.siblingIndex);
    overlayState.nodeContextMenu.addChildButton.hidden = !state?.allowAppendChild;
    overlayState.nodeContextMenu.pasteBeforeButton.hidden = overlayState.nodeContextMenu.addBeforeButton.hidden;
    overlayState.nodeContextMenu.pasteAfterButton.hidden = overlayState.nodeContextMenu.addAfterButton.hidden;
    overlayState.nodeContextMenu.pasteChildButton.hidden = overlayState.nodeContextMenu.addChildButton.hidden;
    overlayState.nodeContextMenu.deleteButton.hidden = !state?.allowDelete;
    shared.setMenuButtonDisabled(overlayState.nodeContextMenu.pasteBeforeButton, !hasCopiedNode);
    shared.setMenuButtonDisabled(overlayState.nodeContextMenu.pasteAfterButton, !hasCopiedNode);
    shared.setMenuButtonDisabled(overlayState.nodeContextMenu.pasteChildButton, !hasCopiedNode);

    const hasVisibleAction =
      !overlayState.nodeContextMenu.copyNodeButton.hidden ||
      !overlayState.nodeContextMenu.addBeforeButton.hidden ||
      !overlayState.nodeContextMenu.addAfterButton.hidden ||
      !overlayState.nodeContextMenu.addChildButton.hidden ||
      !overlayState.nodeContextMenu.pasteBeforeButton.hidden ||
      !overlayState.nodeContextMenu.pasteAfterButton.hidden ||
      !overlayState.nodeContextMenu.pasteChildButton.hidden ||
      !overlayState.nodeContextMenu.deleteButton.hidden;

    if (!hasVisibleAction) {
      hideNodeContextMenu();
      return;
    }

    overlayState.nodeContextMenu.element.hidden = false;
    overlayState.nodeContextMenu.element.style.left = `${x}px`;
    overlayState.nodeContextMenu.element.style.top = `${y}px`;
  }

  function hideNodeContextMenu() {
    if (!overlayState.nodeContextMenu) {
      return;
    }

    overlayState.nodeContextMenu.state = null;
    overlayState.nodeContextMenu.element.hidden = true;
  }

  function showCanvasContextMenu(x, y) {
    if (!overlayState.canvasContextMenu) {
      return;
    }

    const overlayCopy = runtime.i18n.getOverlayCopy();
    overlayState.canvasContextMenu.toggleDetailsButton.textContent = runtime.state.forceHideNodeDetails
      ? overlayCopy.showConfiguredNodeDetails
      : overlayCopy.hideAllNodeDetails;
    overlayState.canvasContextMenu.element.hidden = false;
    overlayState.canvasContextMenu.element.style.left = `${x}px`;
    overlayState.canvasContextMenu.element.style.top = `${y}px`;
  }

  function hideCanvasContextMenu() {
    if (!overlayState.canvasContextMenu) {
      return;
    }

    overlayState.canvasContextMenu.element.hidden = true;
  }

  overlayRuntime.parts.contextMenus = {
    createNodeContextMenu,
    createCanvasContextMenu,
    showNodeContextMenu,
    hideNodeContextMenu,
    showCanvasContextMenu,
    hideCanvasContextMenu
  };
})();
