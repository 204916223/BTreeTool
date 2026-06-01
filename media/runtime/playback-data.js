(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const playbackData = (runtime.playbackData = runtime.playbackData || {});
  const playbackCaches = new WeakMap();

  function normalizeStatusClass(status) {
    return String(status || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  }

  function normalizeFilter(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPlaybackCache(log) {
    let cache = playbackCaches.get(log);
    if (cache) {
      return cache;
    }

    const nodeIndex = indexPlaybackNodes(log.preview);
    cache = {
      nodeIndex,
      transitions: log.transitions || [],
      blackboardEvents: log.blackboardEvents || [],
      ancestorEntries: Object.keys(nodeIndex.depthByUid || {})
        .map((uid) => ({ uid, depth: nodeIndex.depthByUid[uid] || 0 }))
        .sort((left, right) => right.depth - left.depth),
      nodeNameByUid: new Map((log.nodeDefinitions || []).map((entry) => [String(entry.uid), entry.name || `uid ${entry.uid}`])),
      nodeSnapshot: {
        frameIndex: -1,
        transitionCursor: 0,
        statusByUid: {},
        latestTransitionByUid: {},
        lastTerminalStatusByUid: {}
      },
      nodeTimeSnapshot: {
        tUs: -Infinity,
        transitionCursor: 0,
        statusByUid: {},
        latestTransitionByUid: {},
        lastTerminalStatusByUid: {}
      },
      blackboardSnapshot: {
        frameIndex: -1,
        eventCursor: 0,
        latestBlackboardEvent: null,
        blackboardValues: null
      },
      blackboardTimeSnapshot: {
        tUs: -Infinity,
        eventCursor: 0,
        latestBlackboardEvent: null,
        blackboardValues: null
      },
      transitionListModel: null
    };
    playbackCaches.set(log, cache);
    return cache;
  }

  function buildPlaybackSnapshot(log, frameIndex, options = {}) {
    const cache = getPlaybackCache(log);
    const nodeSnapshot = buildPlaybackNodeSnapshot(cache, frameIndex);
    const statusByUid = { ...nodeSnapshot.statusByUid };
    applyRunningStatusToAncestors(statusByUid, cache.ancestorEntries);
    const blackboardSnapshot = options.includeBlackboard === false
      ? {
        latestBlackboardEvent: null,
        blackboardValues: null
      }
      : buildPlaybackBlackboardSnapshot(cache, frameIndex);

    return {
      statusByUid,
      latestTransitionByUid: nodeSnapshot.latestTransitionByUid,
      lastTerminalStatusByUid: nodeSnapshot.lastTerminalStatusByUid,
      currentFrameTransitionKeys: nodeSnapshot.currentFrameTransitionKeys,
      latestBlackboardEvent: blackboardSnapshot.latestBlackboardEvent,
      blackboardValues: blackboardSnapshot.blackboardValues || {}
    };
  }

  function buildPlaybackSnapshotAtTime(log, tUs, options = {}) {
    const cache = getPlaybackCache(log);
    const time = normalizeTimeValue(tUs);
    const nodeSnapshot = buildPlaybackNodeSnapshotAtTime(cache, time);
    const statusByUid = { ...nodeSnapshot.statusByUid };
    applyRunningStatusToAncestors(statusByUid, cache.ancestorEntries);
    const blackboardSnapshot = options.includeBlackboard === false
      ? {
        latestBlackboardEvent: null,
        blackboardValues: null
      }
      : buildPlaybackBlackboardSnapshotAtTime(cache, time);

    return {
      statusByUid,
      latestTransitionByUid: nodeSnapshot.latestTransitionByUid,
      lastTerminalStatusByUid: nodeSnapshot.lastTerminalStatusByUid,
      currentFrameTransitionKeys: nodeSnapshot.currentFrameTransitionKeys,
      latestBlackboardEvent: blackboardSnapshot.latestBlackboardEvent,
      blackboardValues: blackboardSnapshot.blackboardValues || {}
    };
  }

  function buildPlaybackNodeSnapshot(cache, frameIndex) {
    const transitions = cache.transitions || [];
    let snapshot = cache.nodeSnapshot;
    if (!snapshot || frameIndex < snapshot.frameIndex) {
      snapshot = {
        frameIndex: -1,
        transitionCursor: 0,
        statusByUid: {},
        latestTransitionByUid: {},
        lastTerminalStatusByUid: {}
      };
    }

    const statusByUid = { ...snapshot.statusByUid };
    const latestTransitionByUid = { ...snapshot.latestTransitionByUid };
    const lastTerminalStatusByUid = { ...snapshot.lastTerminalStatusByUid };
    let transitionCursor = snapshot.transitionCursor || 0;

    while (transitionCursor < transitions.length) {
      const transition = transitions[transitionCursor];
      if (transition.frameIndex > frameIndex) {
        break;
      }
      const key = String(transition.uid);
      statusByUid[key] = transition.status;
      latestTransitionByUid[key] = transition;
      if (transition.status === "SUCCESS" || transition.status === "FAILURE") {
        lastTerminalStatusByUid[key] = transition.status;
      }
      transitionCursor += 1;
    }

    const currentFrameTransitionKeys = collectCurrentFrameTransitionKeys(transitions, frameIndex, transitionCursor);

    cache.nodeSnapshot = {
      frameIndex,
      transitionCursor,
      statusByUid,
      latestTransitionByUid,
      lastTerminalStatusByUid
    };

    return {
      statusByUid,
      latestTransitionByUid,
      lastTerminalStatusByUid,
      currentFrameTransitionKeys
    };
  }

  function buildPlaybackNodeSnapshotAtTime(cache, tUs) {
    const transitions = cache.transitions || [];
    let snapshot = cache.nodeTimeSnapshot;
    if (!snapshot || tUs < snapshot.tUs) {
      snapshot = {
        tUs: -Infinity,
        transitionCursor: 0,
        statusByUid: {},
        latestTransitionByUid: {},
        lastTerminalStatusByUid: {}
      };
    }

    const statusByUid = { ...snapshot.statusByUid };
    const latestTransitionByUid = { ...snapshot.latestTransitionByUid };
    const lastTerminalStatusByUid = { ...snapshot.lastTerminalStatusByUid };
    let transitionCursor = snapshot.transitionCursor || 0;

    while (transitionCursor < transitions.length) {
      const transition = transitions[transitionCursor];
      if (normalizeTimeValue(transition.tUs) > tUs) {
        break;
      }
      const key = String(transition.uid);
      statusByUid[key] = transition.status;
      latestTransitionByUid[key] = transition;
      if (transition.status === "SUCCESS" || transition.status === "FAILURE") {
        lastTerminalStatusByUid[key] = transition.status;
      }
      transitionCursor += 1;
    }

    const currentFrameTransitionKeys = collectCurrentTimeTransitionKeys(transitions, tUs, transitionCursor);

    cache.nodeTimeSnapshot = {
      tUs,
      transitionCursor,
      statusByUid,
      latestTransitionByUid,
      lastTerminalStatusByUid
    };

    return {
      statusByUid,
      latestTransitionByUid,
      lastTerminalStatusByUid,
      currentFrameTransitionKeys
    };
  }

  function collectCurrentFrameTransitionKeys(transitions, frameIndex, endCursor) {
    const keys = new Set();
    for (let index = endCursor - 1; index >= 0; index -= 1) {
      const transition = transitions[index];
      if (transition.frameIndex !== frameIndex) {
        break;
      }
      keys.add(`${transition.uid}:${transition.seq}`);
    }
    return keys;
  }

  function collectCurrentTimeTransitionKeys(transitions, tUs, endCursor) {
    const keys = new Set();
    for (let index = endCursor - 1; index >= 0; index -= 1) {
      const transition = transitions[index];
      if (normalizeTimeValue(transition.tUs) !== tUs) {
        break;
      }
      keys.add(`${transition.uid}:${transition.seq}`);
    }
    return keys;
  }

  function buildPlaybackBlackboardSnapshot(cache, frameIndex) {
    const blackboardEvents = cache.blackboardEvents || [];
    let snapshot = cache.blackboardSnapshot;
    if (!snapshot || frameIndex < snapshot.frameIndex) {
      snapshot = {
        frameIndex: -1,
        eventCursor: 0,
        latestBlackboardEvent: null,
        blackboardValues: null
      };
    }

    let latestBlackboardEvent = snapshot.latestBlackboardEvent;
    let blackboardValues = snapshot.blackboardValues;
    let eventCursor = snapshot.eventCursor || 0;

    while (eventCursor < blackboardEvents.length) {
      const event = blackboardEvents[eventCursor];
      if (event.frameIndex > frameIndex) {
        break;
      }
      latestBlackboardEvent = event;
      if (event.kind === "snapshot") {
        blackboardValues = cloneJsonValue(event.values || {});
      } else {
        blackboardValues = applyBlackboardPatch(blackboardValues || {}, event.patch);
      }
      eventCursor += 1;
    }

    cache.blackboardSnapshot = {
      frameIndex,
      eventCursor,
      latestBlackboardEvent,
      blackboardValues
    };

    return {
      latestBlackboardEvent,
      blackboardValues: blackboardValues || {}
    };
  }

  function buildPlaybackBlackboardSnapshotAtTime(cache, tUs) {
    const blackboardEvents = cache.blackboardEvents || [];
    let snapshot = cache.blackboardTimeSnapshot;
    if (!snapshot || tUs < snapshot.tUs) {
      snapshot = {
        tUs: -Infinity,
        eventCursor: 0,
        latestBlackboardEvent: null,
        blackboardValues: null
      };
    }

    let latestBlackboardEvent = snapshot.latestBlackboardEvent;
    let blackboardValues = snapshot.blackboardValues;
    let eventCursor = snapshot.eventCursor || 0;

    while (eventCursor < blackboardEvents.length) {
      const event = blackboardEvents[eventCursor];
      if (normalizeTimeValue(event.tUs) > tUs) {
        break;
      }
      latestBlackboardEvent = event;
      if (event.kind === "snapshot") {
        blackboardValues = cloneJsonValue(event.values || {});
      } else {
        blackboardValues = applyBlackboardPatch(blackboardValues || {}, event.patch);
      }
      eventCursor += 1;
    }

    cache.blackboardTimeSnapshot = {
      tUs,
      eventCursor,
      latestBlackboardEvent,
      blackboardValues
    };

    return {
      latestBlackboardEvent,
      blackboardValues: blackboardValues || {}
    };
  }

  function applyBlackboardPatch(source, patch) {
    const target = cloneJsonValue(source || {});
    if (!Array.isArray(patch)) {
      return target;
    }

    patch.forEach((operation) => {
      if (!operation || typeof operation !== "object" || !operation.path) {
        return;
      }
      applyJsonPatchOperation(target, operation);
    });
    return target;
  }

  function applyJsonPatchOperation(target, operation) {
    const pathParts = decodeJsonPointer(operation.path);
    if (pathParts.length === 0) {
      return;
    }

    const key = pathParts[pathParts.length - 1];
    let parent = target;
    for (const part of pathParts.slice(0, -1)) {
      if (!parent || typeof parent !== "object") {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(parent, part) || parent[part] == null) {
        parent[part] = {};
      }
      parent = parent[part];
    }

    if (!parent || typeof parent !== "object") {
      return;
    }
    if (operation.op === "remove") {
      delete parent[key];
      return;
    }
    if (operation.op === "add" || operation.op === "replace") {
      parent[key] = cloneJsonValue(operation.value);
    }
  }

  function decodeJsonPointer(path) {
    if (path === "") {
      return [];
    }
    return String(path)
      .replace(/^\//, "")
      .split("/")
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  }

  function cloneJsonValue(value) {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(cloneJsonValue);
    }
    const result = {};
    Object.entries(value).forEach(([key, entry]) => {
      result[key] = cloneJsonValue(entry);
    });
    return result;
  }

  function applyRunningStatusToAncestors(statusByUid, entries = getPlaybackCache(runtime.state.playbackLog).ancestorEntries) {
    entries.forEach(({ uid }) => {
      const children = runtime.state.playbackChildrenByUid?.[uid] || [];
      if (children.some((childUid) => statusByUid[String(childUid)] === "RUNNING")) {
        statusByUid[String(uid)] = "RUNNING";
      }
    });
  }

  function indexPlaybackNodes(preview) {
    const uidByTreePath = {};
    const locationsByUid = {};
    const childrenByUid = {};
    const depthByUid = {};
    (preview?.behaviorTrees || []).forEach((tree) => {
      walkWithParent(tree.node, null, 0, (node, parentUid, depth) => {
        if (node?.attributes?._uid) {
          const uid = String(node.attributes._uid);
          uidByTreePath[`${tree.id}::${node.nodePath}`] = uid;
          depthByUid[uid] = Math.max(depthByUid[uid] || 0, depth);
          const locations = locationsByUid[uid] || [];
          locations.push({
            treeId: tree.id,
            nodePath: node.nodePath
          });
          locationsByUid[uid] = locations;
          if (parentUid) {
            const children = childrenByUid[parentUid] || [];
            if (!children.includes(uid)) {
              children.push(uid);
            }
            childrenByUid[parentUid] = children;
          }
        }
      });
    });
    return { uidByTreePath, locationsByUid, childrenByUid, depthByUid };
  }

  function walkWithParent(node, parentUid, depth, visit) {
    if (!node) {
      return;
    }
    visit(node, parentUid, depth);
    const currentUid = node.attributes?._uid ? String(node.attributes._uid) : parentUid;
    (node.children || []).forEach((child) => walkWithParent(child, currentUid, depth + 1, visit));
  }

  function getActiveTransition(log, frameIndex) {
    const index = getActiveTransitionIndex(log, frameIndex);
    return index === null ? null : log.transitions?.[index] || null;
  }

  function getActiveTransitionAtTime(log, tUs) {
    const index = getActiveTransitionIndexAtTime(log, tUs);
    return index === null ? null : log.transitions?.[index] || null;
  }

  function getActiveTransitionIndex(log, frameIndex) {
    const frame = log.frames?.[frameIndex] || null;
    if (Number.isInteger(frame?.transitionIndex)) {
      return frame.transitionIndex;
    }
    return findLastTransitionIndexAtOrBeforeFrame(log.transitions || [], frameIndex);
  }

  function getActiveTransitionIndexAtTime(log, tUs) {
    return findLastTransitionIndexAtOrBeforeTime(log.transitions || [], tUs);
  }

  function findLastTransitionIndexAtOrBeforeFrame(transitions, frameIndex) {
    let left = 0;
    let right = transitions.length - 1;
    let match = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (transitions[mid].frameIndex <= frameIndex) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return match;
  }

  function findLastTransitionIndexBeforeFrame(transitions, frameIndex) {
    let left = 0;
    let right = transitions.length - 1;
    let match = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (transitions[mid].frameIndex < frameIndex) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return match;
  }

  function findFirstTransitionIndexAfterFrame(transitions, frameIndex) {
    let left = 0;
    let right = transitions.length - 1;
    let match = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (transitions[mid].frameIndex > frameIndex) {
        match = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return match;
  }

  function findLastTransitionIndexAtOrBeforeTime(transitions, tUs) {
    const target = normalizeTimeValue(tUs);
    let left = 0;
    let right = transitions.length - 1;
    let match = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (normalizeTimeValue(transitions[mid].tUs) <= target) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return match;
  }

  function findLastTransitionIndexBeforeTime(transitions, tUs) {
    const target = normalizeTimeValue(tUs);
    let left = 0;
    let right = transitions.length - 1;
    let match = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (normalizeTimeValue(transitions[mid].tUs) < target) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return match;
  }

  function findFirstTransitionIndexAfterTime(transitions, tUs) {
    const target = normalizeTimeValue(tUs);
    let left = 0;
    let right = transitions.length - 1;
    let match = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (normalizeTimeValue(transitions[mid].tUs) > target) {
        match = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return match;
  }

  function getPlaybackTransitionListModel(log, filter = normalizeFilter(runtime.state.playbackTransitionFilter)) {
    const cache = getPlaybackCache(log);
    const transitions = log.transitions || [];
    if (cache.transitionListModel?.filter === filter && cache.transitionListModel?.total === transitions.length) {
      return cache.transitionListModel;
    }

    if (!filter) {
      cache.transitionListModel = {
        filter,
        total: transitions.length,
        visibleCount: transitions.length,
        indexes: null
      };
      return cache.transitionListModel;
    }

    const filterSpec = parsePlaybackTransitionFilter(filter);
    const indexes = [];
    transitions.forEach((transition, index) => {
      if (matchesPlaybackTransitionFilter(log, transition, filterSpec)) {
        indexes.push(index);
      }
    });

    cache.transitionListModel = {
      filter,
      total: transitions.length,
      visibleCount: indexes.length,
      indexes
    };
    return cache.transitionListModel;
  }

  function parsePlaybackTransitionFilter(filter) {
    const value = normalizeFilter(filter);
    const uidMatch = value.match(/^(?:uid\s*[:=]?\s*)?(\d+)$/);
    if (uidMatch) {
      return {
        type: "uid",
        uid: uidMatch[1]
      };
    }
    return {
      type: "name",
      text: value
    };
  }

  function matchesPlaybackTransitionFilter(log, transition, filterSpec) {
    if (filterSpec.type === "uid") {
      return String(transition.uid) === filterSpec.uid;
    }
    return resolvePlaybackNodeName(log, transition).toLowerCase().includes(filterSpec.text);
  }

  function getPlaybackTransitionIndexAtPosition(model, position) {
    return model.indexes ? model.indexes[position] : position;
  }

  function getPlaybackTransitionPosition(model, transitionIndex) {
    if (!Number.isInteger(transitionIndex) || transitionIndex < 0) {
      return -1;
    }
    if (!model.indexes) {
      return transitionIndex < model.visibleCount ? transitionIndex : -1;
    }

    let left = 0;
    let right = model.indexes.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const value = model.indexes[mid];
      if (value === transitionIndex) {
        return mid;
      }
      if (value < transitionIndex) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return -1;
  }

  function findPlaybackNodeLocation(uid) {
    const locations = runtime.state.playbackNodeLocationsByUid?.[String(uid)] || [];
    if (locations.length === 0) {
      return null;
    }
    return locations.find((entry) => entry.treeId === runtime.state.selectedTreeId) || locations[0];
  }

  function resolvePlaybackNodeName(log, transition) {
    return getPlaybackCache(log).nodeNameByUid.get(String(transition.uid)) || `uid ${transition.uid}`;
  }

  function getPlaybackStatusClassForUid(uid, edge) {
    const key = String(uid || "");
    const status = runtime.state.playbackStatusByUid?.[key] || "IDLE";
    const lastTerminalStatus = runtime.state.playbackLastTerminalStatusByUid?.[key] || "";
    const prefix = edge ? "playback-edge-status" : "playback-status";
    if (status === "IDLE" && lastTerminalStatus === "SUCCESS") {
      return `${prefix}-success-idle`;
    }
    if (status === "IDLE" && lastTerminalStatus === "FAILURE") {
      return `${prefix}-failure-idle`;
    }
    const normalized = normalizeStatusClass(status);
    if (["idle", "running", "success", "failure"].includes(normalized)) {
      return `${prefix}-${normalized}`;
    }
    return `${prefix}-unknown`;
  }

  function clampInteger(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  function normalizeTimeValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  Object.assign(playbackData, {
    getPlaybackCache,
    buildPlaybackSnapshot,
    buildPlaybackSnapshotAtTime,
    getActiveTransition,
    getActiveTransitionAtTime,
    getActiveTransitionIndex,
    getActiveTransitionIndexAtTime,
    findLastTransitionIndexAtOrBeforeFrame,
    findLastTransitionIndexBeforeFrame,
    findFirstTransitionIndexAfterFrame,
    findLastTransitionIndexAtOrBeforeTime,
    findLastTransitionIndexBeforeTime,
    findFirstTransitionIndexAfterTime,
    getPlaybackTransitionListModel,
    getPlaybackTransitionIndexAtPosition,
    getPlaybackTransitionPosition,
    findPlaybackNodeLocation,
    resolvePlaybackNodeName,
    getPlaybackStatusClassForUid,
    clampInteger,
    clampNumber
  });
})();
