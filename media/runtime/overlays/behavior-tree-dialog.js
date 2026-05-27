(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

  function createBehaviorTreeDialog() {
    const element = document.createElement("div");
    element.className = "node-picker settings-dialog behavior-tree-dialog";
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideBehaviorTreeDialog);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog settings-dialog-panel behavior-tree-dialog-panel";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";

    const form = document.createElement("div");
    form.className = "settings-form behavior-tree-form";

    const nameRow = shared.createSettingsField("BehaviorTree ID");
    const nameInput = document.createElement("input");
    nameInput.className = "attribute-input";
    nameInput.type = "text";
    nameInput.spellcheck = false;
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitBehaviorTreeDialog();
      }
    });
    nameRow.control.appendChild(nameInput);

    const message = document.createElement("div");
    message.className = "behavior-tree-message";
    message.hidden = true;

    const related = document.createElement("div");
    related.className = "behavior-tree-related";
    related.hidden = true;

    const relatedTitle = document.createElement("div");
    relatedTitle.className = "behavior-tree-related-title";

    const relatedList = document.createElement("ul");
    relatedList.className = "behavior-tree-related-list";

    related.appendChild(relatedTitle);
    related.appendChild(relatedList);

    const status = document.createElement("div");
    status.className = "editor-status";
    status.hidden = true;

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "canvas-btn subtle";
    cancelButton.addEventListener("click", hideBehaviorTreeDialog);

    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.className = "canvas-btn accent";
    createButton.addEventListener("click", submitBehaviorTreeDialog);

    actions.appendChild(cancelButton);
    actions.appendChild(createButton);
    header.appendChild(title);
    form.appendChild(nameRow.element);
    form.appendChild(message);
    form.appendChild(related);
    dialog.appendChild(header);
    dialog.appendChild(form);
    dialog.appendChild(status);
    dialog.appendChild(actions);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      nameRow,
      nameInput,
      message,
      related,
      relatedTitle,
      relatedList,
      status,
      cancelButton,
      createButton,
      state: {
        mode: "create",
        treeId: "",
        pendingAction: null
      }
    };
  }

  function showBehaviorTreeDialog() {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    const copy = runtime.i18n.getBehaviorTreeDialogCopy();
    overlayState.behaviorTreeDialog.title.textContent = copy.title;
    overlayState.behaviorTreeDialog.nameRow.text.textContent = copy.name;
    overlayState.behaviorTreeDialog.nameRow.element.hidden = false;
    overlayState.behaviorTreeDialog.nameInput.placeholder = copy.placeholder;
    overlayState.behaviorTreeDialog.nameInput.value = "";
    overlayState.behaviorTreeDialog.message.hidden = true;
    overlayState.behaviorTreeDialog.message.textContent = "";
    overlayState.behaviorTreeDialog.related.hidden = true;
    overlayState.behaviorTreeDialog.relatedTitle.textContent = "";
    overlayState.behaviorTreeDialog.relatedList.replaceChildren();
    overlayState.behaviorTreeDialog.cancelButton.textContent = copy.cancel;
    overlayState.behaviorTreeDialog.createButton.textContent = copy.create;
    overlayState.behaviorTreeDialog.createButton.className = "canvas-btn accent";
    overlayState.behaviorTreeDialog.createButton.disabled = false;
    overlayState.behaviorTreeDialog.createButton.hidden = false;
    overlayState.behaviorTreeDialog.state.mode = "create";
    overlayState.behaviorTreeDialog.state.treeId = "";
    overlayState.behaviorTreeDialog.state.pendingAction = null;
    renderStatus("", "info");
    overlayState.behaviorTreeDialog.element.hidden = false;
    shared.syncBlockingOverlay();
    requestAnimationFrame(() => {
      overlayState.behaviorTreeDialog.nameInput.focus();
      overlayState.behaviorTreeDialog.nameInput.select();
    });
  }

  function showBehaviorTreeDeleteDialog(options) {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    const copy = runtime.i18n.getBehaviorTreeDialogCopy();
    const treeId = String(options?.treeId || "").trim();
    if (!treeId) {
      return;
    }

    const references = findReferencingTreeIds(treeId);
    overlayState.behaviorTreeDialog.title.textContent =
      references.length > 0 ? copy.deleteBlockedTitle : copy.deleteTitle;
    overlayState.behaviorTreeDialog.nameRow.element.hidden = true;
    overlayState.behaviorTreeDialog.nameInput.value = "";
    overlayState.behaviorTreeDialog.cancelButton.textContent = copy.cancel;
    overlayState.behaviorTreeDialog.createButton.textContent = copy.delete;
    overlayState.behaviorTreeDialog.createButton.className = "canvas-btn danger";
    overlayState.behaviorTreeDialog.createButton.disabled = false;
    overlayState.behaviorTreeDialog.createButton.hidden = references.length > 0;
    overlayState.behaviorTreeDialog.state.mode = "delete";
    overlayState.behaviorTreeDialog.state.treeId = treeId;
    overlayState.behaviorTreeDialog.state.pendingAction = null;
    renderStatus("", "info");

    if (references.length > 0) {
      renderDeleteBlock(copy, treeId, references);
    } else {
      overlayState.behaviorTreeDialog.message.hidden = false;
      overlayState.behaviorTreeDialog.message.textContent = copy.deleteConfirm(treeId);
      overlayState.behaviorTreeDialog.related.hidden = true;
      overlayState.behaviorTreeDialog.relatedTitle.textContent = "";
      overlayState.behaviorTreeDialog.relatedList.replaceChildren();
    }

    overlayState.behaviorTreeDialog.element.hidden = false;
    shared.syncBlockingOverlay();
    requestAnimationFrame(() => {
      if (references.length > 0) {
        overlayState.behaviorTreeDialog.cancelButton.focus();
        return;
      }
      overlayState.behaviorTreeDialog.createButton.focus();
    });
  }

  function hideBehaviorTreeDialog() {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    overlayState.behaviorTreeDialog.element.hidden = true;
    overlayState.behaviorTreeDialog.state.mode = "create";
    overlayState.behaviorTreeDialog.state.treeId = "";
    overlayState.behaviorTreeDialog.state.pendingAction = null;
    renderStatus("", "info");
    shared.syncBlockingOverlay();
  }

  function submitBehaviorTreeDialog() {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    if (overlayState.behaviorTreeDialog.state.mode === "delete") {
      submitBehaviorTreeDeleteDialog();
      return;
    }

    if (!runtime.app.canPerformAction("createBehaviorTree", { hasPreview: Boolean(runtime.state.currentPreview) })) {
      return;
    }

    const copy = runtime.i18n.getBehaviorTreeDialogCopy();
    const treeId = overlayState.behaviorTreeDialog.nameInput.value.trim();
    if (!treeId) {
      renderStatus(copy.emptyName, "error");
      return;
    }

    const exists = (runtime.state.currentPreview?.behaviorTrees || []).some((tree) => tree.id === treeId);
    if (exists) {
      renderStatus(copy.duplicateName(treeId), "error");
      return;
    }

    overlayState.behaviorTreeDialog.state.pendingAction = "create";
    overlayState.behaviorTreeDialog.createButton.disabled = true;
    renderStatus(copy.creating, "info");
    runtime.vscode.postMessage({
      type: "createBehaviorTree",
      payload: {
        treeId
      }
    });
  }

  function submitBehaviorTreeDeleteDialog() {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    const copy = runtime.i18n.getBehaviorTreeDialogCopy();
    const treeId = overlayState.behaviorTreeDialog.state.treeId;
    if (!treeId || !runtime.app.canPerformAction("deleteBehaviorTree", { treeId })) {
      return;
    }

    const references = findReferencingTreeIds(treeId);
    if (references.length > 0) {
      overlayState.behaviorTreeDialog.title.textContent = copy.deleteBlockedTitle;
      overlayState.behaviorTreeDialog.createButton.hidden = true;
      renderDeleteBlock(copy, treeId, references);
      return;
    }

    overlayState.behaviorTreeDialog.state.pendingAction = "delete";
    overlayState.behaviorTreeDialog.createButton.disabled = true;
    renderStatus(copy.deleting, "info");
    runtime.vscode.postMessage({
      type: "deleteBehaviorTree",
      payload: {
        treeId
      }
    });
  }

  function renderDeleteBlock(copy, treeId, references) {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    overlayState.behaviorTreeDialog.message.hidden = false;
    overlayState.behaviorTreeDialog.message.textContent = copy.deleteBlockedMessage(treeId);
    overlayState.behaviorTreeDialog.related.hidden = false;
    overlayState.behaviorTreeDialog.relatedTitle.textContent = copy.relatedTrees;
    overlayState.behaviorTreeDialog.relatedList.replaceChildren(
      ...references.map((reference) => {
        const item = document.createElement("li");
        item.textContent = reference;
        return item;
      })
    );
  }

  function findReferencingTreeIds(treeId) {
    const references = new Set();
    for (const tree of runtime.state.currentPreview?.behaviorTrees || []) {
      if (tree.id === treeId || !tree.node) {
        continue;
      }

      if (nodeReferencesBehaviorTree(tree.node, treeId)) {
        references.add(tree.id);
      }
    }

    return [...references].sort((left, right) => left.localeCompare(right));
  }

  function nodeReferencesBehaviorTree(node, treeId) {
    if (!node) {
      return false;
    }

    if (node.kind === "SubTree" && node.targetTreeId === treeId) {
      return true;
    }

    return (node.children || []).some((child) => nodeReferencesBehaviorTree(child, treeId));
  }

  function renderStatus(message, tone) {
    if (!overlayState.behaviorTreeDialog) {
      return;
    }

    if (!message) {
      overlayState.behaviorTreeDialog.status.hidden = true;
      overlayState.behaviorTreeDialog.status.className = "editor-status";
      overlayState.behaviorTreeDialog.status.textContent = "";
      return;
    }

    overlayState.behaviorTreeDialog.status.hidden = false;
    overlayState.behaviorTreeDialog.status.className = `editor-status is-${tone || "info"}`;
    overlayState.behaviorTreeDialog.status.textContent = message;
  }

  overlayRuntime.parts.behaviorTreeDialog = {
    createBehaviorTreeDialog,
    showBehaviorTreeDialog,
    showBehaviorTreeDeleteDialog,
    hideBehaviorTreeDialog,
    renderStatus
  };
})();
