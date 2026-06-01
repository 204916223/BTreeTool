(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const { clampInteger, clampNumber } = runtime.math;

  function findFrameIndexAtTime(log, tUs, fallbackFrameIndex = 0) {
    const frames = log?.frames || [];
    if (frames.length === 0) {
      return 0;
    }
    const target = Number(tUs);
    if (!Number.isFinite(target)) {
      return fallbackFrameIndex;
    }

    let left = 0;
    let right = frames.length - 1;
    let match = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const time = Number(frames[mid]?.tUs);
      if (time <= target) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    const next = Math.min(frames.length - 1, match + 1);
    const currentDelta = Math.abs(Number(frames[match]?.tUs) - target);
    const nextDelta = Math.abs(Number(frames[next]?.tUs) - target);
    return nextDelta < currentDelta ? next : match;
  }

  function findFrameIndexAtOrBeforeTime(log, tUs, fallbackFrameIndex = 0) {
    const frames = log?.frames || [];
    if (frames.length === 0) {
      return 0;
    }
    const target = Number(tUs);
    if (!Number.isFinite(target)) {
      return fallbackFrameIndex;
    }
    let left = 0;
    let right = frames.length - 1;
    let match = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const time = Number(frames[mid]?.tUs);
      if (!Number.isFinite(time) || time <= target) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return match;
  }

  function getFrameTimeUs(log, frameIndex) {
    const frames = log?.frames || [];
    const frame = frames[clampInteger(frameIndex, 0, Math.max(0, frames.length - 1))] || null;
    return Number.isFinite(Number(frame?.tUs)) ? Number(frame.tUs) : getFirstTimeUs(log);
  }

  function getFirstTimeUs(log) {
    const first = Number(log?.frames?.[0]?.tUs ?? log?.transitions?.[0]?.tUs ?? 0);
    return Number.isFinite(first) ? first : 0;
  }

  function getLastTimeUs(log) {
    const frames = log?.frames || [];
    const transitions = log?.transitions || [];
    const last = Number(
      frames[frames.length - 1]?.tUs
      ?? transitions[transitions.length - 1]?.tUs
      ?? getFirstTimeUs(log)
    );
    return Number.isFinite(last) ? last : getFirstTimeUs(log);
  }

  function clampTimeUs(log, tUs) {
    const first = getFirstTimeUs(log);
    const last = Math.max(first, getLastTimeUs(log));
    return clampNumber(Number(tUs), first, last);
  }

  runtime.playbackTime = {
    findFrameIndexAtTime,
    findFrameIndexAtOrBeforeTime,
    getFrameTimeUs,
    getFirstTimeUs,
    getLastTimeUs,
    clampTimeUs
  };
})();
