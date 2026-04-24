import test from "node:test";
import assert from "node:assert/strict";
import { parsePlaybackLogText } from "../core/playbackLog";

test("parsePlaybackLogText accepts json arrays with nested blackboard data", () => {
  const result = parsePlaybackLogText(
    JSON.stringify([
      {
        timestamp: 1752136427695639,
        node_uid: 5,
        node_name: "SequenceWithMemory",
        status: "RUNNING",
        blackboard_data: {
          MainTree: {
            dist_to_target: 10,
            servo_status: -1
          }
        }
      },
      {
        timestamp: 1752136427745639,
        node_uid: 5,
        node_name: "SequenceWithMemory",
        status: "SUCCESS",
        blackboard_data: {
          MainTree: {
            dist_to_target: 0
          }
        }
      }
    ]),
    "sample.json"
  );

  assert.equal(result.fileName, "sample.json");
  assert.equal(result.frameCount, 2);
  assert.equal(result.frames[0].nodeUid, "5");
  assert.equal(result.frames[0].status, "RUNNING");
  assert.deepEqual(result.frames[0].blackboardData.MainTree, {
    dist_to_target: 10,
    servo_status: -1
  });
  assert.equal(result.frames[1].offsetMs, 50);
});

test("parsePlaybackLogText accepts jsonl with flat blackboard fields", () => {
  const result = parsePlaybackLogText(
    [
      '{"timestamp":1756804702,"node_uid":"123","node_name":"NavigateToTarget","status":"RUNNING","dist_to_target":5.2}',
      'INFO payload {"timestamp":1756804703,"node_uid":"123","node_name":"NavigateToTarget","status":"FAILURE","servo_cancel_flag":true}'
    ].join("\n")
  );

  assert.equal(result.frameCount, 2);
  assert.equal(result.frames[0].offsetMs, 0);
  assert.equal(result.frames[1].offsetMs, 1000);
  assert.deepEqual(result.frames[0].blackboardData, {
    dist_to_target: 5.2
  });
  assert.deepEqual(result.frames[1].blackboardData, {
    servo_cancel_flag: true
  });
});

test("parsePlaybackLogText strips ANSI color codes from status values", () => {
  const result = parsePlaybackLogText(
    '{"timestamp":1756804702,"node_uid":"123","node_name":"NavigateToTarget","status":"\\u001b[33mRUNNING\\u001b[0m"}'
  );

  assert.equal(result.frames[0].status, "RUNNING");
});
