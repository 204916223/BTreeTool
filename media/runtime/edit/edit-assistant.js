(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function init() {
    render();
  }

  function render() {
    const refs = runtime.refs || {};
    const panel = refs.editAssistantPanel;
    if (!panel) {
      return;
    }

    panel.replaceChildren();
    panel.appendChild(createHeader());
    panel.appendChild(createQueuePanel());
    panel.appendChild(createBody());
    panel.appendChild(createComposer());
    renderStoredMessages();
  }

  function createHeader() {
    const copy = getCopy();
    const header = document.createElement("div");
    header.className = "edit-assistant-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "edit-assistant-title-wrap";

    const title = document.createElement("strong");
    title.className = "edit-assistant-title";
    title.textContent = copy.title;

    titleWrap.appendChild(title);

    const configButton = document.createElement("button");
    configButton.className = "canvas-btn icon-btn subtle";
    configButton.type = "button";
    configButton.title = copy.configure;
    configButton.setAttribute("aria-label", copy.configure);
    configButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58-1.92-3.32-2.39.96a7.2 7.2 0 0 0-1.63-.94L14.87 3h-3.74l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54h3.74l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96 1.92-3.32-2.03-1.58ZM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4Z"/></svg>';
    configButton.addEventListener("click", () => {
      appendMessage("assistant", copy.configNotReady);
    });

    header.appendChild(titleWrap);
    header.appendChild(configButton);
    return header;
  }

  function createBody() {
    const copy = getCopy();
    const body = document.createElement("div");
    body.className = "edit-assistant-body";

    const messages = document.createElement("section");
    messages.className = "edit-assistant-section edit-assistant-messages";
    messages.appendChild(createSectionHeader(copy.messages, []));

    const messageList = document.createElement("div");
    messageList.className = "edit-assistant-message-list";
    messageList.dataset.assistantMessages = "true";
    const empty = document.createElement("p");
    empty.className = "edit-assistant-empty";
    empty.textContent = copy.empty;
    messageList.appendChild(empty);
    messages.appendChild(messageList);

    body.appendChild(messages);
    return body;
  }

  function createQueuePanel() {
    const copy = getCopy();
    const panel = document.createElement("section");
    panel.className = "edit-assistant-queue-panel";
    panel.appendChild(createQueueRow());

    const contextList = document.createElement("div");
    contextList.className = "edit-assistant-context-list";
    contextList.appendChild(createContextRow(copy.treeLabel, runtime.state?.selectedTreeId || copy.none));
    contextList.appendChild(createContextRow(copy.nodeLabel, getSelectedNodeUidLabel()));
    contextList.appendChild(createContextRow(copy.warningLabel, String(getWarningCount())));
    panel.appendChild(contextList);
    return panel;
  }

  function createQueueRow() {
    const copy = getCopy();
    const row = document.createElement("div");
    row.className = "edit-assistant-queue-row";

    const label = document.createElement("span");
    label.className = "edit-assistant-queue-label";
    label.textContent = copy.queueTitle;

    const value = document.createElement("span");
    value.className = "edit-assistant-queue-value";
    value.textContent = formatTreeQueue();
    value.title = formatTreeQueue();

    row.appendChild(label);
    row.appendChild(value);
    row.appendChild(createRemoveTreeButton());
    row.appendChild(createAddTreeButton());
    return row;
  }

  function createComposer() {
    const copy = getCopy();
    const form = document.createElement("form");
    form.className = "edit-assistant-composer";

    const shell = document.createElement("div");
    shell.className = "edit-assistant-composer-shell";

    const input = document.createElement("textarea");
    input.className = "edit-assistant-input";
    input.dataset.editAssistantInput = "true";
    input.rows = 2;
    input.placeholder = copy.placeholder;
    input.spellcheck = false;

    const footer = document.createElement("div");
    footer.className = "edit-assistant-composer-footer";

    const statusbar = document.createElement("div");
    statusbar.className = "edit-assistant-statusbar";
    statusbar.textContent = copy.localProvider;

    const send = document.createElement("button");
    send.className = "canvas-btn accent icon-btn edit-assistant-send";
    send.type = "submit";
    send.title = copy.send;
    send.setAttribute("aria-label", copy.send);
    send.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 19.5 4l-4.1 16-4.4-5.4L4 12.5Zm6.4-.3 4 4.8 2.6-10.4-6.6 5.6Z"/></svg>';

    footer.appendChild(statusbar);
    footer.appendChild(createIconAction(copy.scanTree, "scan", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4V5Zm0 6h10v2H4v-2Zm0 6h16v2H4v-2Zm13-7 1.5 1.5L22 8l-1.5-1.5L18.5 8.5 17 7l-1.5 1.5L17 10Z"/></svg>'));
    footer.appendChild(send);
    shell.appendChild(input);
    shell.appendChild(footer);
    form.appendChild(shell);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const prompt = input.value.trim();
      if (!prompt) {
        return;
      }
      input.value = "";
      postAsk(prompt);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener("focus", () => {
      runtime.state.editAssistantInputActive = true;
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        runtime.state.editAssistantInputActive = false;
      }, 120);
    });

    return form;
  }

  function createSectionTitle(text) {
    const title = document.createElement("strong");
    title.className = "edit-assistant-section-title";
    title.textContent = text;
    return title;
  }

  function createSectionHeader(text, actions) {
    const header = document.createElement("div");
    header.className = "edit-assistant-section-header";
    header.appendChild(createSectionTitle(text));

    const actionWrap = document.createElement("div");
    actionWrap.className = "edit-assistant-section-actions";
    actions.forEach((action) => actionWrap.appendChild(action));
    header.appendChild(actionWrap);
    return header;
  }

  function createContextRow(label, value) {
    const row = document.createElement("div");
    row.className = "edit-assistant-context-row";

    const key = document.createElement("span");
    key.className = "edit-assistant-context-key";
    key.textContent = label;

    const content = document.createElement("span");
    content.className = "edit-assistant-context-value";
    content.textContent = value;

    row.appendChild(key);
    row.appendChild(content);
    return row;
  }

  function createIconAction(label, action, icon, onClick = null) {
    const button = document.createElement("button");
    button.className = "canvas-btn icon-btn subtle edit-assistant-icon-action";
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    button.addEventListener("click", (event) => {
      if (typeof onClick === "function") {
        onClick(event);
        return;
      }
      postAsk(label, action);
    });
    return button;
  }

  function createAddTreeButton() {
    const copy = getCopy();
    return createIconAction(
      copy.addCurrentTree,
      "attachTree",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>',
      (event) => {
        event.preventDefault();
        addCurrentTreeToQueue();
      }
    );
  }

  function createRemoveTreeButton() {
    const copy = getCopy();
    return createIconAction(
      copy.removeCurrentTree,
      "detachTree",
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5v-2Z"/></svg>',
      (event) => {
        event.preventDefault();
        removeCurrentTreeFromQueue();
      }
    );
  }

  function postAsk(prompt, action = "ask") {
    appendMessage("user", prompt);
    runtime.vscode.postMessage({
      type: "editAssistantAsk",
      payload: {
        requestId: createRequestId(),
        prompt,
        action,
        treeId: runtime.state?.selectedTreeId || "",
        nodePath: runtime.state?.selectedNodePath || "",
        queueTreeIds: runtime.state?.editAssistantTreeQueue || []
      }
    });
  }

  function handleAnswer(payload) {
    if (payload?.action === "scan" && payload.scan) {
      appendScanResult(payload.scan);
      return;
    }
    appendMessage("assistant", payload?.answer || getCopy().notReady);
  }

  function appendScanResult(scan) {
    const text = formatScanSummary(scan);
    runtime.state.editAssistantMessages = [
      ...(runtime.state.editAssistantMessages || []),
      { role: "assistant", text }
    ].slice(-50);
    appendScanResultElement(scan);
    runtime.app?.persistUiState?.();
  }

  function appendMessage(role, text) {
    runtime.state.editAssistantMessages = [
      ...(runtime.state.editAssistantMessages || []),
      { role, text }
    ].slice(-50);
    appendMessageElement(role, text);
    runtime.app?.persistUiState?.();
  }

  function renderStoredMessages() {
    const messages = runtime.state.editAssistantMessages || [];
    messages.forEach((message) => appendMessageElement(message.role, message.text));
  }

  function appendMessageElement(role, text) {
    const container = document.querySelector("[data-assistant-messages]");
    if (!container) {
      return;
    }

    const empty = container.querySelector(".edit-assistant-empty");
    empty?.remove();

    const item = document.createElement("article");
    item.className = `edit-assistant-message ${role === "user" ? "user" : "assistant"}`;

    const label = document.createElement("span");
    label.className = "edit-assistant-message-role";
    label.textContent = role === "user" ? getCopy().you : getCopy().assistant;

    const content = document.createElement("div");
    content.className = "edit-assistant-message-content";
    content.textContent = text;

    item.appendChild(label);
    item.appendChild(content);
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
  }

  function appendScanResultElement(scan) {
    const container = document.querySelector("[data-assistant-messages]");
    if (!container) {
      return;
    }

    const empty = container.querySelector(".edit-assistant-empty");
    empty?.remove();

    const item = document.createElement("article");
    item.className = "edit-assistant-message assistant";

    const label = document.createElement("span");
    label.className = "edit-assistant-message-role";
    label.textContent = getCopy().assistant;

    const content = document.createElement("div");
    content.className = "edit-assistant-message-content";

    const summary = document.createElement("div");
    summary.className = "edit-assistant-scan-summary";
    summary.textContent = formatScanSummary(scan);
    content.appendChild(summary);

    const groups = Array.isArray(scan.groups) && scan.groups.length > 0
      ? scan.groups
      : [{ title: runtime.state?.selectedTreeId || getCopy().scanScopeDocument, issues: Array.isArray(scan.issues) ? scan.issues : [] }];
    groups.forEach((group) => {
      content.appendChild(createScanGroup(group));
    });

    item.appendChild(label);
    item.appendChild(content);
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
  }

  function createScanGroup(group) {
    const section = document.createElement("section");
    section.className = "edit-assistant-scan-group";

    const heading = document.createElement("div");
    heading.className = "edit-assistant-scan-group-title";
    heading.textContent = formatScanGroupTitle(group);
    section.appendChild(heading);

    const issues = Array.isArray(group.issues) ? group.issues : [];
    if (issues.length === 0) {
      const empty = document.createElement("div");
      empty.className = "edit-assistant-scan-group-empty";
      empty.textContent = getCopy().scanGroupNoIssues;
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement("div");
    list.className = "edit-assistant-issue-list";
    issues.forEach((issue) => {
      list.appendChild(createIssueButton(issue));
    });
    section.appendChild(list);
    return section;
  }

  function createIssueButton(issue) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `edit-assistant-issue is-${issue.severity || "info"}`;
    button.textContent = issue.message || "";
    if (issue.treeId && issue.nodePath) {
      button.title = getCopy().jumpToIssue;
      button.addEventListener("click", () => {
        navigateToIssue(issue.treeId, issue.nodePath);
      });
    } else {
      button.disabled = true;
    }
    return button;
  }

  function navigateToIssue(treeId, nodePath) {
    if (!treeId || !nodePath || !runtime.state.currentPreview) {
      return;
    }

    if (typeof runtime.search?.focusResult === "function") {
      runtime.search.focusResult(treeId, nodePath);
      return;
    }

    runtime.state.selectedTreeId = treeId;
    runtime.state.selectedNodePath = nodePath;
    runtime.app?.activateTreePaneByTreeId?.(treeId, nodePath);
    runtime.app?.persistUiState?.();
    runtime.app?.renderCurrentTree?.(runtime.state.currentPreview, {
      preserveViewport: true,
      ensureActiveTreeVisible: true
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runtime.viewport?.focusNodePath?.(nodePath, treeId);
      });
    });
  }

  function insertNodeUid(uid) {
    const input = document.querySelector("[data-edit-assistant-input]");
    if (!input || (document.activeElement !== input && runtime.state.editAssistantInputActive !== true)) {
      return false;
    }

    const token = `#${uid}`;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const prefix = before && !/\s$/.test(before) ? " " : "";
    const suffix = after && !/^\s/.test(after) ? " " : "";
    input.value = `${before}${prefix}${token}${suffix}${after}`;
    const nextPosition = before.length + prefix.length + token.length + suffix.length;
    input.focus();
    input.setSelectionRange(nextPosition, nextPosition);
    return true;
  }

  function addCurrentTreeToQueue() {
    const treeId = runtime.state?.selectedTreeId || "";
    if (!treeId) {
      return;
    }
    const queue = runtime.state.editAssistantTreeQueue || [];
    if (!queue.includes(treeId)) {
      runtime.state.editAssistantTreeQueue = [...queue, treeId];
      runtime.app?.persistUiState?.();
      render();
      appendMessage("assistant", getCopy().treeAttached(treeId));
    }
  }

  function removeCurrentTreeFromQueue() {
    const treeId = runtime.state?.selectedTreeId || "";
    if (!treeId) {
      return;
    }
    const queue = runtime.state.editAssistantTreeQueue || [];
    if (queue.includes(treeId)) {
      runtime.state.editAssistantTreeQueue = queue.filter((entry) => entry !== treeId);
      runtime.app?.persistUiState?.();
      render();
      appendMessage("assistant", getCopy().treeDetached(treeId));
    }
  }

  function formatTreeQueue() {
    const queue = runtime.state.editAssistantTreeQueue || [];
    return queue.length > 0 ? queue.join(", ") : getCopy().none;
  }

  function getSelectedNodeUidLabel() {
    const node = findCurrentPreviewNode(runtime.state?.selectedTreeId, runtime.state?.selectedNodePath);
    if (!node) {
      return runtime.state?.selectedNodePath || getCopy().none;
    }
    return `${node.uid}`;
  }

  function findCurrentPreviewNode(treeId, nodePath) {
    const tree = (runtime.state?.currentPreview?.behaviorTrees || []).find((entry) => entry.id === treeId);
    if (!tree?.node || !nodePath) {
      return null;
    }
    const parts = String(nodePath).split(".");
    let current = tree.node;
    for (const part of parts.slice(1)) {
      const index = Number(part);
      if (!Number.isInteger(index) || !current.children?.[index]) {
        return null;
      }
      current = current.children[index];
    }
    return current;
  }

  function setVisible(visible) {
    if (!visible && hasPendingChanges() && !window.confirm(getCopy().discardPendingConfirm)) {
      return;
    }
    runtime.state.editAssistantVisible = visible;
    runtime.app?.persistUiState?.();
    runtime.workspacePanels?.apply?.();
    if (visible) {
      render();
    }
  }

  function hasPendingChanges() {
    return runtime.state.editAssistantHasPendingChanges === true;
  }

  function getWarningCount() {
    const warnings = runtime.state?.currentPreview?.warnings;
    return Array.isArray(warnings) ? warnings.length : 0;
  }

  function formatScanSummary(scan) {
    const copy = getCopy();
    const issues = Array.isArray(scan?.issues) ? scan.issues : [];
    const scannedTreeIds = Array.isArray(scan?.scannedTreeIds) ? scan.scannedTreeIds : [];
    if (issues.length === 0) {
      return copy.scanNoIssues(scannedTreeIds.join(", ") || copy.none);
    }
    const counts = issues.reduce(
      (summary, issue) => {
        const key = issue.severity === "error" || issue.severity === "warning" ? issue.severity : "info";
        summary[key] += 1;
        return summary;
      },
      { error: 0, warning: 0, info: 0 }
    );
    return copy.scanSummary(scannedTreeIds.join(", ") || copy.none, issues.length, counts);
  }

  function formatScanGroupTitle(group) {
    const copy = getCopy();
    const scannedTreeIds = Array.isArray(group?.scannedTreeIds) ? group.scannedTreeIds : [];
    const issues = Array.isArray(group?.issues) ? group.issues : [];
    const title = group?.title || copy.scanScopeDocument;
    const trees = scannedTreeIds.length > 0 ? scannedTreeIds.join(", ") : copy.none;
    return copy.scanGroupTitle(title, trees, issues.length);
  }

  function createRequestId() {
    return `edit-assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getCopy() {
    return runtime.i18n?.getEditAssistantCopy?.() || {
      title: "Assistant",
      hidePanel: "Hide assistant",
      configure: "Configure AI",
      configNotReady: "AI configuration is not implemented yet.",
      discardPendingConfirm: "The assistant has pending edits. Collapse it without applying them?",
      queueTitle: "Queue",
      treeLabel: "Tree",
      nodeLabel: "Node",
      warningLabel: "Warnings",
      quickActions: "Quick actions",
      scanTree: "Scan tree",
      addCurrentTree: "Add current subtree",
      removeCurrentTree: "Remove current subtree",
      messages: "Messages",
      empty: "Ask for a scan or an edit plan.",
      placeholder: "Describe the tree logic you want...",
      localProvider: "Local",
      send: "Ask",
      you: "You",
      assistant: "Assistant",
      none: "None",
      notReady: "Assistant backend is not connected yet.",
      scanQueueEmpty: "Queue is empty. Add a subtree with + before scanning.",
      scanNoIssues: (trees) => `Scan finished for ${trees}; no issues found.`,
      scanSummary: (trees, total, counts) =>
        `Scan finished for ${trees}; found ${total} issue(s): ${counts.error} error, ${counts.warning} warning, ${counts.info} info.`,
      scanScopeDocument: "Current Window",
      scanGroupTitle: (scope, trees, count) => `${scope}: ${trees} (${count})`,
      scanGroupNoIssues: "No issues in this scope.",
      jumpToIssue: "Jump to this node",
      treeAttached: (treeId) => `Added "${treeId}" to the assistant tree queue.`,
      treeDetached: (treeId) => `Removed "${treeId}" from the assistant tree queue.`
    };
  }

  runtime.editAssistant = {
    init,
    render,
    setVisible,
    handleAnswer,
    insertNodeUid
  };
})();
