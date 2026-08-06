(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  let measureHost = null;
  let dragPreviewViewport = null;
  let dragPreviewAnimationFrame = null;
  let dragPreviewTransitionTimer = null;
  let dragAutoPan = null;
  const DRAG_PREVIEW_ZOOM_FACTOR = 0.85;
  const DRAG_AUTO_PAN_EDGE = 20;
  const DRAG_AUTO_PAN_SPEED = 14;
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
      const expandedEntry = expandedByPath.get(getLayoutNodeKey(entry.node)) || entry;
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
        const expandedParent = expandedByPath.get(getLayoutNodeKey(parent.node)) || parent;
        edges.push({
          parentNodePath: parent.node?.nodePath || "",
          childNodePath: descriptor.node.nodePath,
          parentTreeId: parent.node?.sourceTreeId || "",
          childTreeId: descriptor.node.sourceTreeId || "",
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
      expandedByPath.set(getLayoutNodeKey(entry.node), entry);
      entry.children.forEach(indexExpanded);
    }

    function measureNodeBox(node, expanded) {
      const hiddenSections = runtime.modeRules?.isPlaybackMode?.() !== true && runtime.state.forceHideNodeDetails
        ? "all"
        : (runtime.state.currentSettings?.simplifyHiddenSections || []).join(",");
      const sectionTitleMode = normalizeNodeSectionTitleMode(runtime.state.currentSettings?.nodeSectionTitleMode);
      const baseCacheKey = `${hiddenSections}::${sectionTitleMode}::base::${getLayoutNodeKey(node)}`;
      const cacheKey = expanded
        ? `${hiddenSections}::${sectionTitleMode}::expanded::${getLayoutNodeKey(node)}`
        : baseCacheKey;
      if (measuredNodes.has(cacheKey)) {
        return measuredNodes.get(cacheKey);
      }

      let measured = measuredNodes.get(baseCacheKey);
      if (!measured) {
        const host = ensureMeasureHost();
        measured = measureCardSize(node, host);
        measuredNodes.set(baseCacheKey, measured);
      }

      if (expanded && !node.isVirtualRoot) {
        measured = {
          width: Math.max(measured.width, dropTargetReferenceSize.width),
          height: Math.max(measured.height, dropTargetReferenceSize.height)
        };
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

  function normalizeNodeSectionTitleMode(value) {
    return value === "hidden" || value === "emphasis" ? value : "regular";
  }

  function getLayoutNodeKey(node) {
    return node?.renderPath || `${node?.sourceTreeId || ""}::${node?.nodePath || ""}`;
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
      zoom: viewportState?.zoom || 1,
      selectedCard: null,
      viewportReady: false,
      restoringViewportState: viewportState || null
    };
    stage.style.visibility = "hidden";
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

    if (viewportState) {
      restoreCanvasViewportWhenReady(canvasState, viewportState, options.active !== false);
    } else {
      fitCanvasWhenReady(canvasState, options.active !== false);
    }
    window.setTimeout(() => {
      if (!canvasState.viewportReady) {
        revealCanvasStage(canvasState);
      }
    }, 600);
  }

  function waitForStableCanvasSize(canvasState, onReady, previousSize = null, frame = 0) {
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

    if (stable || (frame >= 12 && size.width > 0 && size.height > 0)) {
      onReady();
      return;
    }

    if (frame >= 30) {
      return;
    }

    requestAnimationFrame(() => {
      waitForStableCanvasSize(canvasState, onReady, size, frame + 1);
    });
  }

  function fitCanvasWhenReady(canvasState, activateAfterFit) {
    waitForStableCanvasSize(canvasState, () => {
      fitCanvas(canvasState);
      revealCanvasStage(canvasState);
      if (activateAfterFit) {
        activateCanvasState(canvasState);
      }
    });
  }

  function restoreCanvasViewportWhenReady(canvasState, viewportState, activateAfterRestore) {
    waitForStableCanvasSize(canvasState, () => {
      restoreCanvasViewportState(viewportState, canvasState, { reveal: true, activate: false });
      if (activateAfterRestore) {
        activateCanvasState(canvasState);
      }
    });
  }

  function restoreCanvasViewportState(viewportState, canvasState = runtime.state.currentCanvasState, options = {}) {
    if (!canvasState?.shell || !canvasState?.layout || !viewportState) {
      refreshViewport();
      return;
    }

    canvasState.zoom = viewportState.zoom || 1;
    const anchor = viewportState.anchor || null;
    const anchorEntry = findViewportAnchorEntry(canvasState, anchor);
    const viewportRect = anchor?.absoluteScreen ? canvasState.shell.getBoundingClientRect() : null;
    const targetScreenX = anchor?.absoluteScreen ? anchor.screenX - viewportRect.left : anchor?.screenX;
    const targetScreenY = anchor?.absoluteScreen ? anchor.screenY - viewportRect.top : anchor?.screenY;

    if (anchor && Number.isFinite(anchor.worldX) && Number.isFinite(anchor.worldY)) {
      setCanvasPan(
        targetScreenX - anchor.worldX * canvasState.zoom,
        targetScreenY - anchor.worldY * canvasState.zoom,
        canvasState
      );
    } else if (anchorEntry && anchor) {
      const anchorWorldX = Number.isFinite(anchor.localX)
        ? anchorEntry.x + anchor.localX
        : anchorEntry.centerX;
      const anchorWorldY = Number.isFinite(anchor.localY)
        ? anchorEntry.y + anchor.localY
        : anchorEntry.y + anchorEntry.height / 2;
      setCanvasPan(
        targetScreenX - anchorWorldX * canvasState.zoom,
        targetScreenY - anchorWorldY * canvasState.zoom,
        canvasState
      );
    } else {
      setCanvasPan(viewportState.panX || 0, viewportState.panY || 0, canvasState);
    }

    canvasState.restoringViewportState = null;
    if (options.reveal !== false) {
      revealCanvasStage(canvasState);
    }
    if (options.activate !== false) {
      activateCanvasState(canvasState);
    } else {
      updateZoomLabel();
    }
  }

  function getCanvasViewportState(canvasState, options = {}) {
    if (!canvasState) {
      return null;
    }

    if (!canvasState.viewportReady && canvasState.restoringViewportState) {
      return canvasState.restoringViewportState;
    }

    return {
      zoom: canvasState.zoom || runtime.state.currentZoom || 1,
      panX: canvasState.panX || 0,
      panY: canvasState.panY || 0,
      anchor: takePendingViewportAnchor(canvasState) || captureCanvasViewportAnchor(canvasState, options)
    };
  }

  function takePendingViewportAnchor(canvasState) {
    const pendingAnchor = runtime.state.pendingViewportAnchor;
    if (!pendingAnchor || !findViewportAnchorEntry(canvasState, pendingAnchor)) {
      return null;
    }

    runtime.state.pendingViewportAnchor = null;
    return pendingAnchor;
  }

  function captureCanvasViewportAnchor(canvasState, options = {}) {
    if (!canvasState?.layout || !canvasState.shell) {
      return null;
    }

    const zoom = canvasState.zoom || runtime.state.currentZoom || 1;
    const toScreenAnchor = (localX, localY, extra = {}) => {
      const rect = options.absoluteScreen ? canvasState.shell.getBoundingClientRect() : null;
      return {
        ...extra,
        screenX: options.absoluteScreen ? rect.left + localX : localX,
        screenY: options.absoluteScreen ? rect.top + localY : localY,
        absoluteScreen: options.absoluteScreen === true || undefined
      };
    };

    const selectedTreeId = runtime.state.selectedTreeId || "";
    const selectedNodePath = runtime.state.selectedNodePath || "";
    const entry = canvasState.layout.nodes.find((item) => {
      const node = item.node;
      return (
        node?.nodePath === selectedNodePath &&
        (!selectedTreeId || !node?.sourceTreeId || node.sourceTreeId === selectedTreeId)
      );
    });
    if (entry) {
      return toScreenAnchor(
        entry.centerX * zoom + (canvasState.panX || 0),
        (entry.y + entry.height / 2) * zoom + (canvasState.panY || 0),
        {
          treeId: entry.node?.sourceTreeId || selectedTreeId,
          nodePath: entry.node?.nodePath || selectedNodePath,
          renderPath: entry.node?.renderPath || ""
        }
      );
    }

    if (options.fallbackToCenter !== true && options.absoluteScreen !== true) {
      return null;
    }

    const localX = canvasState.shell.clientWidth / 2;
    const localY = canvasState.shell.clientHeight / 2;
    return toScreenAnchor(localX, localY, {
      worldX: (localX - (canvasState.panX || 0)) / zoom,
      worldY: (localY - (canvasState.panY || 0)) / zoom
    });
  }

  function captureNodePositionViewportAnchor(canvasState, nodePath, treeId) {
    if (!canvasState?.layout || !canvasState.shell || !nodePath) {
      return null;
    }

    const entry = findViewportAnchorEntry(canvasState, {
      treeId: treeId || "",
      nodePath
    });
    if (!entry) {
      return null;
    }

    const zoom = canvasState.zoom || runtime.state.currentZoom || 1;
    return {
      treeId: entry.node?.sourceTreeId || treeId || "",
      nodePath: entry.node?.nodePath || nodePath,
      renderPath: entry.node?.renderPath || "",
      screenX: entry.x * zoom + (canvasState.panX || 0),
      screenY: entry.y * zoom + (canvasState.panY || 0),
      localX: 0,
      localY: 0
    };
  }

  function revealCanvasStage(canvasState) {
    if (!canvasState?.stage) {
      return;
    }
    canvasState.viewportReady = true;
    canvasState.stage.style.visibility = "";
  }

  function findViewportAnchorEntry(canvasState, anchor) {
    if (!canvasState?.layout || !anchor) {
      return null;
    }

    if (anchor.renderPath) {
      const renderPathMatch = canvasState.layout.nodes.find((item) => item.node?.renderPath === anchor.renderPath);
      if (renderPathMatch) {
        return renderPathMatch;
      }
    }

    return canvasState.layout.nodes.find((item) => (
      item.node?.nodePath === anchor.nodePath &&
      (!anchor.treeId || !item.node?.sourceTreeId || item.node.sourceTreeId === anchor.treeId)
    )) || null;
  }

  function enableCanvasPan(shell) {
    let dragging = false;
    let didPan = false;
    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;
    let capturedPointerId = null;

    shell.addEventListener("pointerenter", () => {
      activateCanvasState(shell.__btreeCanvasState);
    });

    shell.addEventListener("contextmenu", (event) => {
      if (!runtime.state.currentDragState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      runtime.canvas?.clearDragState?.({ cancelled: true });
    }, true);

    const cancelNodeDrag = (event) => {
      if (!isSecondaryButtonDown(event) || !runtime.state.currentDragState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      runtime.canvas?.clearDragState?.({ cancelled: true });
    };
    shell.addEventListener("pointerdown", cancelNodeDrag, true);
    window.addEventListener("pointerdown", cancelNodeDrag, true);
    window.addEventListener("mousedown", cancelNodeDrag, true);
    window.addEventListener("mouseup", cancelNodeDrag, true);
    window.addEventListener("auxclick", cancelNodeDrag, true);
    window.addEventListener("contextmenu", (event) => {
      if (!runtime.state.currentDragState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      runtime.canvas?.clearDragState?.({ cancelled: true });
    }, true);

    const handleNodeDrag = (event) => {
      if (!runtime.state.currentDragState || runtime.state.currentCanvasState !== shell.__btreeCanvasState) {
        return;
      }

      if (isSecondaryButtonDown(event)) {
        event.preventDefault();
        runtime.canvas?.clearDragState?.({ cancelled: true });
        return;
      }

      const rect = shell.getBoundingClientRect();
      const visibleBounds = getCanvasVisibleBounds(shell.__btreeCanvasState);
      updateDragAutoPan(
        shell.__btreeCanvasState,
        event.clientX - rect.left,
        event.clientY - rect.top,
        visibleBounds
      );
    };
    shell.addEventListener("dragover", handleNodeDrag);
    shell.addEventListener("dragenter", handleNodeDrag);
    window.addEventListener("dragover", handleNodeDrag, true);
    window.addEventListener("dragenter", handleNodeDrag, true);
    window.addEventListener("drag", handleNodeDrag, true);

    shell.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget || !(event.relatedTarget instanceof Element) || !shell.contains?.(event.relatedTarget)) {
        // Keep the last edge velocity while the pointer is outside the visible
        // canvas. Re-entry events will update or stop it using real coordinates.
        return;
      }
    });

    shell.addEventListener("pointerdown", (event) => {
      activateCanvasState(shell.__btreeCanvasState);
      const target = event.target;
      if (!(target instanceof Element) || event.button !== 0 || target.closest("button")) {
        return;
      }

      const onNodeCard = Boolean(target.closest(".flow-card"));
      const onEditableControl = Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      if (!onEditableControl) {
        blurActiveCanvasInput();
      }
      if (!onNodeCard && !onEditableControl) {
        clearCanvasSelection({ render: false });
      }
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
      capturedPointerId = event.pointerId;
      try {
        shell.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore capture failures in webviews that already lost the pointer.
      }
      event.preventDefault();
    });

    shell.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      if (typeof event.buttons === "number" && (event.buttons & 1) === 0) {
        stopDragging(event, { force: true });
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

    const stopDragging = (event, options = {}) => {
      if (
        !options.force &&
        event &&
        capturedPointerId !== null &&
        "pointerId" in event &&
        event.pointerId !== capturedPointerId
      ) {
        return;
      }

      if (!dragging) {
        return;
      }

      if (didPan) {
        runtime.state.suppressNodeClickUntil = Date.now() + 120;
      }

      dragging = false;
      didPan = false;
      shell.classList.remove("is-dragging");
      if (capturedPointerId !== null) {
        try {
          shell.releasePointerCapture(capturedPointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
      }
      capturedPointerId = null;
    };

    shell.addEventListener("pointerup", stopDragging);
    shell.addEventListener("pointercancel", stopDragging);
    shell.addEventListener("lostpointercapture", stopDragging);
    window.addEventListener("pointerup", stopDragging, true);
    window.addEventListener("pointercancel", stopDragging, true);
    window.addEventListener("mouseup", stopDragging, true);
    window.addEventListener("blur", stopDragging);
    document.addEventListener?.("visibilitychange", () => {
      if (document.hidden) {
        stopDragging(null, { force: true });
      }
    });

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

  function clearCanvasSelection(options = {}) {
    const render = options.render !== false;
    runtime.viewport.updateCanvasSelection(null);
    runtime.state.selectedNodePath = null;
    runtime.editAssistant?.clearSelectedNodePrompt?.();
    if (runtime.state.splitViewEnabled && runtime.state.activeTreePane) {
      runtime.state.splitPaneNodePaths = {
        ...(runtime.state.splitPaneNodePaths || {}),
        [runtime.state.activeTreePane]: null
      };
    }
    runtime.app?.persistUiState?.();
    if (!render) {
      return;
    }
    if (runtime.modeRules?.isPlaybackMode?.() && runtime.state.playbackLog) {
      runtime.app.renderPlaybackLog({ preserveViewport: true });
    } else if (runtime.state.latestPayload) {
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

  function beginDragPreviewViewport(anchor = null) {
    if (!runtime.state.currentCanvasState || dragPreviewViewport) {
      return;
    }

    const canvasState = runtime.state.currentCanvasState;
    const { panX, panY } = canvasState;
    dragPreviewViewport = {
      canvasState,
      zoom: canvasState.zoom || runtime.state.currentZoom || 1,
      panX,
      panY,
      didAutoPan: false
    };
    const nextZoom = getDragPreviewZoom();
    if (nextZoom < (canvasState.zoom || runtime.state.currentZoom || 1) - 0.01) {
      const currentZoom = canvasState.zoom || runtime.state.currentZoom || 1;

      // The drop-target layout is applied by the drag CSS before this call. First
      // compensate its world-position shift at the current zoom, then animate the
      // actual zoom on the next frame so the dragged node stays visually anchored.
      applyDragPreviewZoom(currentZoom, anchor, canvasState);
      canvasState.stage?.getBoundingClientRect?.();
      startDragPreviewTransition(canvasState.shell);
      if (typeof requestAnimationFrame === "function") {
        dragPreviewAnimationFrame = requestAnimationFrame(() => {
          dragPreviewAnimationFrame = null;
          if (!dragPreviewViewport || dragPreviewViewport.canvasState !== canvasState) {
            return;
          }
          applyDragPreviewZoom(nextZoom, anchor, canvasState);
          scheduleDragPreviewTransitionEnd(canvasState.shell);
        });
      } else {
        applyDragPreviewZoom(nextZoom, anchor, canvasState);
        scheduleDragPreviewTransitionEnd(canvasState.shell);
      }
    }
  }

  function endDragPreviewViewport(options = {}) {
    if (!dragPreviewViewport) {
      return;
    }

    const snapshot = dragPreviewViewport;
    dragPreviewViewport = null;
    if (!snapshot.canvasState) {
      return;
    }

    stopDragAutoPan();
    stopDragPreviewTransition(snapshot.canvasState.shell);
    activateCanvasState(snapshot.canvasState);
    snapshot.canvasState.zoom = snapshot.zoom;
    if (options.cancelled || !snapshot.didAutoPan) {
      setCanvasPan(snapshot.panX, snapshot.panY, snapshot.canvasState);
    } else {
      applyZoom(snapshot.zoom, true, null, snapshot.canvasState);
    }
    activateCanvasState(snapshot.canvasState);
  }

  function getDragPreviewZoom() {
    const canvasState = runtime.state.currentCanvasState;
    if (!canvasState) {
      return runtime.state.currentZoom;
    }

    const currentZoom = canvasState.zoom || runtime.state.currentZoom || 1;
    return clamp(
      Number((currentZoom * DRAG_PREVIEW_ZOOM_FACTOR).toFixed(2)),
      runtime.state.MIN_ZOOM,
      currentZoom
    );
  }

  function startDragPreviewTransition(shell) {
    if (!shell?.classList) {
      return;
    }
    shell.classList.add("is-drag-preview-zooming");
  }

  function scheduleDragPreviewTransitionEnd(shell) {
    if (dragPreviewTransitionTimer !== null && typeof window.clearTimeout === "function") {
      window.clearTimeout(dragPreviewTransitionTimer);
    }
    if (typeof window.setTimeout !== "function") {
      return;
    }
    dragPreviewTransitionTimer = window.setTimeout(() => {
      dragPreviewTransitionTimer = null;
      shell?.classList?.remove("is-drag-preview-zooming");
    }, 240);
  }

  function stopDragPreviewTransition(shell) {
    if (dragPreviewAnimationFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(dragPreviewAnimationFrame);
    }
    dragPreviewAnimationFrame = null;
    if (dragPreviewTransitionTimer !== null && typeof window.clearTimeout === "function") {
      window.clearTimeout(dragPreviewTransitionTimer);
    }
    dragPreviewTransitionTimer = null;
    shell?.classList?.remove("is-drag-preview-zooming");
  }

  function applyDragPreviewZoom(nextZoom, anchor, canvasState) {
    const entry = canvasState.layout?.nodes?.find((item) => (
      item.node?.nodePath === anchor?.nodePath &&
      (!anchor?.treeId || !item.node?.sourceTreeId || item.node.sourceTreeId === anchor.treeId)
    ));
    if (!entry || !Number.isFinite(anchor?.screenX) || !Number.isFinite(anchor?.screenY)) {
      applyZoom(nextZoom, true, null, canvasState);
      return;
    }

    const rect = canvasState.shell.getBoundingClientRect();
    const sourceWorldX = (entry.dropTargetX ?? entry.x) + (entry.dropTargetWidth || entry.width) / 2;
    const sourceWorldY = (entry.dropTargetY ?? entry.y) + entry.height / 2;
    canvasState.zoom = nextZoom;
    if (runtime.state.currentCanvasState === canvasState) {
      runtime.state.currentZoom = nextZoom;
      updateZoomLabel();
    }
    setCanvasPan(
      anchor.screenX - rect.left - sourceWorldX * nextZoom,
      anchor.screenY - rect.top - sourceWorldY * nextZoom,
      canvasState
    );
  }

  function getCanvasVisibleBounds(canvasState) {
    const shell = canvasState.shell;
    const catalogWidth = getVisiblePanelWidth(
      runtime.refs.catalogPanel,
      runtime.state.showCatalog,
      runtime.state.catalogWidth
    );
    const assistantWidth = getVisiblePanelWidth(
      runtime.refs.editAssistantPanel,
      runtime.state.editAssistantVisible,
      runtime.state.editAssistantWidth
    );
    const left = clamp(catalogWidth, 0, shell.clientWidth);
    const right = clamp(shell.clientWidth - assistantWidth, left, shell.clientWidth);
    return { left, right, top: 0, bottom: shell.clientHeight };
  }

  function isSecondaryButtonDown(event) {
    return event?.button === 2 || (typeof event?.buttons === "number" && (event.buttons & 2) !== 0);
  }

  function getVisiblePanelWidth(panel, visible, fallbackWidth) {
    if (!visible || panel?.hidden === true) {
      return 0;
    }

    const measuredWidth = panel?.getBoundingClientRect?.().width;
    if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
      return measuredWidth;
    }
    return Math.max(Number(fallbackWidth) || 0, 0);
  }

  function updateDragAutoPan(canvasState, localX, localY, visibleBounds = null) {
    if (!canvasState || !runtime.state.currentDragState) {
      stopDragAutoPan();
      return;
    }

    const shell = canvasState.shell;
    const bounds = visibleBounds || { left: 0, right: shell.clientWidth, top: 0, bottom: shell.clientHeight };
    const velocityX = localX <= bounds.left + DRAG_AUTO_PAN_EDGE
      ? DRAG_AUTO_PAN_SPEED
      : localX >= bounds.right - DRAG_AUTO_PAN_EDGE
        ? -DRAG_AUTO_PAN_SPEED
        : 0;
    const velocityY = localY <= bounds.top + DRAG_AUTO_PAN_EDGE
      ? DRAG_AUTO_PAN_SPEED
      : localY >= bounds.bottom - DRAG_AUTO_PAN_EDGE
        ? -DRAG_AUTO_PAN_SPEED
        : 0;

    if (!velocityX && !velocityY) {
      stopDragAutoPan();
      return;
    }

    dragAutoPan = dragAutoPan || { frame: null, canvasState, velocityX: 0, velocityY: 0 };
    dragAutoPan.canvasState = canvasState;
    dragAutoPan.velocityX = velocityX;
    dragAutoPan.velocityY = velocityY;
    if (dragAutoPan.frame === null) {
      dragAutoPan.frame = requestAnimationFrame(runDragAutoPan);
    }
  }

  function runDragAutoPan() {
    if (!dragAutoPan || !runtime.state.currentDragState) {
      stopDragAutoPan();
      return;
    }

    const { canvasState, velocityX, velocityY } = dragAutoPan;
    const beforeX = canvasState.panX;
    const beforeY = canvasState.panY;
    setCanvasPan(beforeX + velocityX, beforeY + velocityY, canvasState);
    if (canvasState.panX !== beforeX || canvasState.panY !== beforeY) {
      dragPreviewViewport && (dragPreviewViewport.didAutoPan = true);
    }
    dragAutoPan.frame = requestAnimationFrame(runDragAutoPan);
  }

  function stopDragAutoPan() {
    if (dragAutoPan && dragAutoPan.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(dragAutoPan.frame);
    }
    dragAutoPan = null;
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

  function focusNodePath(nodePath, treeId = runtime.state.selectedTreeId) {
    if (!runtime.state.currentCanvasState?.layout || !runtime.state.currentCanvasState?.shell) {
      return;
    }

    const entry = runtime.state.currentCanvasState.layout.nodes.find((item) => {
      if (item.node?.nodePath !== nodePath) {
        return false;
      }
      return !treeId || !item.node?.sourceTreeId || item.node.sourceTreeId === treeId;
    });
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

  function captureViewportForLayout() {
    return getCanvasViewportState(runtime.state.currentCanvasState, {
      absoluteScreen: true,
      fallbackToCenter: true
    });
  }

  function preserveViewportForLayout(applyLayout, viewportState = captureViewportForLayout(), options = {}) {
    const result = typeof applyLayout === "function" ? applyLayout() : undefined;
    const restore = () => {
      restoreCanvasViewportState(viewportState, runtime.state.currentCanvasState);
    };
    if (options.defer === false) {
      restore();
    } else {
      requestAnimationFrame(restore);
    }
    return result;
  }

  function refreshDropTargetVisibility() {
    document.querySelectorAll(".canvas-node").forEach((node) => {
      const treeId = node.dataset.treeId || "";
      const nodePath = node.dataset.nodePath || "";
      const shouldHide =
        runtime.state.currentDragState?.kind === "move" &&
        treeId === runtime.state.currentDragState.treeId &&
        Boolean(runtime.state.currentDragState.sourceNodePath) &&
        (nodePath === runtime.state.currentDragState.sourceNodePath ||
          nodePath.startsWith(`${runtime.state.currentDragState.sourceNodePath}.`));
      node.classList.toggle("is-drop-target-hidden", shouldHide);
    });
  }

  function updateCanvasSelection(nodePath, treeId = runtime.state.selectedTreeId) {
    const canvasState = runtime.state.currentCanvasState;
    if (!canvasState?.shell) {
      return;
    }

    const currentSelected = canvasState.selectedCard || canvasState.shell.querySelector(".flow-card.is-selected");
    currentSelected?.classList.remove("is-selected");
    canvasState.selectedCard = null;

    if (nodePath === null || nodePath === undefined) {
      return;
    }

    const pathSelector = CSS.escape(String(nodePath));
    const treeSelector = treeId ? `[data-tree-id="${CSS.escape(String(treeId))}"]` : "";
    const selected = canvasState.shell.querySelector(`.canvas-node${treeSelector}[data-node-path="${pathSelector}"] .flow-card`);
    if (!selected) {
      return;
    }

    selected.classList.add("is-selected");
    canvasState.selectedCard = selected;
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
    getCanvasViewportState,
    captureNodePositionViewportAnchor,
    restoreViewportState: restoreCanvasViewportState,
    captureViewportForLayout,
    preserveViewportForLayout,
    fitCanvas,
    updateZoomLabel,
    syncCanvasInteractionMode,
    zoomCanvas,
    beginDragPreviewViewport,
    endDragPreviewViewport,
    setCanvasPan,
    focusNodePath,
    refreshViewport,
    refreshDropTargetVisibility,
    updateCanvasSelection
  };
})();
