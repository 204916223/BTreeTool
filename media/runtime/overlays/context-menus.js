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
      copyNodeFromState(overlayState.nodeContextMenu.state);
      hideNodeContextMenu();
    }, "", "cc");

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

      pasteNodeBefore(state);
      hideNodeContextMenu();
    });

    const pasteAfterButton = shared.createMenuButton(overlayCopy.pasteCopyAfter, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      pasteNodeAfter(state);
      hideNodeContextMenu();
    });

    const pasteChildButton = shared.createMenuButton(overlayCopy.pasteCopyAsChild, () => {
      const state = overlayState.nodeContextMenu.state;
      if (!state || !state.allowAppendChild) {
        return;
      }

      pasteNodeAsChild(state);
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

  function copyNodeFromState(state) {
    if (!state?.nodeTemplate) {
      return false;
    }

    runtime.state.copiedNodeTemplate = {
      title: state.nodeTitle || state.nodeTemplate.tagName,
      tagName: state.nodeTemplate.tagName,
      attributes: { ...(state.nodeTemplate.attributes || {}) },
      children: runtime.state.currentSettings?.copyNodeWithDescendants === false
        ? []
        : cloneNodeTemplateChildren(state.nodeTemplate.children)
    };
    runtime.state.hasSharedNodeTemplate = true;
    runtime.vscode.postMessage({
      type: "copyNodeTemplate",
      payload: {
        nodeTemplate: {
          tagName: runtime.state.copiedNodeTemplate.tagName,
          attributes: { ...(runtime.state.copiedNodeTemplate.attributes || {}) },
          children: cloneNodeTemplateChildren(runtime.state.copiedNodeTemplate.children)
        }
      }
    });
    return true;
  }

  function cloneNodeTemplateChildren(children) {
    if (!Array.isArray(children)) {
      return [];
    }

    return children
      .filter((child) => child?.tagName)
      .map((child) => ({
        tagName: child.tagName,
        attributes: { ...(child.attributes || {}) },
        children: cloneNodeTemplateChildren(child.children)
      }));
  }

  function pasteNodeBefore(state) {
    if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
      return false;
    }

    return pasteCopiedNode({
      treeId: state.treeId,
      paneId: state.paneId,
      targetParentPath: state.parentPath,
      targetIndex: state.siblingIndex
    });
  }

  function pasteNodeAfter(state) {
    if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
      return false;
    }

    return pasteCopiedNode({
      treeId: state.treeId,
      paneId: state.paneId,
      targetParentPath: state.parentPath,
      targetIndex: state.siblingIndex + 1
    });
  }

  function pasteNodeAsChild(state) {
    if (!state?.allowAppendChild) {
      return false;
    }

    return pasteCopiedNode({
      treeId: state.treeId,
      paneId: state.paneId,
      targetParentPath: state.nodePath,
      targetIndex: state.childCount || 0
    });
  }

  function pasteNodeSmart(state) {
    return pasteNodeAsChild(state) || pasteNodeAfter(state);
  }

  function pasteCopiedNode(target) {
    const copiedNodeTemplate = runtime.state.copiedNodeTemplate;
    if (!copiedNodeTemplate) {
      if (runtime.state.hasSharedNodeTemplate !== true) {
        return false;
      }
      return pasteSharedNodeTemplate(target);
    }

    selectPasteTarget(target);
    runtime.vscode.postMessage({
      type: "createNodeCopy",
      payload: {
        ...target,
        nodeTemplate: {
          tagName: copiedNodeTemplate.tagName,
          attributes: { ...(copiedNodeTemplate.attributes || {}) },
          children: cloneNodeTemplateChildren(copiedNodeTemplate.children)
        }
      }
    });
    return true;
  }

  function pasteSharedNodeTemplate(target) {
    selectPasteTarget(target);
    runtime.vscode.postMessage({
      type: "pasteSharedNodeTemplate",
      payload: target
    });
    return true;
  }

  function selectPasteTarget(target) {
    runtime.state.selectedNodePath = target.targetParentPath === "__btree_root__"
      ? "0"
      : `${target.targetParentPath}.${target.targetIndex}`;
    if (target.paneId) {
      runtime.app.activateTreePane(target.paneId, target.treeId, runtime.state.selectedNodePath);
    } else {
      runtime.app.activateTreePaneByTreeId(target.treeId, runtime.state.selectedNodePath);
    }
    runtime.app.persistUiState();
  }

  function getSelectedNodeContextState() {
    if (!runtime.state.currentPreview || runtime.modeRules?.isPlaybackMode?.()) {
      return null;
    }

    const tree = runtime.app.getSelectedTree(runtime.state.currentPreview);
    const nodePath = runtime.state.selectedNodePath || "0";
    const node = tree ? runtime.app.findNodeByPath(tree.node, nodePath) : null;
    if (!tree || !node) {
      return null;
    }

    const parentPath = runtime.canvas?.getParentNodePath?.(nodePath) ?? null;
    const siblingIndex = runtime.canvas?.getNodeIndex?.(nodePath);
    const isVirtualRoot = node.isVirtualRoot === true;

    return {
      treeId: tree.id,
      paneId: runtime.state.splitViewEnabled ? runtime.state.activeTreePane : null,
      nodePath,
      parentPath,
      siblingIndex,
      nodeTitle: node.title,
      nodeTemplate: isVirtualRoot
        ? null
        : toNodeCopyTemplate(node),
      allowAppendChild: runtime.canvas?.canAppendChildren?.(node) === true,
      childCount: node.children?.length || 0,
      allowDelete: runtime.canvas?.canDeleteNode?.(node) === true
    };
  }

  function toNodeCopyTemplate(node) {
    return {
      tagName: node.kind,
      attributes: { ...(node.attributes || {}) },
      children: cloneNodeChildrenForCopy(node.children)
    };
  }

  function cloneNodeChildrenForCopy(children) {
    if (!Array.isArray(children)) {
      return [];
    }

    return children.map(toNodeCopyTemplate);
  }

  function executeNodeShortcutAction(action) {
    if (document.body.classList.contains("has-blocking-overlay")) {
      return false;
    }
    if (isDuplicateShortcutAction(action)) {
      return false;
    }

    const state = overlayState.nodeContextMenu.state || getSelectedNodeContextState();
    if (!state || !runtime.app.canPerformAction("openNodeContextMenu", state)) {
      return false;
    }

    let handled = false;
    if (action === "copy") {
      handled = copyNodeFromState(state);
    } else if (action === "pasteSmart") {
      handled = pasteNodeSmart(state);
    } else if (action === "pasteBefore") {
      handled = pasteNodeBefore(state);
    } else if (action === "pasteAfter") {
      handled = pasteNodeAfter(state);
    } else if (action === "pasteAsChild") {
      handled = pasteNodeAsChild(state);
    }

    if (handled) {
      hideNodeContextMenu();
    }
    return handled;
  }

  function isDuplicateShortcutAction(action) {
    const now = Date.now();
    const lastAction = runtime.state.lastNodeShortcutAction;
    if (lastAction?.action === action && now - lastAction.time < 160) {
      return true;
    }
    runtime.state.lastNodeShortcutAction = { action, time: now };
    return false;
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

    hideCanvasContextMenu();
    const overlayCopy = runtime.i18n.getOverlayCopy();
    runtime.app.activateTreePane(state?.paneId, state?.treeId, state?.nodePath);
    overlayState.nodeContextMenu.state = state;
    const hasCopiedNode = Boolean(runtime.state.copiedNodeTemplate) || runtime.state.hasSharedNodeTemplate === true;
    overlayState.nodeContextMenu.copyNodeButton.hidden = !state?.nodeTemplate;
    overlayState.nodeContextMenu.addBeforeButton.hidden = !state?.parentPath || !Number.isInteger(state?.siblingIndex);
    overlayState.nodeContextMenu.addAfterButton.hidden = !state?.parentPath || !Number.isInteger(state?.siblingIndex);
    overlayState.nodeContextMenu.addChildButton.hidden = !state?.allowAppendChild;
    overlayState.nodeContextMenu.pasteBeforeButton.hidden = overlayState.nodeContextMenu.addBeforeButton.hidden;
    overlayState.nodeContextMenu.pasteAfterButton.hidden = overlayState.nodeContextMenu.addAfterButton.hidden;
    overlayState.nodeContextMenu.pasteChildButton.hidden = overlayState.nodeContextMenu.addChildButton.hidden;
    overlayState.nodeContextMenu.deleteButton.hidden = !state?.allowDelete;
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.copyNodeButton, overlayCopy.copyNode, "cc");
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.addBeforeButton, overlayCopy.addNewBefore);
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.addAfterButton, overlayCopy.addNewAfter);
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.addChildButton, overlayCopy.addNewChild);
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.pasteBeforeButton, overlayCopy.pasteCopyBefore);
    shared.setMenuButtonLabel(
      overlayState.nodeContextMenu.pasteAfterButton,
      overlayCopy.pasteCopyAfter,
      overlayState.nodeContextMenu.pasteChildButton.hidden ? "cv" : ""
    );
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.pasteChildButton, overlayCopy.pasteCopyAsChild, "cv");
    shared.setMenuButtonLabel(overlayState.nodeContextMenu.deleteButton, overlayCopy.deleteNode);
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

  function syncNodeContextMenu() {
    if (!overlayState.nodeContextMenu || overlayState.nodeContextMenu.element.hidden) {
      return;
    }

    const rect = overlayState.nodeContextMenu.element.getBoundingClientRect?.();
    const x = rect?.left ?? 0;
    const y = rect?.top ?? 0;
    showNodeContextMenu(x, y, overlayState.nodeContextMenu.state);
  }

  function hideNodeContextMenu() {
    if (!overlayState.nodeContextMenu) {
      return;
    }

    overlayState.nodeContextMenu.state = null;
    overlayState.nodeContextMenu.element.hidden = true;
  }

  function showCanvasContextMenu(x, y) {
    if (!overlayState.canvasContextMenu || runtime.modeRules?.isPlaybackMode?.() === true) {
      hideCanvasContextMenu();
      return;
    }

    hideNodeContextMenu();
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
    syncNodeContextMenu,
    hideNodeContextMenu,
    showCanvasContextMenu,
    hideCanvasContextMenu,
    executeNodeShortcutAction
  };
})();
