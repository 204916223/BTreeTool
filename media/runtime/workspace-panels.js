(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function applyWorkspacePanels() {
    const hasDocument = runtime.state.currentHasDocument === true;
    const isPlayback = runtime.modeRules?.isPlaybackMode?.() === true;
    const showCatalog = hasDocument && !isPlayback && runtime.state.showCatalog;
    const showEditAssistant = hasDocument && !isPlayback && runtime.state.editAssistantVisible;
    runtime.refs.catalogPanel.hidden = !showCatalog;
    runtime.refs.catalogResizer.hidden = !showCatalog;
    runtime.refs.editAssistantPanel.hidden = !showEditAssistant;
    runtime.refs.editAssistantResizer.hidden = !showEditAssistant;
    runtime.refs.toggleCatalogButton.hidden = !hasDocument || isPlayback;
    runtime.refs.toggleEditAssistantButton.hidden = !hasDocument || isPlayback;

    runtime.refs.treeWorkspace.style.setProperty("--catalog-width", `${runtime.state.catalogWidth}px`);
    runtime.refs.treeWorkspace.style.setProperty("--edit-assistant-width", `${runtime.state.editAssistantWidth}px`);
    runtime.refs.treeWorkspace.classList.toggle("show-catalog", showCatalog);
    runtime.refs.treeWorkspace.classList.toggle("show-edit-assistant", showEditAssistant);

    runtime.refs.toggleCatalogButton.classList.toggle("is-active", showCatalog);
    runtime.refs.toggleEditAssistantButton.classList.toggle("is-active", showEditAssistant);

    runtime.catalog.syncDeleteTargetIndicator?.();

    if (hasDocument && runtime.state.currentCanvasState) {
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
      if (side === "catalog" && !runtime.state.showCatalog) {
        return;
      }

      if (side === "editAssistant" && !runtime.state.editAssistantVisible) {
        return;
      }

      if (side !== "catalog" && side !== "editAssistant") {
        return;
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startCatalogWidth = runtime.state.catalogWidth;
      const startEditAssistantWidth = runtime.state.editAssistantWidth;

      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing-panels");

      const onPointerMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        if (side === "catalog") {
          runtime.state.catalogWidth = runtime.viewport.clampNumber(startCatalogWidth + deltaX, 220, 460, startCatalogWidth);
        } else {
          runtime.state.editAssistantWidth = runtime.viewport.clampNumber(
            startEditAssistantWidth - deltaX,
            260,
            560,
            startEditAssistantWidth
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
