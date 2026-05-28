(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  let measureHost = null;
  let dragPreviewViewport = null;
  let dragPreviewTransitionTimer = null;
  const DRAG_PREVIEW_ZOOM_FACTOR = 0.86;
  const DRAG_PREVIEW_ZOOM_MARGIN = 72;
  const DRAG_PREVIEW_MIN_ZOOM = 0.28;
  const DROP_TARGET_REFERENCE_SIZE = {
    width: 230,
    height: 250
  };

  function init() {
    enableHorizontalWheelScroll(runtime.refs.treeSwitcher, {
      draggableTargetSelector: ".tree-tab",
      dragClassName: "is-drag-scrolling"
    });
    enableHorizontalWheelScroll(runtime.refs.warningList, {
      dragClassName: "is-drag-scrolling"
    });
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  function enableHorizontalWheelScroll(element, options = {}) {
    if (!element) {
      return;
    }

    const draggableTargetSelector = options.draggableTargetSelector || null;
    const dragClassName = options.dragClassName || "is-drag-scrolling";
    const dragThreshold = 10;

    element.addEventListener(
      "wheel",
      (event) => {
        const canScroll = element.scrollWidth > element.clientWidth + 2;
        if (!canScroll) {
          return;
        }

        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (!delta) {
          return;
        }

        element.scrollLeft += delta;
        event.preventDefault();
      },
      { passive: false }
    );

    let pointerActive = false;
    let dragStarted = false;
    let startX = 0;
    let startScrollLeft = 0;
    let pointerId = null;
    let suppressClickUntil = 0;
    let originalScrollBehavior = "";

    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      if (!isValidDragTarget(event.target, draggableTargetSelector)) {
        return;
      }

      pointerActive = true;
      dragStarted = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = element.scrollLeft;
    });

    element.addEventListener("pointermove", (event) => {
      if (!pointerActive) {
        return;
      }

      const deltaX = event.clientX - startX;
      if (!dragStarted) {
        if (Math.abs(deltaX) < dragThreshold) {
          return;
        }
        dragStarted = true;
        originalScrollBehavior = element.style.scrollBehavior;
        element.style.scrollBehavior = "auto";
        element.classList.add(dragClassName);
        try {
          element.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Ignore pointer capture failures on older webviews.
        }
      }

      element.scrollLeft = startScrollLeft - deltaX;
      event.preventDefault();
    });

    const stopDragging = (event) => {
      if (!pointerActive) {
        return;
      }

      if (dragStarted) {
        suppressClickUntil = Date.now() + 180;
      }

      pointerActive = false;
      dragStarted = false;
      element.classList.remove(dragClassName);
      element.style.scrollBehavior = originalScrollBehavior;
      try {
        element.releasePointerCapture(pointerId ?? event.pointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
      pointerId = null;
    };

    element.addEventListener("pointerup", stopDragging);
    element.addEventListener("pointercancel", stopDragging);

    element.addEventListener(
      "click",
      (event) => {
        if (Date.now() <= suppressClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
          }
        }
      },
      true
    );
  }

  function isValidDragTarget(target, draggableTargetSelector) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (!draggableTargetSelector) {
      return !target.closest("button");
    }

    const interactiveMatch = target.closest(draggableTargetSelector);
    if (interactiveMatch) {
      return true;
    }

    return !target.closest("button");
  }

  function ensureMeasureHost() {
    if (measureHost) {
      return measureHost;
    }

    measureHost = document.createElement("div");
    measureHost.className = "layout-measure-host";
    document.body.appendChild(measureHost);
    return measureHost;
  }

  function buildTreeLayout(rootNode, result) {
    const config = {
      horizontalGap: 28,
      verticalGap: 72,
      paddingX: 40,
      paddingY: 36
    };

    const measuredNodes = new Map();
    const dropTargetReferenceSize = DROP_TARGET_REFERENCE_SIZE;
    const measured = measureSubtree(rootNode, false);
    const expandedMeasured = measureSubtree(rootNode, true);
    const positioned = positionSubtree(measured, config.paddingX, config.paddingY);
    const expandedPositioned = positionSubtree(expandedMeasured, config.paddingX, config.paddingY);
    const expandedByPath = new Map();
    const nodes = [];
    const edges = [];
    let maxX = 0;
    let maxY = 0;

    indexExpanded(expandedPositioned);
    collect(positioned);

    return {
      width: maxX + config.paddingX,
      height: Math.max(maxY + config.paddingY, 640),
      rootCenterX: nodes[0]?.centerX || 450,
      dropTargetReferenceSize,
      nodes,
      edges
    };

    function measureSubtree(node, expanded) {
      const box = measureNodeBox(node, expanded);
      const children = node.children.map((child) => measureSubtree(child, expanded));

      if (children.length === 0) {
        return {
          node,
          width: box.width,
          height: box.height,
          subtreeWidth: box.width,
          subtreeHeight: box.height,
          children
        };
      }

      const childrenWidth =
        children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        config.horizontalGap * Math.max(0, children.length - 1);
      const maxChildrenHeight = Math.max(...children.map((child) => child.subtreeHeight));

      return {
        node,
        width: box.width,
        height: box.height,
        children,
        subtreeWidth: Math.max(box.width, childrenWidth),
        subtreeHeight: box.height + config.verticalGap + maxChildrenHeight
      };
    }

    function positionSubtree(entry, offsetX, offsetY) {
      const positionedChildren = [];
      const nodeX = offsetX + (entry.subtreeWidth - entry.width) / 2;
      const nodeY = offsetY;

      if (entry.children.length > 0) {
        let childCursorX =
          offsetX +
          (entry.subtreeWidth -
            (entry.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
              config.horizontalGap * Math.max(0, entry.children.length - 1))) /
            2;

        const childY = offsetY + entry.height + config.verticalGap;
        entry.children.forEach((child) => {
          const positionedChild = positionSubtree(child, childCursorX, childY);
          positionedChildren.push(positionedChild);
          childCursorX += child.subtreeWidth + config.horizontalGap;
        });
      }

      return {
        node: entry.node,
        x: nodeX,
        y: nodeY,
        width: entry.width,
        height: entry.height,
        children: positionedChildren
      };
    }

    function collect(entry, parent) {
      const expandedEntry = expandedByPath.get(entry.node.nodePath) || entry;
      const descriptor = {
        node: entry.node,
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        dropTargetX: expandedEntry.x,
        dropTargetY: expandedEntry.y,
        dropTargetWidth: expandedEntry.width,
        dropTargetHeight: expandedEntry.height,
        dropTargetReferenceSize,
        expandForDropTarget:
          !entry.node.isVirtualRoot &&
          (expandedEntry.width > entry.width || expandedEntry.height > entry.height),
        centerX: entry.x + entry.width / 2
      };

      nodes.push(descriptor);
      maxX = Math.max(maxX, descriptor.x + descriptor.width);
      maxY = Math.max(maxY, descriptor.y + descriptor.height);
      maxX = Math.max(maxX, expandedEntry.x + expandedEntry.width);
      maxY = Math.max(maxY, expandedEntry.y + expandedEntry.height);

      if (parent) {
        const expandedParent = expandedByPath.get(parent.node?.nodePath) || parent;
        edges.push({
          parentNodePath: parent.node?.nodePath || "",
          childNodePath: descriptor.node.nodePath,
          startX: parent.centerX,
          startY: parent.y + parent.height,
          endX: descriptor.centerX,
          endY: descriptor.y,
          dropStartX: expandedParent.x + expandedParent.width / 2,
          dropStartY: expandedParent.y + expandedParent.height,
          dropEndX: expandedEntry.x + expandedEntry.width / 2,
          dropEndY: expandedEntry.y
        });
      }

      entry.children.forEach((child) => collect(child, descriptor));
    }

    function indexExpanded(entry) {
      expandedByPath.set(entry.node.nodePath, entry);
      entry.children.forEach(indexExpanded);
    }

    function measureNodeBox(node, expanded) {
      const hiddenSections = runtime.modeRules?.isPlaybackMode?.() !== true && runtime.state.forceHideNodeDetails
        ? "all"
        : (runtime.state.currentSettings?.simplifyHiddenSections || []).join(",");
      const cacheKey = `${hiddenSections}::${expanded ? "expanded" : "base"}::${node.nodePath}`;
      if (measuredNodes.has(cacheKey)) {
        return measuredNodes.get(cacheKey);
      }

      const host = ensureMeasureHost();
      const measured = measureCardSize(node, host);

      if (expanded && !node.isVirtualRoot) {
        measured.width = Math.max(measured.width, dropTargetReferenceSize.width);
        measured.height = Math.max(measured.height, dropTargetReferenceSize.height);
      }

      measuredNodes.set(cacheKey, measured);
      return measured;
    }

    function measureCardSize(node, host) {
      host.style.width = "auto";
      host.replaceChildren();
      const previewCard = runtime.canvas.buildNodeCard(node, result, { interactive: false, measuring: true });
      host.appendChild(previewCard);

      const previewRect = previewCard.getBoundingClientRect();
      const previewWidth = Math.ceil(previewRect.width);

      host.style.width = `${previewWidth}px`;
      host.replaceChildren();
      const lockedCard = runtime.canvas.buildNodeCard(node, result, { interactive: false, measuring: true });
      host.appendChild(lockedCard);

      const lockedRect = lockedCard.getBoundingClientRect();
      host.style.width = "auto";
      return {
        width: Math.ceil(lockedRect.width),
        height: Math.ceil(lockedRect.height)
      };
    }

  }

  function setupCanvas(shell, stage, layout, viewportState = null, options = {}) {
    const paneId = options.paneId || "main";
    const canvasState = {
      shell,
      stage,
      layout,
      paneId,
      panX: 0,
      panY: 0,
      zoom: viewportState?.zoom || 1
    };
    shell.__btreeCanvasState = canvasState;
    runtime.state.canvasStatesByPane = {
      ...(runtime.state.canvasStatesByPane || {}),
      [paneId]: canvasState
    };
    if (options.active !== false) {
      activateCanvasState(canvasState);
    }
    syncCanvasInteractionMode();
    enableCanvasPan(shell);

    requestAnimationFrame(() => {
      if (viewportState) {
        setCanvasPan(viewportState.panX, viewportState.panY, canvasState);
        if (options.active !== false) {
          activateCanvasState(canvasState);
        }
        return;
      }
      fitCanvasWhenReady(canvasState, options.active !== false);
    });
  }

  function fitCanvasWhenReady(canvasState, activateAfterFit, previousSize = null, frame = 0) {
    if (!canvasState?.shell) {
      return;
    }

    const size = {
      width: canvasState.shell.clientWidth,
      height: canvasState.shell.clientHeight
    };
    const stable =
      size.width > 0 &&
      size.height > 0 &&
      previousSize?.width === size.width &&
      previousSize?.height === size.height;

    if (stable || frame >= 5) {
      fitCanvas(canvasState);
      if (activateAfterFit) {
        activateCanvasState(canvasState);
      }
      return;
    }

    requestAnimationFrame(() => {
      fitCanvasWhenReady(canvasState, activateAfterFit, size, frame + 1);
    });
  }

  function enableCanvasPan(shell) {
    let dragging = false;
    let didPan = false;
    let clearSelectionOnRelease = false;
    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    shell.addEventListener("pointerenter", () => {
      activateCanvasState(shell.__btreeCanvasState);
    });

    shell.addEventListener("pointerdown", (event) => {
      activateCanvasState(shell.__btreeCanvasState);
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      const onNodeCard = Boolean(event.target.closest(".flow-card"));
      const onEditableControl = Boolean(event.target.closest("input, textarea, select, [contenteditable='true']"));
      if (!onEditableControl) {
        blurActiveCanvasInput();
      }
      clearSelectionOnRelease = !onNodeCard && !onEditableControl;
      if (onNodeCard && !runtime.state.isSpacePressed) {
        return;
      }

      dragging = true;
      didPan = false;
      startX = event.clientX;
      startY = event.clientY;
      initialPanX = shell.__btreeCanvasState?.panX || 0;
      initialPanY = shell.__btreeCanvasState?.panY || 0;
      shell.classList.add("is-dragging");
      shell.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    shell.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      activateCanvasState(shell.__btreeCanvasState);
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (!didPan && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
        didPan = true;
      }
      setCanvasPan(initialPanX + deltaX, initialPanY + deltaY);
    });

    const stopDragging = () => {
      const shouldClearSelection = clearSelectionOnRelease && !didPan;
      if (!dragging) {
        if (shouldClearSelection) {
          clearCanvasSelection();
        }
        clearSelectionOnRelease = false;
        return;
      }

      if (didPan) {
        runtime.state.suppressNodeClickUntil = Date.now() + 120;
      }

      dragging = false;
      didPan = false;
      shell.classList.remove("is-dragging");
      if (shouldClearSelection) {
        clearCanvasSelection();
      }
      clearSelectionOnRelease = false;
    };

    shell.addEventListener("pointerup", stopDragging);
    shell.addEventListener("pointercancel", stopDragging);

    shell.addEventListener(
      "wheel",
      (event) => {
        activateCanvasState(shell.__btreeCanvasState);
        event.preventDefault();
        if (event.deltaY !== 0) {
          const delta = event.deltaY < 0 ? 0.08 : -0.08;
          zoomCanvas(delta, { originX: event.clientX, originY: event.clientY });
        }
      },
      { passive: false }
    );
  }

  function blurActiveCanvasInput() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return;
    }

    if (
      activeElement.matches("input, textarea, select") ||
      activeElement.isContentEditable
    ) {
      activeElement.blur();
    }
  }

  function clearCanvasSelection() {
    if (runtime.state.selectedNodePath === null) {
      return;
    }

    runtime.state.selectedNodePath = null;
    runtime.app.persistUiState?.();
    if (runtime.state.latestPayload) {
      runtime.app.renderCurrentTree(runtime.state.latestPayload, { preserveViewport: true });
    }
  }

  function zoomCanvas(delta, origin) {
    if (!runtime.state.currentCanvasState) {
      return;
    }

    const canvasState = runtime.state.currentCanvasState;
    const nextZoom = clamp(
      Number(((canvasState.zoom || runtime.state.currentZoom || 1) + delta).toFixed(2)),
      runtime.state.MIN_ZOOM,
      runtime.state.MAX_ZOOM
    );
    applyZoom(nextZoom, true, origin, canvasState);
  }

  function activateCanvasState(canvasState) {
    if (!canvasState) {
      return;
    }

    runtime.state.currentCanvasState = canvasState;
    runtime.state.currentZoom = canvasState.zoom || 1;
    updateZoomLabel();
    syncCanvasInteractionMode();
  }

  function beginDragPreviewViewport() {
    if (!runtime.state.currentCanvasState || dragPreviewViewport) {
      return;
    }

    const canvasState = runtime.state.currentCanvasState;
    const { shell, panX, panY } = canvasState;
    dragPreviewViewport = {
      canvasState,
      zoom: canvasState.zoom || runtime.state.currentZoom || 1,
      panX,
      panY
    };
    enableDragPreviewTransition(shell);

    const nextZoom = getDragPreviewZoom();
    if (nextZoom < (canvasState.zoom || runtime.state.currentZoom || 1) - 0.01) {
      applyZoom(nextZoom, true, null, canvasState);
    }
  }

  function endDragPreviewViewport() {
    if (!dragPreviewViewport) {
      return;
    }

    const snapshot = dragPreviewViewport;
    dragPreviewViewport = null;
    if (!snapshot.canvasState) {
      return;
    }

    const { shell } = snapshot.canvasState;
    activateCanvasState(snapshot.canvasState);
    enableDragPreviewTransition(shell);
    snapshot.canvasState.zoom = snapshot.zoom;
    setCanvasPan(snapshot.panX, snapshot.panY, snapshot.canvasState);
    activateCanvasState(snapshot.canvasState);
    dragPreviewTransitionTimer = window.setTimeout(() => {
      shell.classList.remove("is-drag-preview-zooming");
    }, 160);
  }

  function getDragPreviewZoom() {
    const canvasState = runtime.state.currentCanvasState;
    if (!canvasState) {
      return runtime.state.currentZoom;
    }

    const { shell, layout } = canvasState;
    const availableWidth = Math.max(shell.clientWidth - DRAG_PREVIEW_ZOOM_MARGIN, 1);
    const availableHeight = Math.max(shell.clientHeight - DRAG_PREVIEW_ZOOM_MARGIN, 1);
    const fittedZoom = Math.min(availableWidth / layout.width, availableHeight / layout.height, 1);
    const currentZoom = canvasState.zoom || runtime.state.currentZoom || 1;
    const targetZoom = Math.min(
      currentZoom * DRAG_PREVIEW_ZOOM_FACTOR,
      fittedZoom * 0.98,
      currentZoom
    );
    return clamp(Number(targetZoom.toFixed(2)), DRAG_PREVIEW_MIN_ZOOM, currentZoom);
  }

  function enableDragPreviewTransition(shell) {
    if (dragPreviewTransitionTimer) {
      window.clearTimeout(dragPreviewTransitionTimer);
      dragPreviewTransitionTimer = null;
    }
    shell.classList.add("is-drag-preview-zooming");
  }

  function fitCanvas(canvasState = runtime.state.currentCanvasState) {
    if (!canvasState) {
      return;
    }

    const { shell, layout } = canvasState;
    const fitX = (shell.clientWidth - 40) / layout.width;
    const fitY = (shell.clientHeight - 40) / layout.height;
    const strictFit = Math.min(fitX, fitY, 1);
    const widthBiasedFit = Math.min(fitX, fitY * 1.35, 1);
    const targetZoom = clamp(Math.max(strictFit, widthBiasedFit), runtime.state.MIN_ZOOM, 1);
    applyZoom(targetZoom, false, null, canvasState);
  }

  function applyZoom(nextZoom, preserveCenter, origin, canvasState = runtime.state.currentCanvasState) {
    if (!canvasState) {
      return;
    }

    const { shell, layout } = canvasState;
    const previousZoom = canvasState.zoom || runtime.state.currentZoom || 1;
    canvasState.zoom = nextZoom;
    if (runtime.state.currentCanvasState === canvasState) {
      runtime.state.currentZoom = nextZoom;
      updateZoomLabel();
    }

    if (!preserveCenter) {
      const fittedPan = getFittedPan(shell, layout, canvasState.zoom);
      setCanvasPan(fittedPan.panX, fittedPan.panY, canvasState);
      return;
    }

    const rect = shell.getBoundingClientRect();
    const pointerX = origin ? origin.originX - rect.left : shell.clientWidth / 2;
    const pointerY = origin ? origin.originY - rect.top : shell.clientHeight / 2;
    const worldX = (pointerX - canvasState.panX) / previousZoom;
    const worldY = (pointerY - canvasState.panY) / previousZoom;
    const nextPanX = pointerX - worldX * canvasState.zoom;
    const nextPanY = pointerY - worldY * canvasState.zoom;
    setCanvasPan(nextPanX, nextPanY, canvasState);
  }

  function setCanvasPan(nextPanX, nextPanY, canvasState = runtime.state.currentCanvasState) {
    if (!canvasState) {
      return;
    }

    const clamped = clampCanvasPan(
      nextPanX,
      nextPanY,
      canvasState.shell,
      canvasState.layout,
      canvasState.zoom || runtime.state.currentZoom || 1
    );
    const snappedPanX = Math.round(clamped.panX);
    const snappedPanY = Math.round(clamped.panY);

    canvasState.panX = snappedPanX;
    canvasState.panY = snappedPanY;
    canvasState.stage.style.transform =
      `translate(${snappedPanX}px, ${snappedPanY}px) scale(${canvasState.zoom || runtime.state.currentZoom || 1})`;
    canvasState.stage.style.transformOrigin = "top left";
    if (runtime.state.currentCanvasState === canvasState) {
      runtime.state.currentZoom = canvasState.zoom || runtime.state.currentZoom || 1;
      updateZoomLabel();
    }
  }

  function clampCanvasPan(nextPanX, nextPanY, shell, layout, zoom) {
    const margin = 24;
    const contentWidth = layout.width * zoom;
    const contentHeight = layout.height * zoom;

    const clampAxis = (viewportSize, contentSize, desired) => {
      const overscroll = clamp(viewportSize * 1.2, 640, 1280);

      if (contentSize <= viewportSize - margin * 2) {
        const center = (viewportSize - contentSize) / 2;
        const edgeReach = Math.max((viewportSize - contentSize) / 2 - margin, 0);
        const roam = edgeReach + overscroll;
        return clamp(desired, center - roam, center + roam);
      }

      const min = viewportSize - contentSize - overscroll;
      const max = overscroll;
      return clamp(desired, min, max);
    };

    return {
      panX: clampAxis(shell.clientWidth, contentWidth, nextPanX),
      panY: clampAxis(shell.clientHeight, contentHeight, nextPanY)
    };
  }

  function getFittedPan(shell, layout, zoom) {
    const contentWidth = layout.width * zoom;
    const contentHeight = layout.height * zoom;
    const rootNode = layout.nodes?.[0];

    if (rootNode?.node?.isVirtualRoot === true) {
      const topMargin = Math.min(42, Math.max(24, shell.clientHeight * 0.08));
      return {
        panX: shell.clientWidth / 2 - rootNode.centerX * zoom,
        panY: topMargin - rootNode.y * zoom
      };
    }

    return {
      panX: (shell.clientWidth - contentWidth) / 2,
      panY: (shell.clientHeight - contentHeight) / 2
    };
  }

  function updateZoomLabel() {
    if (runtime.state.currentCanvasState) {
      runtime.state.currentZoom = runtime.state.currentCanvasState.zoom || runtime.state.currentZoom || 1;
    }
    if (runtime.refs.zoomLevelLabel) {
      runtime.refs.zoomLevelLabel.textContent = `${Math.round(runtime.state.currentZoom * 100)}%`;
    }
  }

  function focusNodePath(nodePath) {
    if (!runtime.state.currentCanvasState?.layout || !runtime.state.currentCanvasState?.shell) {
      return;
    }

    const entry = runtime.state.currentCanvasState.layout.nodes.find((item) => item.node?.nodePath === nodePath);
    if (!entry) {
      return;
    }

    const { shell } = runtime.state.currentCanvasState;
    const zoom = runtime.state.currentCanvasState.zoom || runtime.state.currentZoom || 1;
    const targetPanX = shell.clientWidth / 2 - (entry.x + entry.width / 2) * zoom;
    const targetPanY = shell.clientHeight / 2 - (entry.y + entry.height / 2) * zoom;
    setCanvasPan(targetPanX, targetPanY, runtime.state.currentCanvasState);
  }

  function refreshViewport() {
    if (!runtime.state.currentCanvasState?.shell || !runtime.state.currentCanvasState?.layout) {
      return;
    }

    setCanvasPan(
      runtime.state.currentCanvasState.panX,
      runtime.state.currentCanvasState.panY,
      runtime.state.currentCanvasState
    );
    updateZoomLabel();
  }

  function syncCanvasInteractionMode() {
    document.querySelectorAll(".canvas-shell").forEach((shell) => {
      shell.classList.toggle("is-hand-mode", runtime.state.isSpacePressed);
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  runtime.viewport = {
    init,
    clampNumber,
    buildTreeLayout,
    setupCanvas,
    activateCanvasState,
    enableHorizontalWheelScroll,
    fitCanvas,
    updateZoomLabel,
    syncCanvasInteractionMode,
    zoomCanvas,
    beginDragPreviewViewport,
    endDragPreviewViewport,
    setCanvasPan,
    focusNodePath,
    refreshViewport
  };
})();
