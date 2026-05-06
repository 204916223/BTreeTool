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

test("parsePlaybackLogText accepts async replay jsonl events with blackboard patches", () => {
  const result = parsePlaybackLogText(
    [
      '{"type":"tree_snapshot","tree_name":"bt-chsf","xml_hash":"fnv1a64:abc","xml":"<root/>"}',
      '{"type":"blackboard_snapshot","t":1000,"values":{"MainTree":{"dist_to_target":10,"errorMsg":null}}}',
      '{"type":"node_status","t":1000,"uid":1,"name":"Sequence","status":"RUNNING","duration":0}',
      '{"type":"blackboard_patch","t":1100,"patch":[{"op":"replace","path":"/MainTree/dist_to_target","value":9.5},{"op":"remove","path":"/MainTree/errorMsg"}]}',
      '{"type":"node_status","t":1100,"uid":2,"name":"GetGoalDist","status":"SUCCESS","duration":100}'
    ].join("\n")
  );

  assert.equal(result.treeName, "bt-chsf");
  assert.equal(result.treeXml, "<root/>");
  assert.equal(result.xmlHash, "fnv1a64:abc");
  assert.equal(result.frameCount, 2);
  assert.deepEqual(result.frames[0].blackboardData, {
    MainTree: {
      dist_to_target: 10,
      errorMsg: null
    }
  });
  assert.deepEqual(result.frames[1].blackboardData, {
    MainTree: {
      dist_to_target: 9.5
    }
  });
});

test("parsePlaybackLogText accepts legacy pipe btree logs", () => {
  const result = parsePlaybackLogText(
    [
      '1776667848330902|1|Sequence|0|RUNNING|',
      '1776667848475371|5|GetGoalDist|144469|SUCCESS|{"MainTree":{"dist_to_target":8}}'
    ].join("\n")
  );

  assert.equal(result.frameCount, 2);
  assert.equal(result.frames[0].nodeName, "Sequence");
  assert.equal(result.frames[1].nodeUid, "5");
  assert.deepEqual(result.frames[1].blackboardData, {
    MainTree: {
      dist_to_target: 8
    }
  });
});
