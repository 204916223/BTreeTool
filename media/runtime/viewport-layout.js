(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  let measureHost = null;

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
    const measured = measureSubtree(rootNode);
    const positioned = positionSubtree(measured, config.paddingX, config.paddingY);
    const nodes = [];
    const edges = [];
    let maxX = 0;
    let maxY = 0;

    collect(positioned);

    return {
      width: maxX + config.paddingX,
      height: Math.max(maxY + config.paddingY, 640),
      rootCenterX: nodes[0]?.centerX || 450,
      nodes,
      edges
    };

    function measureSubtree(node) {
      const box = measureNodeBox(node);
      const children = node.children.map(measureSubtree);

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
      const descriptor = {
        node: entry.node,
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        centerX: entry.x + entry.width / 2
      };

      nodes.push(descriptor);
      maxX = Math.max(maxX, descriptor.x + descriptor.width);
      maxY = Math.max(maxY, descriptor.y + descriptor.height);

      if (parent) {
        edges.push({
          startX: parent.centerX,
          startY: parent.y + parent.height,
          endX: descriptor.centerX,
          endY: descriptor.y
        });
      }

      entry.children.forEach((child) => collect(child, descriptor));
    }

    function measureNodeBox(node) {
      const cacheKey = `${runtime.state.simplifyTreeFlow ? "simple" : "full"}::${node.nodePath}`;
      if (measuredNodes.has(cacheKey)) {
        return measuredNodes.get(cacheKey);
      }

      const host = ensureMeasureHost();
      host.replaceChildren();
      const card = runtime.canvas.buildNodeCard(node, result, { interactive: false, measuring: true });
      host.appendChild(card);

      const rect = card.getBoundingClientRect();
      const measured = {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      };

      measuredNodes.set(cacheKey, measured);
      return measured;
    }
  }

  function setupCanvas(shell, stage, layout, viewportState = null) {
    runtime.state.currentCanvasState = { shell, stage, layout, panX: 0, panY: 0 };
    syncCanvasInteractionMode();
    runtime.state.currentZoom = viewportState?.zoom || 1;
    updateZoomLabel();
    enableCanvasPan(shell);

    requestAnimationFrame(() => {
      if (viewportState) {
        setCanvasPan(viewportState.panX, viewportState.panY);
        return;
      }
      fitCanvas();
    });
  }

  function enableCanvasPan(shell) {
    let dragging = false;
    let didPan = false;
    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    shell.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      const onNodeCard = Boolean(event.target.closest(".flow-card"));
      if (onNodeCard && !runtime.state.isSpacePressed) {
        return;
      }

      dragging = true;
      didPan = false;
      startX = event.clientX;
      startY = event.clientY;
      initialPanX = runtime.state.currentCanvasState?.panX || 0;
      initialPanY = runtime.state.currentCanvasState?.panY || 0;
      shell.classList.add("is-dragging");
      shell.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    shell.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (!didPan && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
        didPan = true;
      }
      setCanvasPan(initialPanX + deltaX, initialPanY + deltaY);
    });

    const stopDragging = () => {
      if (!dragging) {
        return;
      }

      if (didPan) {
        runtime.state.suppressNodeClickUntil = Date.now() + 120;
      }

      dragging = false;
      didPan = false;
      shell.classList.remove("is-dragging");
    };

    shell.addEventListener("pointerup", stopDragging);
    shell.addEventListener("pointercancel", stopDragging);

    shell.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (event.deltaY !== 0) {
          const delta = event.deltaY < 0 ? 0.08 : -0.08;
          zoomCanvas(delta, { originX: event.clientX, originY: event.clientY });
        }
      },
      { passive: false }
    );
  }

  function zoomCanvas(delta, origin) {
    if (!runtime.state.currentCanvasState) {
      return;
    }

    const nextZoom = clamp(
      Number((runtime.state.currentZoom + delta).toFixed(2)),
      runtime.state.MIN_ZOOM,
      runtime.state.MAX_ZOOM
    );
    applyZoom(nextZoom, true, origin);
  }

  function fitCanvas() {
    if (!runtime.state.currentCanvasState) {
      return;
    }

    const { shell, layout } = runtime.state.currentCanvasState;
    const fitX = (shell.clientWidth - 40) / layout.width;
    const fitY = (shell.clientHeight - 40) / layout.height;
    const strictFit = Math.min(fitX, fitY, 1);
    const widthBiasedFit = Math.min(fitX, fitY * 1.35, 1);
    const targetZoom = clamp(Math.max(strictFit, widthBiasedFit), runtime.state.MIN_ZOOM, 1);
    applyZoom(targetZoom, false);
  }

  function applyZoom(nextZoom, preserveCenter, origin) {
    if (!runtime.state.currentCanvasState) {
      return;
    }

    const { shell, layout } = runtime.state.currentCanvasState;
    const previousZoom = runtime.state.currentZoom;
    runtime.state.currentZoom = nextZoom;
    updateZoomLabel();

    if (!preserveCenter) {
      const fittedPan = getFittedPan(shell, layout, runtime.state.currentZoom);
      setCanvasPan(fittedPan.panX, fittedPan.panY);
      return;
    }

    const rect = shell.getBoundingClientRect();
    const pointerX = origin ? origin.originX - rect.left : shell.clientWidth / 2;
    const pointerY = origin ? origin.originY - rect.top : shell.clientHeight / 2;
    const worldX = (pointerX - runtime.state.currentCanvasState.panX) / previousZoom;
    const worldY = (pointerY - runtime.state.currentCanvasState.panY) / previousZoom;
    const nextPanX = pointerX - worldX * runtime.state.currentZoom;
    const nextPanY = pointerY - worldY * runtime.state.currentZoom;
    setCanvasPan(nextPanX, nextPanY);
  }

  function setCanvasPan(nextPanX, nextPanY) {
    if (!runtime.state.currentCanvasState) {
      return;
    }

    const clamped = clampCanvasPan(
      nextPanX,
      nextPanY,
      runtime.state.currentCanvasState.shell,
      runtime.state.currentCanvasState.layout,
      runtime.state.currentZoom
    );
    const snappedPanX = Math.round(clamped.panX);
    const snappedPanY = Math.round(clamped.panY);

    runtime.state.currentCanvasState.panX = snappedPanX;
    runtime.state.currentCanvasState.panY = snappedPanY;
    runtime.state.currentCanvasState.stage.style.transform =
      `translate(${snappedPanX}px, ${snappedPanY}px) scale(${runtime.state.currentZoom})`;
    runtime.state.currentCanvasState.stage.style.transformOrigin = "top left";
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
    return {
      panX: (shell.clientWidth - contentWidth) / 2,
      panY: (shell.clientHeight - contentHeight) / 2
    };
  }

  function updateZoomLabel() {
    if (runtime.refs.zoomLevelLabel) {
      runtime.refs.zoomLevelLabel.textContent = `${Math.round(runtime.state.currentZoom * 100)}%`;
    }
  }

  function syncCanvasInteractionMode() {
    if (runtime.state.currentCanvasState?.shell) {
      runtime.state.currentCanvasState.shell.classList.toggle("is-hand-mode", runtime.state.isSpacePressed);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  runtime.viewport = {
    init,
    clampNumber,
    buildTreeLayout,
    setupCanvas,
    enableHorizontalWheelScroll,
    fitCanvas,
    updateZoomLabel,
    syncCanvasInteractionMode,
    zoomCanvas,
    setCanvasPan
  };
})();
