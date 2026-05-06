(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

  function createNodePicker() {
    const element = document.createElement("div");
    element.className = "node-picker";
    element.hidden = true;
    const overlayCopy = runtime.i18n.getOverlayCopy();

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideNodePicker);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";
    title.textContent = overlayCopy.nodePickerTitle;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canvas-btn subtle";
    closeButton.textContent = overlayCopy.close;
    closeButton.addEventListener("click", hideNodePicker);

    const search = document.createElement("input");
    search.className = "panel-search node-picker-search";
    search.type = "text";
    search.placeholder = overlayCopy.nodePickerSearchPlaceholder;
    search.spellcheck = false;
    search.addEventListener("input", renderNodePickerList);

    const list = document.createElement("div");
    list.className = "node-picker-list";

    header.appendChild(title);
    header.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(search);
    dialog.appendChild(list);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      closeButton,
      search,
      list,
      state: null
    };
  }

  function showNodePicker(state) {
    if (!runtime.app.canPerformAction("openNodePicker", state || {})) {
      return;
    }

    if (!state?.treeId || !state.targetParentPath || !Number.isInteger(state.targetIndex)) {
      return;
    }

    overlayState.nodePicker.state = state;
    const overlayCopy = runtime.i18n.getOverlayCopy();
    overlayState.nodePicker.title.textContent = state.title || overlayCopy.nodePickerTitle;
    overlayState.nodePicker.closeButton.textContent = overlayCopy.close;
    overlayState.nodePicker.search.placeholder = overlayCopy.nodePickerSearchPlaceholder;
    overlayState.nodePicker.search.value = "";
    renderNodePickerList();
    overlayState.nodePicker.element.hidden = false;
    shared.syncBlockingOverlay();
    requestAnimationFrame(() => {
      overlayState.nodePicker.search.focus();
      overlayState.nodePicker.search.select();
    });
  }

  function hideNodePicker() {
    if (!overlayState.nodePicker) {
      return;
    }

    overlayState.nodePicker.state = null;
    overlayState.nodePicker.element.hidden = true;
    shared.syncBlockingOverlay();
  }

  function renderNodePickerList() {
    const overlayCopy = runtime.i18n.getOverlayCopy();
    const query = overlayState.nodePicker.search.value || "";
    const groups = runtime.catalog.filterCatalogGroups(
      runtime.state.currentCatalogGroups,
      query
    );

    if (groups.length === 0) {
      overlayState.nodePicker.list.replaceChildren(runtime.app.emptyState(overlayCopy.nodePickerEmpty));
      return;
    }

    const fragment = document.createDocumentFragment();

    groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "catalog-group";

      const isCollapsed = query
        ? false
        : Boolean(runtime.state.collapsedNodePickerGroups?.[group.category]);

      const header = document.createElement("button");
      header.type = "button";
      header.className = "catalog-group-header";
      header.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

      const arrow = document.createElement("span");
      arrow.className = isCollapsed ? "catalog-group-arrow is-collapsed" : "catalog-group-arrow";
      arrow.textContent = "▾";

      const title = document.createElement("span");
      title.className = "catalog-group-title";
      title.textContent = group.category;

      header.appendChild(arrow);
      header.appendChild(title);
      header.addEventListener("click", () => {
        runtime.state.collapsedNodePickerGroups = {
          ...(runtime.state.collapsedNodePickerGroups || {}),
          [group.category]: !runtime.state.collapsedNodePickerGroups?.[group.category]
        };
        runtime.app.persistUiState();
        renderNodePickerList();
      });
      section.appendChild(header);

      const list = document.createElement("div");
      list.className = isCollapsed ? "catalog-items is-collapsed" : "catalog-items";

      group.items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "catalog-item node-picker-item";
        button.textContent = item.title;
        button.title = `${item.category}: ${item.title}`;
        button.disabled = !runtime.app.canPerformAction("openNodePicker", overlayState.nodePicker.state || {});
        button.addEventListener("click", () => {
          if (!runtime.app.canPerformAction("openNodePicker", overlayState.nodePicker.state || {})) {
            return;
          }

          const state = overlayState.nodePicker.state;
          if (!state) {
            return;
          }

          runtime.state.selectedNodePath = `${state.targetParentPath}.${state.targetIndex}`;
          runtime.app.persistUiState();
          runtime.vscode.postMessage({
            type: "createNode",
            payload: {
              treeId: state.treeId,
              targetParentPath: state.targetParentPath,
              targetIndex: state.targetIndex,
              nodeKey: item.key,
              nodeCategory: item.category
            }
          });
          hideNodePicker();
        });
        list.appendChild(button);
      });

      section.appendChild(list);
      fragment.appendChild(section);
    });

    overlayState.nodePicker.list.replaceChildren(fragment);
  }

  overlayRuntime.parts.nodePicker = {
    createNodePicker,
    showNodePicker,
    hideNodePicker
  };
})();
