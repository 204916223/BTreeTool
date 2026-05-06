(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function applyWorkspacePanels() {
    runtime.refs.catalogPanel.hidden = !runtime.state.showCatalog;
    runtime.refs.catalogResizer.hidden = !runtime.state.showCatalog;
    runtime.refs.inspectorPanel.hidden = !runtime.state.showInspector;
    runtime.refs.inspectorResizer.hidden = !runtime.state.showInspector;

    runtime.refs.treeWorkspace.style.setProperty("--catalog-width", `${runtime.state.catalogWidth}px`);
    runtime.refs.treeWorkspace.style.setProperty("--inspector-width", `${runtime.state.inspectorWidth}px`);
    runtime.refs.treeWorkspace.classList.toggle("show-catalog", runtime.state.showCatalog);
    runtime.refs.treeWorkspace.classList.toggle("show-inspector", runtime.state.showInspector);

    runtime.refs.toggleCatalogButton.classList.toggle("is-active", runtime.state.showCatalog);
    runtime.refs.toggleInspectorButton.classList.toggle("is-active", runtime.state.showInspector);

    if (runtime.state.currentCanvasState) {
      requestAnimationFrame(() => {
        runtime.viewport.refreshViewport();
      });
    }
  }

  function enablePanelResize(handle, side) {
    if (!handle || !runtime.refs.treeWorkspace) {
      return;
    }

    handle.addEventListener("pointerdown", (event) => {
      if ((side === "catalog" && !runtime.state.showCatalog) || (side === "inspector" && !runtime.state.showInspector)) {
        return;
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startCatalogWidth = runtime.state.catalogWidth;
      const startInspectorWidth = runtime.state.inspectorWidth;

      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing-panels");

      const onPointerMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        if (side === "catalog") {
          runtime.state.catalogWidth = runtime.viewport.clampNumber(startCatalogWidth + deltaX, 220, 460, startCatalogWidth);
        } else {
          runtime.state.inspectorWidth = runtime.viewport.clampNumber(
            startInspectorWidth - deltaX,
            260,
            520,
            startInspectorWidth
          );
        }
        runtime.app.persistUiState();
        applyWorkspacePanels();
      };

      const finishResize = () => {
        document.body.classList.remove("is-resizing-panels");
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerCancel);
        try {
          handle.releasePointerCapture(pointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
      };

      const onPointerUp = () => finishResize();
      const onPointerCancel = () => finishResize();

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerCancel);
    });
  }

  runtime.workspacePanels = {
    apply: applyWorkspacePanels,
    enableResize: enablePanelResize
  };
})();
