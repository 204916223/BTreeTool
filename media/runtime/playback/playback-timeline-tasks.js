(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const timelineTasks = (runtime.playbackTimelineTasks = runtime.playbackTimelineTasks || {});
  const { clampNumber } = runtime.math;
  const MIN_SEGMENT_WIDTH_PERCENT = 0.2;

  function buildPlaybackDurationModel(log, options = {}) {
    const transitions = log.transitions || [];
    const frames = log.frames || [];
    const firstTime = Number(frames[0]?.tUs ?? transitions[0]?.tUs ?? 0);
    const lastTime = Number(frames[frames.length - 1]?.tUs ?? transitions[transitions.length - 1]?.tUs ?? firstTime);
    const laneHeight = options.laneHeight || 42;
    const blockHeight = options.blockHeight || Math.max(10, laneHeight - 10);
    const total = Math.max(1, lastTime - firstTime);
    const baseTrackWidth = Math.max(960, Math.ceil((total / 1000) * 0.12));

    const selectedRule = selectTimelineTaskRule(log, firstTime, lastTime);
    const tasks = selectedRule.tasks;
    const segments = buildSegments(log, tasks, firstTime, total, laneHeight);
    const laneCount = Math.max(1, segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0));

    return {
      firstTime,
      total,
      baseTrackWidth,
      trackHeight: Math.max(96, laneCount * laneHeight),
      laneCount,
      laneHeight,
      blockHeight,
      taskRuleId: selectedRule.id,
      taskRuleName: selectedRule.name,
      segments
    };
  }

  function selectTimelineTaskRule(log, firstTime, lastTime) {
    const rules = getTimelineTaskRules()
      .slice()
      .sort((left, right) => left.id - right.id);

    for (const rule of rules) {
      const tasks = rule.build(log, firstTime, lastTime);
      if (tasks.length > 0) {
        return { ...rule, tasks };
      }
    }

    return {
      id: 0,
      name: "empty",
      tasks: []
    };
  }

  function getTimelineTaskRules() {
    return [
      {
        id: 10,
        name: "stage-and-return-marker",
        build: buildStageAndReturnMarkedTasks
      },
      {
        id: 15,
        name: "description-marker",
        build: buildDescriptionMarkedTasks
      },
      {
        id: 20,
        name: "tree-root-status",
        build: buildTreeGroupedTasks
      }
    ];
  }

  function buildStageAndReturnMarkedTasks(log, firstTime, lastTime) {
    const markers = getStageAndReturnMarkers(log);
    if (markers.length === 0) {
      return [];
    }

    const markerEvents = buildStageAndReturnMarkerEvents(log, markers);
    if (markerEvents.length === 0) {
      return [];
    }

    const tasks = [];
    const openByPhase = new Map();
    markerEvents.forEach((event) => {
      if (event.kind === "s") {
        const open = openByPhase.get(event.phase) || [];
        open.push(event);
        openByPhase.set(event.phase, open);
        return;
      }

      const open = openByPhase.get(event.phase) || [];
      const startEvent = open.shift();
      if (!startEvent) {
        return;
      }
      if (open.length === 0) {
        openByPhase.delete(event.phase);
      }
      pushStageAndReturnTask(tasks, startEvent, event, firstTime, lastTime);
    });

    openByPhase.forEach((open) => {
      open.forEach((startEvent) => {
        pushStageAndReturnTask(tasks, startEvent, null, firstTime, lastTime);
      });
    });

    return tasks;
  }

  function getStageAndReturnMarkers(log) {
    const cache = runtime.playbackData.getPlaybackCache(log);
    if (cache.timelineStageAndReturnMarkers) {
      return cache.timelineStageAndReturnMarkers;
    }

    const markers = [];
    let order = 0;
    (log.preview?.behaviorTrees || []).forEach((tree) => {
      walkPreviewNode(tree.node, (node) => {
        if (!isStageAndReturnNode(node)) {
          return;
        }

        const uid = getNodeUid(node);
        const phase = String(node?.attributes?.phase || "").trim();
        const kind = normalizeStageAndReturnEvent(node?.attributes?.event);
        if (!uid || !phase || !kind) {
          return;
        }

        markers.push({
          uid,
          treeId: tree.id,
          nodePath: node.nodePath,
          nodeTitle: node.title,
          phase,
          kind,
          order: order++
        });
      });
    });

    cache.timelineStageAndReturnMarkers = markers;
    return markers;
  }

  function isStageAndReturnNode(node) {
    const kind = String(node?.kind || "");
    const title = String(node?.title || "");
    const id = String(node?.attributes?.ID || node?.attributes?.id || "");
    return kind === "StageAndReturn" || title === "StageAndReturn" || id === "StageAndReturn";
  }

  function normalizeStageAndReturnEvent(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "s" || normalized === "start") {
      return "s";
    }
    if (normalized === "e" || normalized === "end") {
      return "e";
    }
    return "";
  }

  function buildStageAndReturnMarkerEvents(log, markers) {
    const transitionsByUid = indexTransitionsByUid(log.transitions || []);
    const events = [];
    markers.forEach((marker) => {
      getMarkerExecutionTransitions(transitionsByUid.get(marker.uid) || []).forEach((transition) => {
        const time = Number(transition.tUs);
        if (!Number.isFinite(time)) {
          return;
        }

        events.push({
          ...marker,
          transition,
          time,
          frameIndex: transition.frameIndex,
          transitionIndex: transition._timelineIndex
        });
      });
    });
    events.sort((left, right) =>
      left.time - right.time ||
      left.transitionIndex - right.transitionIndex ||
      left.order - right.order
    );
    return events;
  }

  function getMarkerExecutionTransitions(transitions) {
    const nonIdle = transitions.filter((transition) => normalizeStatusName(transition.status) !== "IDLE");
    return nonIdle.length > 0 ? nonIdle : transitions;
  }

  function pushStageAndReturnTask(tasks, startEvent, endEvent, firstTime, lastTime) {
    const start = Number(startEvent.time);
    const end = endEvent ? Number(endEvent.time) : lastTime;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return;
    }

    const endTransition = endEvent?.transition || null;
    tasks.push({
      id: `${startEvent.phase}:${startEvent.transitionIndex}`,
      treeId: startEvent.treeId || endEvent?.treeId || "",
      startUid: startEvent.uid,
      endUid: endEvent?.uid || "",
      source: "stage-and-return-marker",
      frameIndex: startEvent.frameIndex,
      firstTransitionIndex: startEvent.transitionIndex,
      lastTransitionIndex: endEvent?.transitionIndex ?? startEvent.transitionIndex,
      start: clampTime(start, firstTime, lastTime),
      end: clampTime(end, firstTime, lastTime),
      lastTickTime: clampTime(end, firstTime, lastTime),
      status: endTransition?.status || startEvent.transition.status,
      label: startEvent.phase,
      order: startEvent.transitionIndex
    });
  }

  function buildDescriptionMarkedTasks(log, firstTime, lastTime) {
    const markers = getDescriptionMarkers(log);
    if (markers.pairs.length === 0) {
      return [];
    }

    const transitionsByUid = indexTransitionsByUid(log.transitions || []);
    const tasks = [];
    markers.pairs.forEach((pair, index) => {
      const startTransitions = transitionsByUid.get(pair.start.uid) || [];
      const endTransitions = transitionsByUid.get(pair.end.uid) || [];
      if (startTransitions.length === 0 || endTransitions.length === 0) {
        return;
      }

      const startTransition = startTransitions[0];
      const endTransition = findEndTransitionAfterStart(endTransitions, startTransition) || endTransitions[endTransitions.length - 1];
      const start = Number(startTransition.tUs);
      const end = Number(endTransition.tUs);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return;
      }

      const label = pair.start.code || pair.start.text || pair.end.text;
      tasks.push({
        id: pair.code,
        treeId: pair.start.treeId || pair.end.treeId || "",
        startUid: pair.start.uid,
        endUid: pair.end.uid,
        source: "description-marker",
        frameIndex: startTransition.frameIndex,
        firstTransitionIndex: startTransition._timelineIndex,
        lastTransitionIndex: endTransition._timelineIndex,
        start: clampTime(start, firstTime, lastTime),
        end: clampTime(end, firstTime, lastTime),
        lastTickTime: clampTime(end, firstTime, lastTime),
        status: endTransition.status,
        label,
        order: index
      });
    });
    return tasks;
  }

  function getDescriptionMarkers(log) {
    const cache = runtime.playbackData.getPlaybackCache(log);
    if (cache.timelineDescriptionMarkers) {
      return cache.timelineDescriptionMarkers;
    }

    const startsByCode = new Map();
    const endsByCode = new Map();
    let order = 0;
    (log.preview?.behaviorTrees || []).forEach((tree) => {
      walkPreviewNode(tree.node, (node) => {
        const uid = node?.attributes?._uid ? String(node.attributes._uid) : "";
        if (!uid || !node.description) {
          return;
        }
        parseDescriptionMarkers(node.description).forEach((marker) => {
          const entry = {
            ...marker,
            uid,
            treeId: tree.id,
            nodePath: node.nodePath,
            nodeTitle: node.title,
            order: order++
          };
          const target = marker.kind === "s" ? startsByCode : endsByCode;
          const list = target.get(marker.code) || [];
          list.push(entry);
          target.set(marker.code, list);
        });
      });
    });

    const pairs = [];
    startsByCode.forEach((starts, code) => {
      const ends = endsByCode.get(code) || [];
      const count = Math.min(starts.length, ends.length);
      for (let index = 0; index < count; index += 1) {
        pairs.push({
          code,
          start: starts[index],
          end: ends[index],
          order: Math.min(starts[index].order, ends[index].order)
        });
      }
    });
    pairs.sort((left, right) => left.order - right.order || left.code.localeCompare(right.code));

    cache.timelineDescriptionMarkers = { pairs, startsByCode, endsByCode };
    return cache.timelineDescriptionMarkers;
  }

  function parseDescriptionMarkers(description) {
    const markers = [];
    const pattern = /(?:^|[\r\n])\s*([se])([^:：\r\n]+)\s*[:：]\s*([^\r\n]*)/gi;
    let match = pattern.exec(String(description || ""));
    while (match) {
      const code = String(match[2] || "").trim();
      if (!code) {
        match = pattern.exec(String(description || ""));
        continue;
      }
      markers.push({
        kind: match[1].toLowerCase(),
        code,
        text: String(match[3] || "").trim()
      });
      match = pattern.exec(String(description || ""));
    }
    return markers;
  }

  function buildTreeGroupedTasks(log, firstTime, lastTime) {
    const transitionsByUid = indexTransitionsByUid(log.transitions || []);
    const treeOrder = new Map((log.preview?.behaviorTrees || []).map((tree, index) => [tree.id, index]));
    const tasks = [];

    (log.preview?.behaviorTrees || []).forEach((tree) => {
      if (isTimelineEntryTree(log, tree)) {
        return;
      }
      const rootUid = getNodeUid(tree.node);
      if (!rootUid) {
        return;
      }
      const rootTransitions = transitionsByUid.get(rootUid) || [];
      if (rootTransitions.length === 0) {
        return;
      }

      appendTreeRootIdleBoundaryTasks(tasks, tree, rootUid, rootTransitions, treeOrder, firstTime, lastTime);
    });

    return tasks;
  }

  function isTimelineEntryTree(log, tree) {
    const treeId = String(tree?.id || "");
    const mainTreeId = String(log.preview?.mainTreeToExecute || "");
    if (mainTreeId && treeId === mainTreeId) {
      return true;
    }
    return /^main(?:tree)?$/i.test(treeId);
  }

  function appendTreeRootIdleBoundaryTasks(tasks, tree, rootUid, rootTransitions, treeOrder, firstTime, lastTime) {
    const treeOrderValue = treeOrder.has(tree.id) ? treeOrder.get(tree.id) : treeOrder.size;
    let activeTask = null;
    let occurrence = 0;

    rootTransitions.forEach((transition) => {
      const prevStatus = normalizeStatusName(transition.prevStatus);
      const status = normalizeStatusName(transition.status);
      const leavesIdle = status !== "IDLE" && (!activeTask || prevStatus === "IDLE");
      const entersIdle = activeTask && status === "IDLE";

      if (leavesIdle) {
        if (activeTask) {
          pushTreeRootTask(tasks, activeTask, transition, tree, rootUid, treeOrderValue, occurrence, firstTime, lastTime);
          occurrence += 1;
        }
        activeTask = {
          startTransition: transition,
          lastNonIdleTransition: transition
        };
        return;
      }

      if (activeTask && status !== "IDLE") {
        activeTask.lastNonIdleTransition = transition;
      }

      if (entersIdle) {
        pushTreeRootTask(tasks, activeTask, transition, tree, rootUid, treeOrderValue, occurrence, firstTime, lastTime);
        occurrence += 1;
        activeTask = null;
      }
    });

    if (activeTask) {
      pushTreeRootTask(tasks, activeTask, null, tree, rootUid, treeOrderValue, occurrence, firstTime, lastTime);
    }
  }

  function pushTreeRootTask(tasks, activeTask, endTransition, tree, rootUid, treeOrderValue, occurrence, firstTime, lastTime) {
    const startTransition = activeTask.startTransition;
    const statusTransition = activeTask.lastNonIdleTransition || endTransition || startTransition;
    const end = endTransition ? Number(endTransition.tUs) : lastTime;
    const start = Number(startTransition.tUs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return;
    }

    tasks.push({
      id: `${tree.id}:${occurrence}`,
      treeId: tree.id,
      rootUid,
      source: "tree-root-status",
      firstTransitionIndex: startTransition._timelineIndex,
      lastTransitionIndex: endTransition?._timelineIndex ?? statusTransition?._timelineIndex ?? startTransition._timelineIndex,
      frameIndex: startTransition.frameIndex,
      start: clampTime(start, firstTime, lastTime),
      end: clampTime(end, firstTime, lastTime),
      lastTickTime: clampTime(end, firstTime, lastTime),
      status: statusTransition?.status || endTransition?.prevStatus || startTransition.status,
      label: tree.id,
      order: treeOrderValue * 100000 + occurrence
    });
  }

  function buildSegments(log, tasks, firstTime, total, laneHeight) {
    const laneEnds = [];
    return tasks
      .sort((left, right) => left.start - right.start || left.order - right.order || left.label.localeCompare(right.label))
      .map((task) => {
        const end = Math.max(task.end, task.start);
        const leftPercent = clampNumber(((task.start - firstTime) / total) * 100, 0, 100);
        const widthPercent = clampNumber(((end - task.start) / total) * 100, MIN_SEGMENT_WIDTH_PERCENT, 100 - leftPercent);
        const visualEnd = firstTime + ((leftPercent + widthPercent) / 100) * total;
        const lane = assignTimelineLane(laneEnds, task.start, Math.max(end, visualEnd));
        return {
          ...task,
          end,
          visualEnd,
          lane,
          laneTop: lane * laneHeight,
          leftPercent,
          widthPercent,
          title: `${task.label}\n${formatTransitionTime(log, task.start)}s -> ${formatTransitionTime(log, task.lastTickTime)}s\n${task.status}`
        };
      });
  }

  function assignTimelineLane(laneEnds, start, end) {
    for (let index = 0; index < laneEnds.length; index += 1) {
      if (start >= laneEnds[index]) {
        laneEnds[index] = end;
        return index;
      }
    }
    laneEnds.push(end);
    return laneEnds.length - 1;
  }

  function indexTransitionsByUid(transitions) {
    const index = new Map();
    transitions.forEach((transition, transitionIndex) => {
      const uid = String(transition.uid);
      const list = index.get(uid) || [];
      list.push({ ...transition, _timelineIndex: transitionIndex });
      index.set(uid, list);
    });
    return index;
  }

  function getNodeUid(node) {
    return node?.attributes?._uid ? String(node.attributes._uid) : "";
  }

  function normalizeStatusName(status) {
    return String(status || "").trim().toUpperCase();
  }

  function findEndTransitionAfterStart(endTransitions, startTransition) {
    return endTransitions.find((transition) => Number(transition.tUs) >= Number(startTransition.tUs)) || null;
  }

  function getTreeIdForUid(log, uid) {
    const locations = runtime.playbackData.getPlaybackCache(log).nodeIndex.locationsByUid?.[String(uid)] || [];
    return locations[0]?.treeId || "";
  }

  function getTaskTreeIdForUid(log, uid) {
    const cache = runtime.playbackData.getPlaybackCache(log);
    if (!cache.taskTreeIdByUid) {
      cache.taskTreeIdByUid = buildTaskTreeIdByUid(log);
    }
    return cache.taskTreeIdByUid[String(uid)] || getTreeIdForUid(log, uid);
  }

  function buildTaskTreeIdByUid(log) {
    const taskTreeIdByUid = {};
    const treeMap = new Map((log.preview?.behaviorTrees || []).map((tree) => [tree.id, tree]));
    const locationsByUid = runtime.playbackData.getPlaybackCache(log).nodeIndex.locationsByUid || {};
    Object.entries(locationsByUid).forEach(([uid, locations]) => {
      const location = Array.isArray(locations) ? locations[0] : null;
      if (!location?.treeId) {
        return;
      }
      const tree = treeMap.get(location.treeId);
      const node = tree?.node ? findNodeByPath(tree.node, location.nodePath) : null;
      taskTreeIdByUid[uid] = node?.kind === "SubTree" && node.targetTreeId
        ? node.targetTreeId
        : location.treeId;
    });
    return taskTreeIdByUid;
  }

  function walkPreviewNode(node, visit) {
    if (!node) {
      return;
    }
    visit(node);
    (node.children || []).forEach((child) => walkPreviewNode(child, visit));
  }

  function findNodeByPath(rootNode, nodePath) {
    const parts = String(nodePath || "").split(".");
    if (parts.length === 0 || parts[0] !== "0") {
      return null;
    }
    let currentNode = rootNode;
    for (const part of parts.slice(1)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= currentNode.children.length) {
        return null;
      }
      currentNode = currentNode.children[index];
    }
    return currentNode;
  }

  function clampTime(value, firstTime, lastTime) {
    return clampNumber(value, firstTime, Math.max(firstTime, lastTime));
  }

  function formatTransitionTime(log, tUs) {
    const start = log.frames?.[0]?.tUs ?? 0;
    const elapsed = Math.max(0, Number(tUs) - Number(start));
    return (elapsed / 1000000).toFixed(3);
  }

  Object.assign(timelineTasks, {
    buildPlaybackDurationModel,
    getTaskTreeIdForUid
  });
})();
