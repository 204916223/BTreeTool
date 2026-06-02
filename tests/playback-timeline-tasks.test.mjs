import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

test("playback timeline tasks prefer StageAndReturn phase event markers", () => {
  const runtime = loadPlaybackTimelineTasksRuntime();
  const log = {
    frames: [
      { index: 0, tUs: 1_000, wallUs: 1_000 },
      { index: 1, tUs: 5_000, wallUs: 5_000 },
      { index: 2, tUs: 9_000, wallUs: 9_000 }
    ],
    transitions: [
      { frameIndex: 0, tUs: 2_000, uid: 31, status: "SUCCESS" },
      { frameIndex: 0, tUs: 3_000, uid: 33, status: "SUCCESS" },
      { frameIndex: 1, tUs: 4_000, uid: 34, status: "SUCCESS" },
      { frameIndex: 2, tUs: 7_000, uid: 32, status: "SUCCESS" }
    ],
    preview: {
      behaviorTrees: [
        {
          id: "Main",
          node: {
            title: "Sequence",
            kind: "Sequence",
            nodePath: "0",
            attributes: { _uid: "10" },
            description: "",
            children: [
              createStageAndReturnNode("0.0", "31", "库位取货", "start"),
              createStageAndReturnNode("0.1", "33", "孤立结束", "e"),
              createStageAndReturnNode("0.2", "34", "未闭合阶段", "s"),
              createStageAndReturnNode("0.3", "32", "库位取货", "end")
            ]
          }
        }
      ]
    }
  };

  const model = runtime.playbackTimelineTasks.buildPlaybackDurationModel(log, {
    laneHeight: 40,
    blockHeight: 30
  });

  assert.equal(model.taskRuleId, 10);
  assert.equal(model.taskRuleName, "stage-and-return-marker");
  assert.equal(model.segments.length, 2);
  assert.equal(
    JSON.stringify(model.segments.map((segment) => [segment.source, segment.label, segment.start, segment.end])),
    JSON.stringify([
      ["stage-and-return-marker", "库位取货", 2_000, 7_000],
      ["stage-and-return-marker", "未闭合阶段", 4_000, 9_000]
    ])
  );
});

test("playback timeline tasks prefer paired Description s/e markers", () => {
  const runtime = loadPlaybackTimelineTasksRuntime();
  const log = {
    frames: [
      { index: 0, tUs: 1_000, wallUs: 1_000 },
      { index: 1, tUs: 5_000, wallUs: 5_000 },
      { index: 2, tUs: 9_000, wallUs: 9_000 }
    ],
    transitions: [
      { frameIndex: 0, tUs: 2_000, uid: 11, status: "RUNNING", durationUs: 50_000_000 },
      { frameIndex: 1, tUs: 7_000, uid: 12, status: "SUCCESS", durationUs: 50_000_000 }
    ],
    preview: {
      behaviorTrees: [
        {
          id: "Main",
          node: {
            title: "Sequence",
            kind: "Sequence",
            nodePath: "0",
            attributes: { _uid: "10" },
            description: "",
            children: [
              {
                title: "StartTask",
                kind: "Action",
                nodePath: "0.0",
                attributes: { _uid: "11" },
                description: "s伺服:执行该节点时开始搬运",
                children: []
              },
              {
                title: "EndTask",
                kind: "Action",
                nodePath: "0.1",
                attributes: { _uid: "12" },
                description: "e伺服:执行该节点时结束搬运",
                children: []
              }
            ]
          }
        }
      ]
    }
  };

  const model = runtime.playbackTimelineTasks.buildPlaybackDurationModel(log, {
    laneHeight: 40,
    blockHeight: 30
  });

  assert.equal(model.firstTime, 1_000);
  assert.equal(model.total, 8_000);
  assert.equal(model.taskRuleId, 15);
  assert.equal(model.taskRuleName, "description-marker");
  assert.equal(model.segments.length, 1);
  assert.equal(model.segments[0].source, "description-marker");
  assert.equal(model.segments[0].id, "伺服");
  assert.equal(model.segments[0].label, "伺服");
  assert.equal(model.segments[0].start, 2_000);
  assert.equal(model.segments[0].end, 7_000);
});

test("playback timeline tasks fall back to behavior tree root status pairs", () => {
  const runtime = loadPlaybackTimelineTasksRuntime();
  const log = {
    frames: [
      { index: 0, tUs: 1_000, wallUs: 1_000 },
      { index: 1, tUs: 5_000, wallUs: 5_000 },
      { index: 2, tUs: 7_000, wallUs: 7_000 },
      { index: 3, tUs: 10_000, wallUs: 10_000 },
      { index: 4, tUs: 12_000, wallUs: 12_000 },
      { index: 5, tUs: 15_000, wallUs: 15_000 }
    ],
    transitions: [
      { frameIndex: 0, tUs: 1_000, uid: 10, prevStatus: "IDLE", status: "RUNNING" },
      { frameIndex: 0, tUs: 1_000, uid: 20, prevStatus: "IDLE", status: "RUNNING" },
      { frameIndex: 1, tUs: 5_000, uid: 20, prevStatus: "RUNNING", status: "SUCCESS" },
      { frameIndex: 2, tUs: 7_000, uid: 20, prevStatus: "SUCCESS", status: "IDLE" },
      { frameIndex: 3, tUs: 10_000, uid: 20, prevStatus: "IDLE", status: "RUNNING" },
      { frameIndex: 4, tUs: 12_000, uid: 20, prevStatus: "RUNNING", status: "IDLE" },
      { frameIndex: 5, tUs: 15_000, uid: 10, prevStatus: "RUNNING", status: "IDLE" }
    ],
    preview: {
      mainTreeToExecute: "MainTree",
      behaviorTrees: [
        {
          id: "MainTree",
          node: {
            title: "Sequence",
            kind: "Sequence",
            nodePath: "0",
            attributes: { _uid: "10" },
            description: "",
            children: []
          }
        },
        {
          id: "EnterCarrierCtrl",
          node: {
            title: "SequenceWithMemory",
            kind: "SequenceWithMemory",
            nodePath: "0",
            attributes: { _uid: "20" },
            description: "",
            children: [
              {
                title: "Script",
                kind: "Script",
                nodePath: "0.0",
                attributes: { _uid: "21" },
                description: "表示当前运行阶段为入库阶段",
                children: []
              }
            ]
          }
        }
      ]
    }
  };

  const model = runtime.playbackTimelineTasks.buildPlaybackDurationModel(log, {
    laneHeight: 40,
    blockHeight: 30
  });

  assert.equal(model.taskRuleId, 20);
  assert.equal(model.taskRuleName, "tree-root-status");
  assert.equal(model.segments.length, 2);
  assert.equal(
    JSON.stringify(model.segments.map((segment) => [segment.source, segment.treeId, segment.start, segment.end, segment.status])),
    JSON.stringify([
      ["tree-root-status", "EnterCarrierCtrl", 1_000, 7_000, "SUCCESS"],
      ["tree-root-status", "EnterCarrierCtrl", 10_000, 12_000, "RUNNING"]
    ])
  );
});

test("playback timeline tasks reserve lanes for minimum visual width", () => {
  const runtime = loadPlaybackTimelineTasksRuntime();
  const log = {
    frames: [
      { index: 0, tUs: 0, wallUs: 0 },
      { index: 1, tUs: 1_000, wallUs: 1_000 },
      { index: 2, tUs: 1_001, wallUs: 1_001 },
      { index: 3, tUs: 1_002, wallUs: 1_002 },
      { index: 4, tUs: 5_000, wallUs: 5_000 },
      { index: 5, tUs: 10_000, wallUs: 10_000 }
    ],
    transitions: [
      { frameIndex: 0, tUs: 0, uid: 10, prevStatus: "IDLE", status: "RUNNING" },
      { frameIndex: 1, tUs: 1_000, uid: 20, prevStatus: "IDLE", status: "RUNNING" },
      { frameIndex: 2, tUs: 1_001, uid: 20, prevStatus: "RUNNING", status: "IDLE" },
      { frameIndex: 3, tUs: 1_002, uid: 30, prevStatus: "IDLE", status: "RUNNING" },
      { frameIndex: 4, tUs: 5_000, uid: 30, prevStatus: "RUNNING", status: "IDLE" },
      { frameIndex: 5, tUs: 10_000, uid: 10, prevStatus: "RUNNING", status: "IDLE" }
    ],
    preview: {
      mainTreeToExecute: "MainTree",
      behaviorTrees: [
        {
          id: "MainTree",
          node: {
            title: "Sequence",
            kind: "Sequence",
            nodePath: "0",
            attributes: { _uid: "10" },
            description: "",
            children: []
          }
        },
        {
          id: "ShortTask",
          node: {
            title: "Action",
            kind: "Action",
            nodePath: "0",
            attributes: { _uid: "20" },
            description: "",
            children: []
          }
        },
        {
          id: "LongTask",
          node: {
            title: "Action",
            kind: "Action",
            nodePath: "0",
            attributes: { _uid: "30" },
            description: "",
            children: []
          }
        }
      ]
    }
  };

  const model = runtime.playbackTimelineTasks.buildPlaybackDurationModel(log, {
    laneHeight: 40,
    blockHeight: 30
  });
  const shortTask = model.segments.find((segment) => segment.label === "ShortTask");
  const longTask = model.segments.find((segment) => segment.label === "LongTask");

  assert.notEqual(shortTask.lane, longTask.lane);
  assert.ok(shortTask.visualEnd > longTask.start);
});

function loadPlaybackTimelineTasksRuntime() {
  const runtime = {
    playbackData: {
      getPlaybackCache(log) {
        if (!log.__cache) {
          log.__cache = {
            nodeIndex: {
              locationsByUid: {},
              depthByUid: {}
            }
          };
        }
        return log.__cache;
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    }
  };
  const mathScriptPath = path.resolve("media/runtime/shared/math.js");
  vm.runInNewContext(fs.readFileSync(mathScriptPath, "utf8"), context, { filename: mathScriptPath });
  const scriptPath = path.resolve("media/runtime/playback/playback-timeline-tasks.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
}

function createStageAndReturnNode(nodePath, uid, phase, event) {
  return {
    title: "StageAndReturn",
    kind: "StageAndReturn",
    nodePath,
    attributes: {
      _uid: uid,
      phase,
      event,
      return_status: "SUCCESS"
    },
    description: "",
    children: []
  };
}
