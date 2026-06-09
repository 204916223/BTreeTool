export function enrichTraceContextWithQuestionEvidence(context: string, question: string): string {
  const evidence = analyzeAsyncLogText(question);
  if (!evidence) {
    return context;
  }
  return `${context.trim()}\n\n${evidence}`;
}

type TimedLine = {
  timestamp: string;
  timeMs: number | null;
  text: string;
};

type NumericSignal = TimedLine & {
  key: string;
  value: number;
};

type ExceptionSignal = TimedLine & {
  errorId: string;
  errorName: string;
  errorDetails: string;
};

type NaviSignal = TimedLine & {
  mode: string;
  currentDist: number | null;
  prepareDist: number | null;
  obsDist: number | null;
};

type ActionSignal = TimedLine & {
  currentAction: string;
  nextAction: string;
};

const MAX_CONTEXT_LINES = 16;
const CORRELATION_WINDOW_MS = 3_000;

function analyzeAsyncLogText(input: string): string {
  const lines = parseTimedLines(input);
  if (lines.length === 0) {
    return "";
  }

  const distanceSignals = lines.map(parseDistanceSignal).filter((entry): entry is NumericSignal => Boolean(entry));
  const exceptions = lines.map(parseExceptionSignal).filter((entry): entry is ExceptionSignal => Boolean(entry));
  const naviSignals = lines.map(parseNaviSignal).filter((entry): entry is NaviSignal => Boolean(entry));
  const actionSignals = lines.map(parseActionSignal).filter((entry): entry is ActionSignal => Boolean(entry));
  const importantLines = collectImportantLines(lines);
  const distanceJumps = collectInvalidDistanceJumps(distanceSignals);

  if (
    distanceSignals.length === 0 &&
    exceptions.length === 0 &&
    naviSignals.length === 0 &&
    actionSignals.length === 0 &&
    importantLines.length === 0
  ) {
    return "";
  }

  const sections = [
    "External async log evidence from the user question:",
    `- Async log window: ${lines[0].timestamp} -> ${lines[lines.length - 1].timestamp} (${lines.length} timestamped lines).`
  ];

  const correlated = correlateDistanceJumpsWithExceptions(distanceJumps, exceptions);
  if (correlated.length > 0) {
    sections.push(...correlated);
  } else if (distanceJumps.length > 0) {
    sections.push(...distanceJumps.slice(0, 4).map(formatDistanceJump));
  }

  const lastNaviBeforeException = findLastBefore(naviSignals, exceptions[0]?.timeMs ?? null);
  if (lastNaviBeforeException) {
    sections.push(
      `- Navigation distance before exception: ${lastNaviBeforeException.timestamp} DecelerateNavi mode=${lastNaviBeforeException.mode}, current_dist=${formatNumber(lastNaviBeforeException.currentDist)}, prepare_dist=${formatNumber(lastNaviBeforeException.prepareDist)}, obs_dist=${formatNumber(lastNaviBeforeException.obsDist)}.`
    );
  }

  const firstException = exceptions[0];
  if (firstException) {
    sections.push(
      `- Async exception: ${firstException.timestamp} RaiseException ${firstException.errorId}|${firstException.errorName}|${firstException.errorDetails}.`
    );
  }

  const lastAction = actionSignals[actionSignals.length - 1];
  if (lastAction) {
    sections.push(
      `- Action context: current_action=${lastAction.currentAction}, next_action=${lastAction.nextAction}.`
    );
  }

  if (importantLines.length > 0) {
    sections.push("Important async lines:");
    sections.push(...importantLines.slice(0, MAX_CONTEXT_LINES).map((line) => `- ${line.timestamp} ${line.text}`));
  }

  sections.push(
    "Async-log reasoning rule: when a distance-like signal changes from a valid finite value to an invalid sentinel such as -99999/99999/-1 immediately before a RaiseException, treat that signal loss as the deeper cause and hand off to navigation/distance-data investigation after the behavior-tree branch is proven."
  );

  return sections.join("\n");
}

function parseTimedLines(input: string): TimedLine[] {
  return stripAnsi(input)
    .split(/\r?\n/)
    .map((line): TimedLine | null => {
      const match = line.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\]-\[(?:INFO|ERROR|WARNING|WARN|DEBUG)\]\s*(.*)/);
      if (!match) {
        return null;
      }
      const timestamp = match[1];
      return {
        timestamp,
        timeMs: Date.parse(timestamp.replace(" ", "T")),
        text: match[2].trim()
      };
    })
    .filter((entry): entry is TimedLine => Boolean(entry));
}

function parseDistanceSignal(line: TimedLine): NumericSignal | null {
  const direct = line.text.match(/\bnav_tick:(task_(?:starting|ending)_dist_data)\s+(-?\d+(?:\.\d+)?)/);
  if (direct) {
    return {
      ...line,
      key: direct[1],
      value: Number(direct[2])
    };
  }

  const navi = line.text.match(/\[DecelerateNavi RUNNING\].*\bcurrent_dist=(-?\d+(?:\.\d+)?).*?\bprepare_dist=(-?\d+(?:\.\d+)?)/);
  if (navi) {
    return {
      ...line,
      key: "DecelerateNavi.current_dist",
      value: Number(navi[1])
    };
  }

  return null;
}

function parseExceptionSignal(line: TimedLine): ExceptionSignal | null {
  const raise = line.text.match(/RaiseException:\s*([^|]+)\|[^|]*\|([^|]+)\|(.+)/);
  if (raise) {
    return {
      ...line,
      errorId: raise[1].trim(),
      errorName: raise[2].trim(),
      errorDetails: raise[3].trim()
    };
  }
  const reported = line.text.match(/Error id:\s*([^,\s]+).*?Error name:\s*([^,]+).*?Error detail:\s*(.+)/);
  if (reported) {
    return {
      ...line,
      errorId: reported[1].trim(),
      errorName: reported[2].trim(),
      errorDetails: reported[3].trim()
    };
  }
  return null;
}

function parseNaviSignal(line: TimedLine): NaviSignal | null {
  const match = line.text.match(
    /\[DecelerateNavi RUNNING\]\s*mode=([^,\s]+),\s*obs_dist=(-?\d+(?:\.\d+)?),\s*current_dist=(-?\d+(?:\.\d+)?),\s*prepare_dist=(-?\d+(?:\.\d+)?)/
  );
  if (!match) {
    return null;
  }
  return {
    ...line,
    mode: match[1],
    obsDist: Number(match[2]),
    currentDist: Number(match[3]),
    prepareDist: Number(match[4])
  };
}

function parseActionSignal(line: TimedLine): ActionSignal | null {
  const match = line.text.match(/current_action=([^,\s]+),\s*next_action=([^,\s]+)/);
  if (!match) {
    return null;
  }
  return {
    ...line,
    currentAction: match[1],
    nextAction: match[2]
  };
}

function collectInvalidDistanceJumps(signals: NumericSignal[]): Array<{ previous: NumericSignal; current: NumericSignal }> {
  const previousByKey = new Map<string, NumericSignal>();
  const jumps: Array<{ previous: NumericSignal; current: NumericSignal }> = [];

  for (const signal of signals) {
    const previous = previousByKey.get(signal.key);
    if (previous && !isInvalidDistance(previous.value) && isInvalidDistance(signal.value)) {
      jumps.push({ previous, current: signal });
    }
    previousByKey.set(signal.key, signal);
  }

  return jumps;
}

function correlateDistanceJumpsWithExceptions(
  jumps: Array<{ previous: NumericSignal; current: NumericSignal }>,
  exceptions: ExceptionSignal[]
): string[] {
  const lines: string[] = [];
  for (const jump of jumps.slice(0, 4)) {
    const exception = exceptions.find((entry) => isWithinWindow(jump.current.timeMs, entry.timeMs, CORRELATION_WINDOW_MS));
    if (!exception) {
      continue;
    }
    lines.push(
      `${formatDistanceJump(jump)} It occurred ${formatDeltaMs(jump.current.timeMs, exception.timeMs)} before RaiseException ${exception.errorId}.`
    );
  }
  return lines;
}

function formatDistanceJump(jump: { previous: NumericSignal; current: NumericSignal }): string {
  return `- Distance signal invalidated: ${jump.current.timestamp} ${jump.current.key} changed ${jump.previous.value} -> ${jump.current.value}.`;
}

function collectImportantLines(lines: TimedLine[]): TimedLine[] {
  const patterns = [
    /task_(?:starting|ending)_dist_data/,
    /DecelerateNavi RUNNING/,
    /lift height check node/,
    /RaiseException/,
    /Error id:/,
    /行为树报错/,
    /current_action=.*next_action=/,
    /NavStop/,
    /载具控制/
  ];
  return lines.filter((line) => patterns.some((pattern) => pattern.test(line.text)));
}

function findLastBefore<T extends TimedLine>(entries: T[], timeMs: number | null): T | null {
  if (entries.length === 0) {
    return null;
  }
  if (timeMs === null || Number.isNaN(timeMs)) {
    return entries[entries.length - 1];
  }
  let match: T | null = null;
  for (const entry of entries) {
    if (entry.timeMs !== null && entry.timeMs <= timeMs) {
      match = entry;
    }
  }
  return match;
}

function isInvalidDistance(value: number): boolean {
  return value === -1 || value <= -9999 || value >= 9999;
}

function isWithinWindow(left: number | null, right: number | null, windowMs: number): boolean {
  if (left === null || right === null || Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }
  return Math.abs(right - left) <= windowMs;
}

function formatDeltaMs(left: number | null, right: number | null): string {
  if (left === null || right === null || Number.isNaN(left) || Number.isNaN(right)) {
    return "shortly";
  }
  return `${Math.max(0, right - left)} ms`;
}

function formatNumber(value: number | null): string {
  return value === null || Number.isNaN(value) ? "unknown" : String(value);
}

function stripAnsi(value: string): string {
  return String(value || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
