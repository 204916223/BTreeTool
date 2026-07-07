(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;
  let whitelistModels = [];
  let selectedWhitelist = new Set();
  let whitelistQuery = "";

  function createAssistantWhitelistDialog() {
    const shell = shared.createModalShell({
      rootClass: "settings-dialog assistant-whitelist-dialog",
      dialogClass: "settings-dialog-panel assistant-whitelist-dialog-panel",
      onClose: hideAssistantWhitelistDialog
    });
    const { element, dialog, header, title } = shell;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "settings-close-button";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.innerHTML = runtime.icons.iconHtml("close");
    closeButton.addEventListener("click", hideAssistantWhitelistDialog);

    const search = document.createElement("input");
    search.type = "search";
    search.className = "attribute-input assistant-whitelist-search";
    search.spellcheck = false;
    search.addEventListener("input", () => {
      whitelistQuery = search.value.trim().toLowerCase();
      renderWhitelistOptions();
    });

    const list = document.createElement("div");
    list.className = "assistant-whitelist-list";

    const empty = document.createElement("div");
    empty.className = "assistant-whitelist-empty";
    empty.hidden = true;

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "canvas-btn subtle";
    cancelButton.addEventListener("click", hideAssistantWhitelistDialog);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "canvas-btn accent";
    saveButton.addEventListener("click", saveAssistantWhitelist);

    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);
    header.appendChild(closeButton);
    dialog.appendChild(search);
    dialog.appendChild(list);
    dialog.appendChild(empty);
    dialog.appendChild(actions);
    return {
      element,
      title,
      closeButton,
      search,
      list,
      empty,
      cancelButton,
      saveButton
    };
  }

  function showAssistantWhitelistDialog() {
    if (!overlayState.assistantWhitelistDialog) {
      return;
    }

    const copy = runtime.i18n.getEditAssistantCopy();
    overlayState.assistantWhitelistDialog.title.textContent = copy.whitelistTitle;
    overlayState.assistantWhitelistDialog.closeButton.title = copy.closeWhitelist;
    overlayState.assistantWhitelistDialog.closeButton.setAttribute("aria-label", copy.closeWhitelist);
    overlayState.assistantWhitelistDialog.search.placeholder = copy.whitelistSearchPlaceholder;
    overlayState.assistantWhitelistDialog.empty.textContent = copy.whitelistEmpty;
    overlayState.assistantWhitelistDialog.cancelButton.textContent = copy.cancelWhitelist;
    overlayState.assistantWhitelistDialog.saveButton.textContent = copy.saveWhitelist;

    whitelistModels = getCustomNodeModels();
    selectedWhitelist = new Set(runtime.state.currentSettings?.editAssistantWarningWhitelist || []);
    whitelistQuery = "";
    overlayState.assistantWhitelistDialog.search.value = "";
    renderWhitelistOptions();
    overlayState.assistantWhitelistDialog.element.hidden = false;
    shared.syncBlockingOverlay();
  }

  function renderWhitelistOptions() {
    const copy = runtime.i18n.getEditAssistantCopy();
    const dialog = overlayState.assistantWhitelistDialog;
    const models = whitelistQuery
      ? whitelistModels.filter((model) =>
          model.id.toLowerCase().includes(whitelistQuery) ||
          String(model.modelKind || "").toLowerCase().includes(whitelistQuery)
        )
      : whitelistModels;
    dialog.list.replaceChildren();
    dialog.empty.textContent = whitelistModels.length > 0 && models.length === 0
      ? copy.whitelistNoSearchResults
      : copy.whitelistEmpty;
    dialog.empty.hidden = models.length > 0;

    models.forEach((model) => {
      const label = document.createElement("label");
      label.className = "assistant-whitelist-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = model.id;
      input.checked = selectedWhitelist.has(model.id);
      input.addEventListener("change", () => {
        if (input.checked) {
          selectedWhitelist.add(model.id);
        } else {
          selectedWhitelist.delete(model.id);
        }
      });

      const text = document.createElement("span");
      text.className = "assistant-whitelist-option-text";
      text.textContent = model.id;

      const meta = document.createElement("span");
      meta.className = "assistant-whitelist-option-meta";
      meta.textContent = copy.whitelistOptionMeta(model.modelKind || "");

      label.appendChild(input);
      label.appendChild(text);
      label.appendChild(meta);
      dialog.list.appendChild(label);
    });
  }

  function getCustomNodeModels() {
    const builtinKeys = new Set((runtime.state.currentCatalogGroups || [])
      .flatMap((group) => group.items || [])
      .filter((item) => item.category !== "SubTree" && !item.editableModelId)
      .map((item) => item.key));

    const models = new Map();
    (runtime.state.currentCatalogGroups || [])
      .flatMap((group) => group.items || [])
      .filter((item) => item?.key && item.category !== "SubTree" && !builtinKeys.has(item.key))
      .forEach((item) => {
        models.set(item.key, { id: item.key, modelKind: item.category });
      });

    (runtime.state.currentPreview?.nodeModels || [])
      .filter((model) => model?.id && !builtinKeys.has(model.id))
      .forEach((model) => {
        models.set(model.id, model);
      });

    return Array.from(models.values())
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  function saveAssistantWhitelist() {
    const selected = Array.from(selectedWhitelist);

    const nextSettings = {
      ...(runtime.state.currentSettings || {}),
      editAssistantWarningWhitelist: selected
    };
    runtime.state.currentSettings = nextSettings;
    runtime.app.applyUserSettings?.();
    runtime.editAssistant?.render?.();
    runtime.vscode.postMessage({
      type: "saveUserSettings",
      payload: nextSettings
    });
    hideAssistantWhitelistDialog();
  }

  function hideAssistantWhitelistDialog() {
    if (!overlayState.assistantWhitelistDialog) {
      return;
    }

    overlayState.assistantWhitelistDialog.element.hidden = true;
    shared.syncBlockingOverlay();
  }

  overlayRuntime.parts.assistantWhitelistDialog = {
    createAssistantWhitelistDialog,
    showAssistantWhitelistDialog,
    hideAssistantWhitelistDialog
  };
})();
