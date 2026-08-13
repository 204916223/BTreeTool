(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const CATALOG_PREVIEW_DELAY_MS = 1000;
  let catalogPreviewElement = null;
  let catalogPreviewTimer = 0;
  let activeCatalogPreview = null;

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

  function getCatalogItemRole(item) {
    if (runtime.canvas?.getNodeRole) {
      return runtime.canvas.getNodeRole({
        kind: item.key || item.title || "",
        title: item.title || item.key || "",
        category: item.category || "",
        modelKind: item.category || "",
        children: []
      });
    }

    if (item.category === "SubTree") {
      return "subtree";
    }
    if (item.category === "Control") {
      return "control";
    }
    if (item.category === "Decorator") {
      return "decorator";
    }
    return "action";
  }

  function ensureCatalogItemPreview() {
    if (catalogPreviewElement) {
      return catalogPreviewElement;
    }

    const preview = document.createElement("div");
    preview.className = "catalog-item-preview";
    preview.hidden = true;
    document.body.appendChild(preview);
    catalogPreviewElement = preview;
    return preview;
  }

  function buildCatalogItemPreview(item) {
    const atlasPreview = runtime.overlays?.createNodeAtlasPreviewForKey?.(item.key, {
      title: item.title,
      category: item.category,
      paneId: "node-atlas-catalog-preview"
    });
    if (atlasPreview) {
      return atlasPreview;
    }

    const role = getCatalogItemRole(item);
    const card = document.createElement("div");
    card.className = `flow-card flow-card-${role} is-details-hidden catalog-item-preview-card`;

    const heading = document.createElement("div");
    heading.className = "flow-card-heading";

    const kind = document.createElement("span");
    kind.className = "flow-node-kind";
    kind.textContent = item.category || role.toUpperCase();

    const name = document.createElement("span");
    name.className = "flow-node-name";
    name.textContent = item.title || item.key || "";

    heading.appendChild(kind);
    heading.appendChild(name);
    card.appendChild(heading);
    return card;
  }

  function positionCatalogItemPreview(row, preview) {
    const content = preview.firstElementChild;
    if (content instanceof HTMLElement) {
      content.style.transform = "scale(1)";
      content.style.transformOrigin = "top left";
    }

    const panelRect = runtime.refs.catalogPanel?.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 12;
    const margin = 12;
    const scale = 0.75;
    const naturalRect = content instanceof HTMLElement ? content.getBoundingClientRect() : preview.getBoundingClientRect();
    const naturalWidth = Math.ceil(naturalRect.width || content?.scrollWidth || preview.offsetWidth || 240);
    const naturalHeight = Math.ceil(naturalRect.height || content?.scrollHeight || preview.offsetHeight || 120);
    const preferredLeft = (panelRect?.right || rowRect.right) + gap;
    const availableRight = Math.max(0, viewportWidth - preferredLeft - margin);
    const availableLeft = Math.max(0, rowRect.left - gap - margin);
    const rowCenterY = rowRect.top + rowRect.height / 2;
    const previewWidth = Math.ceil(naturalWidth * scale);
    const previewHeight = Math.ceil(naturalHeight * scale);
    const placeOnRight = availableRight >= previewWidth || (availableLeft < previewWidth && availableRight >= availableLeft);
    const left = placeOnRight
      ? preferredLeft
      : rowRect.left - gap - previewWidth;
    const centeredTop = rowCenterY - previewHeight / 2;
    const top = Math.max(margin, Math.min(centeredTop, viewportHeight - previewHeight - margin));

    if (content instanceof HTMLElement) {
      content.style.transform = `scale(${scale})`;
    }
    preview.style.width = `${previewWidth}px`;
    preview.style.height = `${previewHeight}px`;
    preview.style.left = `${Math.max(margin, Math.min(left, viewportWidth - previewWidth - margin))}px`;
    preview.style.top = `${top}px`;
  }

  function hideCatalogItemPreview() {
    window.clearTimeout(catalogPreviewTimer);
    catalogPreviewTimer = 0;
    activeCatalogPreview = null;
    if (!catalogPreviewElement) {
      return;
    }

    catalogPreviewElement.classList.remove("is-visible");
    catalogPreviewElement.hidden = true;
  }

  function scheduleCatalogItemPreview(row, item) {
    hideCatalogItemPreview();
    if (row.classList.contains("is-renaming")) {
      return;
    }

    activeCatalogPreview = { row, item };
    catalogPreviewTimer = window.setTimeout(() => {
      if (!activeCatalogPreview || activeCatalogPreview.row !== row || !row.isConnected) {
        return;
      }

      const preview = ensureCatalogItemPreview();
      preview.replaceChildren(buildCatalogItemPreview(item));
      preview.hidden = false;
      preview.style.visibility = "hidden";
      positionCatalogItemPreview(row, preview);
      const nextFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
      nextFrame(() => {
        if (!activeCatalogPreview || activeCatalogPreview.row !== row) {
          return;
        }
        preview.style.visibility = "";
        preview.classList.add("is-visible");
      });
    }, CATALOG_PREVIEW_DELAY_MS);
  }

  function updateCatalogItemPreviewPosition(row) {
    if (!catalogPreviewElement || !activeCatalogPreview || activeCatalogPreview.row !== row) {
      return;
    }
    positionCatalogItemPreview(row, catalogPreviewElement);
  }

  function renderCatalog(groups) {
    const { refs, state, app } = runtime;
    const { catalogList, catalogSearchInput } = refs;
    const copy = runtime.i18n.getCatalogCopy();

    hideCatalogItemPreview();
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
      arrow.innerHTML = runtime.icons.iconHtml("chevronDown");

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

        const actions = document.createElement("span");
        actions.className = "catalog-item-actions";
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
          actions.appendChild(marker);
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
          actions.appendChild(editButton);
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
          actions.appendChild(removeButton);
        }

        row.appendChild(actions);

        row.addEventListener("pointerenter", () => {
          scheduleCatalogItemPreview(row, item);
        });
        row.addEventListener("pointermove", () => {
          updateCatalogItemPreviewPosition(row);
        });
        row.addEventListener("pointerleave", hideCatalogItemPreview);
        row.addEventListener("dragstart", (event) => {
          hideCatalogItemPreview();
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
          runtime.setVisibleDragImage?.(event, row);
        });
        row.addEventListener("dragend", () => {
          if (state.currentDragState) {
            runtime.canvas.clearDragState({ cancelled: true });
          }
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
      canvas.clearDragState({ cancelled: true });
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
    refs.catalogList?.addEventListener("scroll", hideCatalogItemPreview, { passive: true });
    window.addEventListener("resize", hideCatalogItemPreview);
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
    syncDeleteTargetIndicator,
    hideCatalogItemPreview
  };
})();
