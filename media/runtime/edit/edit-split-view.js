(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      getTreeMap,
      getSelectedTree,
      pickNodePath,
      emptyState,
      persistUiState,
      selectTreeInPane,
      activateTreePane,
      updateSplitPaneActiveState
    } = handlers;

    function renderSplitTreeView(result, viewportStates = {}) {
      ensureSplitPaneState(result);
      runtime.treeSwitcher.updateActive?.();
      runtime.state.canvasStatesByPane = {};

      const treeMap = getTreeMap(result);
      const container = document.createElement("div");
      container.className = "tree-split-view";

      ["left", "right"].forEach((paneId) => {
        container.appendChild(renderTreePane(result, treeMap, paneId, viewportStates[paneId] || null));
      });

      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeContent.replaceChildren(container);
      persistUiState();

      const activeTree = getSelectedTree(result);
      runtime.mainTreeLocator.render(result, activeTree);
      runtime.canvas.clearDragState();
      updateSplitPaneActiveState();
      requestAnimationFrame(() => {
        const activeCanvasState = runtime.state.canvasStatesByPane?.[runtime.state.activeTreePane];
        if (activeCanvasState) {
          runtime.viewport.activateCanvasState(activeCanvasState);
        }
      });
    }

    function renderTreePane(result, treeMap, paneId, viewportState) {
      const treeId = runtime.state.splitPaneTreeIds?.[paneId];
      const tree = treeMap.get(treeId) || null;
      const isActive = runtime.state.activeTreePane === paneId;
      const pane = document.createElement("section");
      pane.className = isActive ? "tree-split-pane is-active" : "tree-split-pane";
      pane.dataset.paneId = paneId;
      if (treeId) {
        pane.dataset.treeId = treeId;
      }

      const header = document.createElement("div");
      header.className = "tree-split-pane-header";

      const title = document.createElement("span");
      title.className = "tree-split-pane-title";
      const isChinese = runtime.state.currentSettings?.language === "zh-CN";
      title.textContent = paneId === "left" ? (isChinese ? "左" : "Left") : (isChinese ? "右" : "Right");

      const select = runtime.overlayRuntime.shared.createChoiceControl({
        className: "tree-split-pane-select",
        options: result.behaviorTrees.map((entry) => ({
          value: entry.id,
          label: entry.id
        })),
        value: treeId || result.behaviorTrees[0]?.id || "",
        onChange(value) {
          selectTreeInPane(paneId, value, result);
        }
      });
      select.element.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        activateTreePane(paneId, select.getValue(), null);
      });

      header.appendChild(title);
      header.appendChild(select.element);
      pane.appendChild(header);

      pane.addEventListener("pointerdown", () => {
        activateTreePane(paneId, treeId, null);
      });
      pane.addEventListener("focusin", () => {
        activateTreePane(paneId, treeId, null);
      });
      pane.addEventListener("dragenter", () => {
        activateTreePane(paneId, treeId, null);
      });

      if (!tree) {
        pane.appendChild(emptyState(runtime.i18n.getAppCopy().selectedTreeNotFound));
        return pane;
      }

      const paneSelectedNodePath = runtime.state.splitPaneNodePaths?.[paneId];
      const selectedNodePath = paneSelectedNodePath === null
        ? null
        : pickNodePath(tree, paneSelectedNodePath ?? runtime.state.selectedNodePath);
      runtime.state.splitPaneNodePaths = {
        ...(runtime.state.splitPaneNodePaths || {}),
        [paneId]: selectedNodePath
      };
      if (isActive) {
        runtime.state.selectedTreeId = tree.id;
        runtime.state.selectedNodePath = selectedNodePath;
      }

      pane.appendChild(
        runtime.canvas.renderTree(tree, result, viewportState, {
          paneId,
          active: isActive,
          selectedNodePath
        })
      );
      return pane;
    }

    function getCanvasViewportState(canvasState) {
      return runtime.viewport.getCanvasViewportState(canvasState);
    }

    function getSplitViewportStates() {
      const states = {};
      Object.entries(runtime.state.canvasStatesByPane || {}).forEach(([paneId, canvasState]) => {
        const viewportState = getCanvasViewportState(canvasState);
        if (viewportState) {
          states[paneId] = viewportState;
        }
      });
      return states;
    }

    function ensureSplitPaneState(result) {
      if (!result || !result.behaviorTrees?.length) {
        return;
      }

      const treeMap = getTreeMap(result);
      const currentTreeId = treeMap.has(runtime.state.selectedTreeId) ? runtime.state.selectedTreeId : result.defaultTreeId;
      const paneTreeIds = {
        ...(runtime.state.splitPaneTreeIds || {})
      };

      if (!treeMap.has(paneTreeIds.left)) {
        paneTreeIds.left = currentTreeId;
      }
      if (!treeMap.has(paneTreeIds.right)) {
        paneTreeIds.right = pickNeighborTreeId(result, paneTreeIds.left);
      }

      runtime.state.splitPaneTreeIds = paneTreeIds;
      if (runtime.state.activeTreePane !== "right") {
        runtime.state.activeTreePane = "left";
      }

      const activeTreeId = paneTreeIds[runtime.state.activeTreePane] || paneTreeIds.left || result.defaultTreeId;
      runtime.state.selectedTreeId = treeMap.has(activeTreeId) ? activeTreeId : result.defaultTreeId;
      const activePaneNodePath = runtime.state.splitPaneNodePaths?.[runtime.state.activeTreePane];
      runtime.state.selectedNodePath =
        activePaneNodePath === null ? null : activePaneNodePath ?? runtime.state.selectedNodePath ?? "0";
    }

    function pickNeighborTreeId(result, treeId) {
      const treeIds = result.behaviorTrees.map((tree) => tree.id);
      if (treeIds.length === 0) {
        return null;
      }
      const currentIndex = Math.max(0, treeIds.indexOf(treeId));
      return treeIds.find((candidate) => candidate !== treeId) || treeIds[currentIndex] || treeIds[0];
    }

    return {
      renderSplitTreeView,
      getCanvasViewportState,
      getSplitViewportStates,
      ensureSplitPaneState
    };
  }

  runtime.editSplitView = {
    create
  };
})();
