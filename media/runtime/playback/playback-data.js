(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const playbackData = (runtime.playbackData = runtime.playbackData || {});
  const { clampInteger, clampNumber } = runtime.math;
  const playbackCaches = new WeakMap();

  function normalizeStatusClass(status) {
    return String(status || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  }

  function normalizeFilter(value) {
    return String(value || "").trim().toLowerCase();
  }

  function hydratePlaybackLog(log) {
    const compact = log?.compactTransitions;
    if (!compact || compact.codec !== "filelogger2-base64-v1") {
      return log;
    }

    const store = createFileLogger2CompactStore(log, compact);
    return {
      ...log,
      frames: createLazyFileLogger2Frames(store),
      transitions: createLazyFileLogger2Transitions(store),
      blackboardEvents: []
    };
  }

  function createFileLogger2CompactStore(log, compact) {
    const bytes = decodeBase64Bytes(compact.transitionBytesBase64 || "");
    const count = Math.min(
      Math.max(0, Number(compact.transitionCount) || 0),
      Math.floor(bytes.length / 9)
    );
    const statusCodes = log?.header?.statusCodes || {};
    const createdWallTimeUs = log?.header?.createdWallTimeUs ?? null;
    const prevStatusCodes = new Uint8Array(count);
    const durationUs = new Float64Array(count);
    durationUs.fill(Number.NaN);

    const lastStatusByUid = new Map();
    const runningStartByUid = new Map();
    for (let index = 0; index < count; index += 1) {
      const uid = readFileLogger2Uid(bytes, index);
      const statusCode = readFileLogger2Status(bytes, index);
      const prevStatusCode = lastStatusByUid.has(uid) ? lastStatusByUid.get(uid) : 0;
      prevStatusCodes[index] = prevStatusCode;
      if (statusCode === 1) {
        runningStartByUid.set(uid, readFileLogger2Time(bytes, index));
      } else if (runningStartByUid.has(uid)) {
        durationUs[index] = Math.max(0, readFileLogger2Time(bytes, index) - runningStartByUid.get(uid));
        runningStartByUid.delete(uid);
      }
      lastStatusByUid.set(uid, statusCode);
    }

    return {
      bytes,
      count,
      statusCodes,
      createdWallTimeUs,
      prevStatusCodes,
      durationUs
    };
  }

  function createLazyFileLogger2Transitions(store) {
    let proxy = null;
    const target = {
      length: store.count,
      forEach(callback, thisArg) {
        for (let index = 0; index < store.count; index += 1) {
          callback.call(thisArg, getFileLogger2Transition(store, index), index, proxy);
        }
      },
      map(callback, thisArg) {
        const result = [];
        for (let index = 0; index < store.count; index += 1) {
          result.push(callback.call(thisArg, getFileLogger2Transition(store, index), index, proxy));
        }
        return result;
      },
      filter(callback, thisArg) {
        const result = [];
        for (let index = 0; index < store.count; index += 1) {
          const transition = getFileLogger2Transition(store, index);
          if (callback.call(thisArg, transition, index, proxy)) {
            result.push(transition);
          }
        }
        return result;
      },
      slice(start = 0, end = store.count) {
        const result = [];
        const normalizedStart = Math.max(0, start < 0 ? store.count + start : start);
        const normalizedEnd = Math.min(store.count, end < 0 ? store.count + end : end);
        for (let index = normalizedStart; index < normalizedEnd; index += 1) {
          result.push(getFileLogger2Transition(store, index));
        }
        return result;
      },
      [Symbol.iterator]: function* iterator() {
        for (let index = 0; index < store.count; index += 1) {
          yield getFileLogger2Transition(store, index);
        }
      }
    };
    proxy = new Proxy(target, {
      get(targetObject, property) {
        if (property in targetObject) {
          return targetObject[property];
        }
        const index = toArrayIndex(property);
        return index === null ? undefined : getFileLogger2Transition(store, index);
      }
    });
    return proxy;
  }

  function createLazyFileLogger2Frames(store) {
    let proxy = null;
    const target = {
      length: store.count,
      forEach(callback, thisArg) {
        for (let index = 0; index < store.count; index += 1) {
          callback.call(thisArg, getFileLogger2Frame(store, index), index, proxy);
        }
      },
      [Symbol.iterator]: function* iterator() {
        for (let index = 0; index < store.count; index += 1) {
          yield getFileLogger2Frame(store, index);
        }
      }
    };
    proxy = new Proxy(target, {
      get(targetObject, property) {
        if (property in targetObject) {
          return targetObject[property];
        }
        const index = toArrayIndex(property);
        return index === null ? undefined : getFileLogger2Frame(store, index);
      }
    });
    return proxy;
  }

  function toArrayIndex(property) {
    if (typeof property !== "string" || !/^(0|[1-9]\d*)$/.test(property)) {
      return null;
    }
    const index = Number(property);
    return Number.isSafeInteger(index) ? index : null;
  }

  function getFileLogger2Transition(store, index) {
    if (!Number.isInteger(index) || index < 0 || index >= store.count) {
      return undefined;
    }
    const tUs = readFileLogger2Time(store.bytes, index);
    const uid = readFileLogger2Uid(store.bytes, index);
    const statusCode = readFileLogger2Status(store.bytes, index);
    const prevStatusCode = store.prevStatusCodes[index] ?? 0;
    const durationUs = store.durationUs[index];
    return {
      frameIndex: index,
      seq: index + 1,
      tUs,
      wallUs: addScalarMicroseconds(store.createdWallTimeUs, tUs),
      uid,
      prevStatusCode,
      statusCode,
      prevStatus: statusCodeToName(prevStatusCode, store.statusCodes),
      status: statusCodeToName(statusCode, store.statusCodes),
      durationUs: Number.isNaN(durationUs) ? null : durationUs
    };
  }

  function getFileLogger2Frame(store, index) {
    if (!Number.isInteger(index) || index < 0 || index >= store.count) {
      return undefined;
    }
    const tUs = readFileLogger2Time(store.bytes, index);
    return {
      index,
      kind: "node",
      tUs,
      wallUs: addScalarMicroseconds(store.createdWallTimeUs, tUs),
      seq: index + 1,
      transitionIndex: index
    };
  }

  function readFileLogger2Time(bytes, index) {
    const offset = index * 9;
    let value = 0;
    let multiplier = 1;
    for (let cursor = 0; cursor < 6; cursor += 1) {
      value += bytes[offset + cursor] * multiplier;
      multiplier *= 256;
    }
    return value;
  }

  function readFileLogger2Uid(bytes, index) {
    const offset = index * 9 + 6;
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readFileLogger2Status(bytes, index) {
    return bytes[index * 9 + 8];
  }

  function statusCodeToName(code, statusCodes) {
    const key = String(code ?? "");
    if (statusCodes?.[key]) {
      return statusCodes[key];
    }
    switch (Number(code)) {
      case 0:
        return "IDLE";
      case 1:
        return "RUNNING";
      case 2:
        return "SUCCESS";
      case 3:
        return "FAILURE";
      case 4:
        return "SKIPPED";
      default:
        return "UNKNOWN";
    }
  }

  function addScalarMicroseconds(value, offsetUs) {
    if (typeof value === "number") {
      return value + offsetUs;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return (BigInt(value) + BigInt(offsetUs)).toString();
    }
    return value;
  }

  function decodeBase64Bytes(value) {
    if (typeof atob === "function") {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      const chunkSize = 65536;
      for (let start = 0; start < binary.length; start += chunkSize) {
        const end = Math.min(binary.length, start + chunkSize);
        for (let index = start; index < end; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
      }
      return bytes;
    }
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(value, "base64"));
    }
    return new Uint8Array();
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
    const nodesByUid = {};
    (preview?.behaviorTrees || []).forEach((tree) => {
      walkWithParent(tree.node, null, 0, (node, parentUid, depth) => {
        if (node?.attributes?._uid) {
          const uid = String(node.attributes._uid);
          uidByTreePath[`${tree.id}::${node.nodePath}`] = uid;
          depthByUid[uid] = Math.max(depthByUid[uid] || 0, depth);
          if (!nodesByUid[uid]) {
            nodesByUid[uid] = node;
          }
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
    return { uidByTreePath, locationsByUid, childrenByUid, depthByUid, nodesByUid };
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

  function normalizeTimeValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  Object.assign(playbackData, {
    hydratePlaybackLog,
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
