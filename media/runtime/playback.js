(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  const STATUS_CLASS = {
    IDLE: "is-playback-idle",
    RUNNING: "is-playback-running",
    SUCCESS: "is-playback-success",
    FAILURE: "is-playback-failure"
  };

  function init() {
    runtime.refs.playbackImportButton?.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "importPlaybackLog" });
    });
    runtime.refs.playbackRange?.addEventListener("input", () => {
      setFrameIndex(Number(runtime.refs.playbackRange.value || 0));
    });
    runtime.refs.playbackPrevFrameButton?.addEventListener("click", () => {
      setFrameIndex(runtime.state.playbackFrameIndex - 1);
    });
    runtime.refs.playbackNextFrameButton?.addEventListener("click", () => {
      setFrameIndex(runtime.state.playbackFrameIndex + 1);
    });
  }

  function handlePlaybackLogResult(payload) {
    const copy = runtime.i18n.getPlaybackCopy();
    if (!payload?.ok || !payload.log) {
      runtime.state.playbackLog = null;
      runtime.state.playbackFrameIndex = 0;
      runtime.state.playbackError = payload?.message || copy.importFailed;
      syncPlaybackUi();
      runtime.app.persistUiState();
      return;
    }

    runtime.state.playbackLog = payload.log;
    runtime.state.playbackFrameIndex = 0;
    runtime.state.playbackError = "";
    runtime.app.persistUiState();
    syncPlaybackUi({ rerenderTree: true });
  }

  function syncPlaybackUi(options = {}) {
    const isPlayback = runtime.modeRules.isPlaybackMode();
    if (runtime.refs.playbackTimeline) {
      runtime.refs.playbackTimeline.hidden = !isPlayback;
    }

    if (!isPlayback) {
      return;
    }

    renderPlaybackBlackboard();
    renderPlaybackInspector();
    renderTimeline();

    if (options.rerenderTree && runtime.state.currentPreview) {
      runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    }
  }

  function renderPlaybackBlackboard() {
    const refs = runtime.refs;
    const copy = runtime.i18n.getPlaybackCopy();
    refs.catalogEyebrow.textContent = copy.blackboardTitle;
    refs.catalogSummary.textContent = getLogSummary();
    refs.catalogSearchInput.hidden = true;
    refs.addNodeModelButton.hidden = true;
    refs.editNodeDefinitionsButton.hidden = true;

    const list = refs.catalogList;
    if (!list) {
      return;
    }

    const frame = getCurrentFrame();
    if (!frame) {
      list.replaceChildren(createPlaybackEmpty(copy.noLog));
      return;
    }

    const blackboard = frame.blackboardData || {};
    const fragment = document.createDocumentFragment();
    const entries = Object.entries(blackboard);

    if (!entries.length) {
      list.replaceChildren(createPlaybackEmpty(copy.noBlackboardData));
      return;
    }

    entries.forEach(([scope, value]) => {
      const section = document.createElement("section");
      section.className = "playback-section";

      const title = document.createElement("h3");
      title.className = "playback-section-title";
      title.textContent = isPlainObject(value) ? scope : copy.blackboardTitle;
      section.appendChild(title);

      const values = isPlainObject(value) ? Object.entries(value) : [[scope, value]];
      values.forEach(([key, itemValue]) => {
        section.appendChild(createKeyValueRow(key, formatValue(itemValue)));
      });

      fragment.appendChild(section);
    });

    list.replaceChildren(fragment);
  }

  function renderPlaybackInspector() {
    const refs = runtime.refs;
    const copy = runtime.i18n.getPlaybackCopy();
    refs.inspectorEyebrow.textContent = copy.nodeStatesTitle;
    refs.inspectorTitle.textContent = copy.nodeStatesTitle;
    refs.inspectorKind.textContent = "Playback";
    refs.inspectorSummary.textContent = getLogSummary();
    refs.inspectorWarnings.replaceChildren();
    if (runtime.state.playbackError) {
      refs.inspectorStatus.hidden = false;
      refs.inspectorStatus.textContent = runtime.state.playbackError;
      refs.inspectorStatus.className = "inspector-status is-error";
    } else {
      refs.inspectorStatus.hidden = true;
      refs.inspectorStatus.textContent = "";
      refs.inspectorStatus.className = "inspector-status";
    }
    if (refs.inspectorActions) {
      refs.inspectorActions.hidden = true;
    }

    const items = buildNodeStateItems();
    if (!items.length) {
      refs.attributeList.replaceChildren(createPlaybackEmpty(copy.noNodeStates));
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = `playback-status-row playback-status-${normalizeStatus(item.status).toLowerCase()}`;

      const badge = document.createElement("span");
      badge.className = "playback-status-badge";
      badge.textContent = normalizeStatus(item.status);

      const content = document.createElement("span");
      content.className = "playback-status-content";

      const name = document.createElement("strong");
      name.textContent = item.nodeName || item.nodeUid || copy.unknownNode;

      const meta = document.createElement("small");
      meta.textContent = [
        item.treeId || "",
        item.nodeUid ? `uid ${item.nodeUid}` : "",
        item.seen ? formatOffset(item.offsetMs) : copy.notSeen
      ]
        .filter(Boolean)
        .join(" • ");

      content.appendChild(name);
      content.appendChild(meta);
      row.appendChild(badge);
      row.appendChild(content);
      fragment.appendChild(row);
    });

    refs.attributeList.replaceChildren(fragment);
  }

  function renderTimeline() {
    const copy = runtime.i18n.getPlaybackCopy();
    const log = runtime.state.playbackLog;
    const range = runtime.refs.playbackRange;
    const hasFrames = Boolean(log?.frames?.length);
    if (range) {
      range.disabled = !hasFrames;
      range.max = hasFrames ? String(log.frames.length - 1) : "0";
      range.value = String(clampFrameIndex(runtime.state.playbackFrameIndex));
    }
    if (runtime.refs.playbackPrevFrameButton) {
      runtime.refs.playbackPrevFrameButton.disabled = !hasFrames || runtime.state.playbackFrameIndex <= 0;
    }
    if (runtime.refs.playbackNextFrameButton) {
      runtime.refs.playbackNextFrameButton.disabled = !hasFrames || runtime.state.playbackFrameIndex >= (log?.frames?.length || 1) - 1;
    }
    if (runtime.refs.playbackTime) {
      runtime.refs.playbackTime.textContent = hasFrames
        ? `${formatOffset(getCurrentFrame()?.offsetMs || 0)} / ${formatOffset(log.durationMs || 0)} · ${runtime.state.playbackFrameIndex + 1}/${log.frames.length}`
        : copy.noLogLoaded;
    }
  }

  function setFrameIndex(index) {
    const nextIndex = clampFrameIndex(index);
    if (runtime.state.playbackFrameIndex === nextIndex) {
      return;
    }

    runtime.state.playbackFrameIndex = nextIndex;
    runtime.app.persistUiState();
    renderPlaybackBlackboard();
    renderPlaybackInspector();
    renderTimeline();
    if (runtime.state.currentPreview) {
      runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    }
  }

  function getCurrentFrame() {
    const frames = runtime.state.playbackLog?.frames || [];
    return frames[clampFrameIndex(runtime.state.playbackFrameIndex)] || null;
  }

  function getStatusSnapshot() {
    const frames = runtime.state.playbackLog?.frames || [];
    const limit = clampFrameIndex(runtime.state.playbackFrameIndex);
    const snapshot = new Map();
    for (let index = 0; index <= limit && index < frames.length; index += 1) {
      const frame = frames[index];
      const key = getFrameNodeKey(frame);
      if (!key) {
        continue;
      }
      snapshot.set(key, {
        ...frame,
        key
      });
    }
    return snapshot;
  }

  function buildNodeStateItems() {
    const snapshot = getStatusSnapshot();
    const usedLogKeys = new Set();
    const items = [];

    (runtime.state.currentPreview?.behaviorTrees || []).forEach((tree) => {
      walkPreviewNodes(tree.node, (node) => {
        const matched = findSnapshotForNode(snapshot, node);
        if (matched?.key) {
          usedLogKeys.add(matched.key);
        }
        items.push({
          nodeName: node.title || node.kind,
          nodeUid: getNodeUidCandidate(node),
          status: matched?.status || "IDLE",
          offsetMs: matched?.offsetMs || 0,
          treeId: tree.id,
          seen: Boolean(matched)
        });
      });
    });

    for (const item of snapshot.values()) {
      if (!usedLogKeys.has(item.key)) {
        items.push({
          ...item,
          seen: true
        });
      }
    }

    return items;
  }

  function getNodeStatus(node) {
    if (!runtime.modeRules.isPlaybackMode()) {
      return "";
    }

    const matched = findSnapshotForNode(getStatusSnapshot(), node);
    return matched ? normalizeStatus(matched.status) : "";
  }

  function findSnapshotForNode(snapshot, node) {
    const candidates = getNodeMatchCandidates(node);
    for (const item of snapshot.values()) {
      if (candidates.includes(item.nodeUid) || candidates.includes(item.nodeName)) {
        return item;
      }
    }

    return null;
  }

  function getNodeMatchCandidates(node) {
    return [
      node?.attributes?.uid,
      node?.attributes?._uid,
      node?.attributes?.UID,
      node?.attributes?.id,
      node?.attributes?.ID,
      node?.title,
      node?.instanceName,
      node?.kind
    ]
      .map((value) => (value === undefined || value === null ? "" : String(value)))
      .filter(Boolean);
  }

  function getNodeUidCandidate(node) {
    return [node?.attributes?.uid, node?.attributes?._uid, node?.attributes?.UID, node?.attributes?.id]
      .map((value) => (value === undefined || value === null ? "" : String(value)))
      .find(Boolean) || "";
  }

  function getStatusClass(status) {
    return STATUS_CLASS[normalizeStatus(status)] || "";
  }

  function clampFrameIndex(index) {
    const frames = runtime.state.playbackLog?.frames || [];
    if (!frames.length) {
      return 0;
    }
    const numeric = Number.isFinite(index) ? Math.trunc(index) : 0;
    return Math.max(0, Math.min(numeric, frames.length - 1));
  }

  function getFrameNodeKey(frame) {
    return frame?.nodeUid || frame?.nodeName || "";
  }

  function normalizeStatus(status) {
    return String(status || "IDLE")
      .replace(/\u001b\[[0-9;]*m/g, "")
      .trim()
      .toUpperCase();
  }

  function getLogSummary() {
    const copy = runtime.i18n.getPlaybackCopy();
    const log = runtime.state.playbackLog;
    if (!log?.frames?.length) {
      return copy.importHint;
    }
    return copy.summary(log.fileName, log.frameCount, formatOffset(log.durationMs || 0));
  }

  function createPlaybackEmpty(message) {
    const item = document.createElement("div");
    item.className = "tree-search-empty";
    item.textContent = message;
    return item;
  }

  function createKeyValueRow(key, value) {
    const row = document.createElement("div");
    row.className = "playback-kv-row";

    const keyNode = document.createElement("span");
    keyNode.className = "playback-kv-key";
    keyNode.textContent = key;

    const valueNode = document.createElement("span");
    valueNode.className = "playback-kv-value";
    valueNode.textContent = value;

    row.appendChild(keyNode);
    row.appendChild(valueNode);
    return row;
  }

  function formatValue(value) {
    if (value === null) {
      return "null";
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (_error) {
        return String(value);
      }
    }
    return String(value);
  }

  function formatOffset(ms) {
    const totalMs = Math.max(0, Number(ms) || 0);
    const seconds = Math.floor(totalMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const millis = Math.floor(totalMs % 1000);
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function walkPreviewNodes(node, visitor) {
    if (!node) {
      return;
    }
    visitor(node);
    (node.children || []).forEach((child) => walkPreviewNodes(child, visitor));
  }

  runtime.playback = {
    init,
    handlePlaybackLogResult,
    syncPlaybackUi,
    renderPlaybackBlackboard,
    renderPlaybackInspector,
    renderTimeline,
    getCurrentFrame,
    getStatusSnapshot,
    getNodeStatus,
    getStatusClass
  };
})();
