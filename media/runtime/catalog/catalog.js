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

    refs.catalogSearchInput.hidden = false;
    refs.addNodeModelButton.hidden = false;
    const canCreateNodeModel = app.canPerformAction("createNodeModel");
    const canDragPaletteNode = app.canPerformAction("dragPaletteNode", { treeId: state.selectedTreeId });

    if (refs.addNodeModelButton) {
      refs.addNodeModelButton.disabled = !canCreateNodeModel;
    }
    if (refs.catalogSearchButton) {
      refs.catalogSearchButton.disabled = !catalogSearchInput;
    }

    if (!catalogList) {
      return;
    }

    const filteredGroups = filterCatalogGroups(groups, catalogSearchInput?.value || "");
    if (!filteredGroups.length) {
      const query = (catalogSearchInput?.value || "").trim();
      const message = query ? copy.emptySearch(query) : copy.emptyCatalog;
      catalogList.replaceChildren(app.emptyState(message));
      syncDeleteTargetIndicator();
      return;
    }

    const fragment = document.createDocumentFragment();

    filteredGroups.forEach((group) => {
      const collapsed = isCatalogGroupCollapsed(group.category);
      const section = document.createElement("section");
      section.className = "catalog-group";
      section.dataset.category = group.category;

      const header = document.createElement("button");
      header.type = "button";
      header.className = "catalog-group-header";
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");

      const arrow = document.createElement("span");
      arrow.className = collapsed ? "catalog-group-arrow is-collapsed" : "catalog-group-arrow";
      arrow.textContent = "▾";

      const title = document.createElement("span");
      title.className = "catalog-group-title";
      title.textContent = group.category;

      header.appendChild(arrow);
      header.appendChild(title);
      header.addEventListener("click", () => {
        state.collapsedCatalogGroups = {
          ...(state.collapsedCatalogGroups || {}),
          [group.category]: !isCatalogGroupCollapsed(group.category)
        };
        app.persistUiState();
        renderCatalog(state.currentCatalogGroups);
      });
      section.appendChild(header);

      const list = document.createElement("div");
      list.className = collapsed ? "catalog-items is-collapsed" : "catalog-items";

      group.items.forEach((item) => {
        const row = document.createElement("div");
        const rowClasses = ["catalog-item"];
        if (item.editableModelId) {
          rowClasses.push("is-editable");
        }
        if (item.isDetachedTree) {
          rowClasses.push("is-detached-subtree");
        }
        row.className = rowClasses.join(" ");
        row.title = item.isDetachedTree
          ? `${item.category}: ${item.title} - ${copy.detachedSubTreeTitle(item.title)}`
          : `${item.category}: ${item.title}`;
        row.draggable = canDragPaletteNode;

        const label = document.createElement("span");
        label.className = "catalog-item-label";
        label.textContent = item.title;
        row.appendChild(label);
        if (canRenameSubTreeItem(item)) {
          row.addEventListener("dblclick", (event) => {
            if (event.target instanceof Element && event.target.closest(".catalog-item-edit, .catalog-item-remove")) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            startSubTreeRename(row, label, item);
          });
        }

        if (item.isDetachedTree) {
          const marker = document.createElement("span");
          marker.className = "catalog-item-detached-marker";
          const markerTitle = copy.detachedSubTreeTitle(item.title);
          marker.title = markerTitle;
          marker.setAttribute("aria-label", markerTitle);
          row.appendChild(marker);
        }

        if (item.editableModelId) {
          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "catalog-item-edit";
          const editTitle = copy.editModelTitle(item.title);
          editButton.title = editTitle;
          editButton.setAttribute("aria-label", editTitle);
          editButton.innerHTML = runtime.icons.iconHtml("edit");
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

        if (item.removableTreeId) {
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "catalog-item-remove";
          const removeTitle = copy.removeSubTreeTitle(item.title);
          removeButton.title = removeTitle;
          removeButton.setAttribute("aria-label", removeTitle);
          removeButton.innerHTML = runtime.icons.iconHtml("remove");
          removeButton.disabled = !app.canPerformAction("deleteBehaviorTree", {
            treeId: item.removableTreeId
          });
          removeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!runtime.app.canPerformAction("deleteBehaviorTree", { treeId: item.removableTreeId })) {
              return;
            }
            runtime.overlays.showBehaviorTreeDeleteDialog({
              treeId: item.removableTreeId
            });
          });
          row.appendChild(removeButton);
        }

        row.addEventListener("dragstart", (event) => {
          if (row.classList.contains("is-renaming")) {
            event.preventDefault();
            return;
          }
          if (!runtime.app.canPerformAction("dragPaletteNode", { treeId: state.selectedTreeId, item })) {
            event.preventDefault();
            return;
          }

          if (event.target instanceof Element && event.target.closest(".catalog-item-edit, .catalog-item-remove")) {
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
          runtime.viewport.beginDragPreviewViewport();
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.setData("text/plain", item.key);
          runtime.setNeutralDragImage?.(event);
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
    syncDeleteTargetIndicator();
  }

  function isCatalogGroupCollapsed(category) {
    const collapsedGroups = runtime.state.collapsedCatalogGroups || {};
    if (Object.prototype.hasOwnProperty.call(collapsedGroups, category)) {
      return collapsedGroups[category] !== false;
    }
    return true;
  }

  function canRenameSubTreeItem(item) {
    if (item.category !== "SubTree" || item.key === "SubTree") {
      return false;
    }
    return (
      Boolean((runtime.state.currentPreview?.behaviorTrees || []).some((tree) => tree.id === item.key)) &&
      runtime.app.canPerformAction("renameBehaviorTree", { treeId: item.key })
    );
  }

  function startSubTreeRename(row, label, item) {
    if (row.classList.contains("is-renaming")) {
      return;
    }

    const originalValue = item.key || item.title || "";
    const input = document.createElement("input");
    input.className = "catalog-item-rename-input";
    input.type = "text";
    input.value = originalValue;
    input.spellcheck = false;
    input.dataset.originalValue = originalValue;

    const finish = (commit) => {
      if (input.dataset.finished === "true") {
        return;
      }
      input.dataset.finished = "true";
      if (commit) {
        commitSubTreeRename(input, item);
      }
      label.hidden = false;
      input.replaceWith(label);
      row.classList.remove("is-renaming");
      row.draggable = runtime.app.canPerformAction("dragPaletteNode", {
        treeId: runtime.state.selectedTreeId,
        item
      });
    };

    input.addEventListener("pointerdown", stopRenameEvent);
    input.addEventListener("click", stopRenameEvent);
    input.addEventListener("dblclick", stopRenameEvent);
    input.addEventListener("contextmenu", stopRenameEvent);
    input.addEventListener("dragstart", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        input.value = input.dataset.originalValue || "";
        finish(false);
      }
      event.stopPropagation();
    });

    row.classList.add("is-renaming");
    row.draggable = false;
    label.hidden = true;
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  function commitSubTreeRename(input, item) {
    const oldTreeId = input.dataset.originalValue || "";
    const newTreeId = String(input.value || "").trim();
    if (!oldTreeId || !newTreeId || oldTreeId === newTreeId) {
      return;
    }

    const existingTreeIds = new Set((runtime.state.currentPreview?.behaviorTrees || []).map((tree) => tree.id));
    if (existingTreeIds.has(newTreeId)) {
      input.value = oldTreeId;
      return;
    }

    if (runtime.state.selectedTreeId === oldTreeId) {
      runtime.state.selectedTreeId = newTreeId;
    }
    if (runtime.state.splitPaneTreeIds) {
      runtime.state.splitPaneTreeIds = Object.fromEntries(
        Object.entries(runtime.state.splitPaneTreeIds).map(([paneId, treeId]) => [
          paneId,
          treeId === oldTreeId ? newTreeId : treeId
        ])
      );
    }
    runtime.app.persistUiState?.();
    runtime.vscode.postMessage({
      type: "renameBehaviorTree",
      payload: {
        oldTreeId,
        newTreeId
      }
    });
  }

  function stopRenameEvent(event) {
    event.stopPropagation();
  }

  function syncDeleteTargetIndicator() {
    const { catalogPanel } = runtime.refs;
    if (!catalogPanel) {
      return;
    }

    const shouldShowDeleteTarget =
      !catalogPanel.hidden && runtime.state.currentDragState?.kind === "move";
    catalogPanel.classList.toggle("is-delete-target", shouldShowDeleteTarget);
    if (!shouldShowDeleteTarget) {
      catalogPanel.classList.remove("is-delete-target-active");
    }
    catalogPanel.dataset.deleteHint = runtime.i18n.getCatalogCopy().deleteDropHint;

    const header = catalogPanel.querySelector(".catalog-header");
    if (header) {
      header.dataset.deleteHint = runtime.i18n.getCatalogCopy().deleteDropHint;
    }
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
      catalogPanel.classList.add("is-delete-target-active");
      syncDeleteTargetIndicator();
    });

    catalogPanel.addEventListener("dragleave", (event) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && catalogPanel.contains(nextTarget)) {
        return;
      }

      catalogPanel.classList.remove("is-delete-target-active");
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
      catalogPanel.classList.remove("is-delete-target-active");
      canvas.clearDragState();
    });
  }

  function clearCatalogDeleteTarget() {
    runtime.refs.catalogPanel?.classList.remove("is-delete-target", "is-delete-target-active");
  }

  function init() {
    const { refs, state } = runtime;

    refs.catalogSearchInput?.addEventListener("input", () => {
      renderCatalog(state.currentCatalogGroups);
    });
    refs.catalogSearchButton?.addEventListener("click", () => {
      refs.catalogSearchInput?.focus();
      renderCatalog(state.currentCatalogGroups);
    });
    refs.addNodeModelButton?.addEventListener("click", () => {
      if (!runtime.app.canPerformAction("createNodeModel")) {
        return;
      }
      runtime.overlays.showTreeNodesModelDialog({ createNew: true });
    });
    refs.openNodeAtlasButton?.addEventListener("click", () => {
      runtime.overlays.showNodeAtlasDialog();
    });
    enableCatalogDeleteTarget();
    syncDeleteTargetIndicator();
  }

  runtime.catalog = {
    init,
    renderCatalog,
    filterCatalogGroups,
    isCatalogGroupCollapsed,
    enableCatalogDeleteTarget,
    clearCatalogDeleteTarget,
    syncDeleteTargetIndicator
  };
})();
