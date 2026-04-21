(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function filterCatalogGroups(groups, query) {
    if (!groups || groups.length === 0) {
      return [];
    }

    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = `${item.title} ${item.key} ${item.category}`.toLowerCase();
          return haystack.includes(normalized);
        })
      }))
      .filter((group) => group.items.length > 0);
  }

  function renderCatalog(groups) {
    const { refs, state, app } = runtime;
    const { catalogList, catalogSearchInput } = refs;
    const copy = runtime.i18n.getCatalogCopy();
    const canCreateNodeModel = app.canPerformAction("createNodeModel");
    const canRevealNodeModelSource = app.canPerformAction("revealNodeModelSource");
    const canDragPaletteNode = app.canPerformAction("dragPaletteNode", { treeId: state.selectedTreeId });

    if (refs.addNodeModelButton) {
      refs.addNodeModelButton.disabled = !canCreateNodeModel;
    }
    if (refs.editNodeDefinitionsButton) {
      refs.editNodeDefinitionsButton.disabled = !canRevealNodeModelSource;
    }

    if (!catalogList) {
      return;
    }

    const filteredGroups = filterCatalogGroups(groups, catalogSearchInput?.value || "");
    if (!filteredGroups.length) {
      const query = (catalogSearchInput?.value || "").trim();
      const message = query ? copy.emptySearch(query) : copy.emptyCatalog;
      catalogList.replaceChildren(app.emptyState(message));
      return;
    }

    const fragment = document.createDocumentFragment();

    filteredGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "catalog-group";

      const header = document.createElement("button");
      header.type = "button";
      header.className = "catalog-group-header";
      header.setAttribute("aria-expanded", state.collapsedCatalogGroups?.[group.category] ? "false" : "true");

      const arrow = document.createElement("span");
      arrow.className = state.collapsedCatalogGroups?.[group.category]
        ? "catalog-group-arrow is-collapsed"
        : "catalog-group-arrow";
      arrow.textContent = "▾";

      const title = document.createElement("span");
      title.className = "catalog-group-title";
      title.textContent = group.category;

      header.appendChild(arrow);
      header.appendChild(title);
      header.addEventListener("click", () => {
        state.collapsedCatalogGroups = {
          ...(state.collapsedCatalogGroups || {}),
          [group.category]: !state.collapsedCatalogGroups?.[group.category]
        };
        app.persistUiState();
        renderCatalog(state.currentCatalogGroups);
      });
      section.appendChild(header);

      const list = document.createElement("div");
      list.className = state.collapsedCatalogGroups?.[group.category] ? "catalog-items is-collapsed" : "catalog-items";

      group.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = item.editableModelId ? "catalog-item is-editable" : "catalog-item";
        row.title = `${item.category}: ${item.title}`;
        row.draggable = canDragPaletteNode;

        const label = document.createElement("span");
        label.className = "catalog-item-label";
        label.textContent = item.title;
        row.appendChild(label);

        if (item.editableModelId) {
          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "catalog-item-edit";
          const editTitle = copy.editModelTitle(item.title);
          editButton.title = editTitle;
          editButton.setAttribute("aria-label", editTitle);
          editButton.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15.75 8.94-8.94 3.25 3.25L7.25 19H4zm12.85-9.6 1.4-1.4a1 1 0 0 1 1.41 0l.79.79a1 1 0 0 1 0 1.41l-1.4 1.4-3.25-3.25z"/></svg>';
          editButton.disabled = !app.canPerformAction("openNodeModelEditor", {
            editableModelId: item.editableModelId
          });
          editButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!runtime.app.canPerformAction("openNodeModelEditor", { editableModelId: item.editableModelId })) {
              return;
            }
            runtime.overlays.showTreeNodesModelDialog({ focusModelId: item.editableModelId });
          });
          row.appendChild(editButton);
        }

        row.addEventListener("dragstart", (event) => {
          if (!runtime.app.canPerformAction("dragPaletteNode", { treeId: state.selectedTreeId, item })) {
            event.preventDefault();
            return;
          }

          if (event.target instanceof Element && event.target.closest(".catalog-item-edit")) {
            event.preventDefault();
            return;
          }

          if (!state.selectedTreeId) {
            event.preventDefault();
            return;
          }

          state.currentDragState = {
            kind: "create",
            treeId: state.selectedTreeId,
            nodeKey: item.key,
            nodeCategory: item.category
          };
          document.body.classList.add("is-reordering-nodes");
          row.classList.add("is-dragging-palette");
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.setData("text/plain", item.key);
        });
        row.addEventListener("dragend", () => {
          runtime.canvas.clearDragState();
        });
        list.appendChild(row);
      });

      section.appendChild(list);
      fragment.appendChild(section);
    });

    catalogList.replaceChildren(fragment);
  }

  function enableCatalogDeleteTarget() {
    const { refs, state, canvas, overlays } = runtime;
    const { catalogPanel } = refs;

    if (!catalogPanel) {
      return;
    }

    catalogPanel.addEventListener("dragover", (event) => {
      if (!runtime.app.canPerformAction("requestNodeDelete", { dragState: state.currentDragState })) {
        return;
      }

      if (!state.currentDragState || state.currentDragState.kind !== "move") {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      canvas.clearDropMarkers();
      catalogPanel.classList.add("is-delete-target");
    });

    catalogPanel.addEventListener("drop", (event) => {
      if (!runtime.app.canPerformAction("requestNodeDelete", { dragState: state.currentDragState })) {
        return;
      }

      if (!state.currentDragState || state.currentDragState.kind !== "move") {
        return;
      }

      event.preventDefault();
      overlays.requestDeleteConfirmation({
        treeId: state.currentDragState.treeId,
        nodePath: state.currentDragState.sourceNodePath,
        parentPath: state.currentDragState.sourceParentPath,
        nodeTitle: state.currentDragState.nodeTitle
      });
      canvas.clearDragState();
    });
  }

  function clearCatalogDeleteTarget() {
    runtime.refs.catalogPanel?.classList.remove("is-delete-target");
  }

  function init() {
    const { refs, app, state, vscode } = runtime;

    refs.catalogSearchInput?.addEventListener("input", () => {
      renderCatalog(state.currentCatalogGroups);
    });
    refs.addNodeModelButton?.addEventListener("click", () => {
      if (!runtime.app.canPerformAction("createNodeModel")) {
        return;
      }
      runtime.overlays.showTreeNodesModelDialog({ createNew: true });
    });
    refs.editNodeDefinitionsButton?.addEventListener("click", () => {
      if (!runtime.app.canPerformAction("revealNodeModelSource")) {
        return;
      }
      vscode.postMessage({ type: "revealTreeNodesModel" });
    });
    enableCatalogDeleteTarget();
  }

  runtime.catalog = {
    init,
    renderCatalog,
    filterCatalogGroups,
    enableCatalogDeleteTarget,
    clearCatalogDeleteTarget
  };
})();
