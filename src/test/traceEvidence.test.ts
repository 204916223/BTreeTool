import test from "node:test";
import assert from "node:assert/strict";
import { enrichTraceContextWithQuestionEvidence } from "../traceEvidence";

test("enrichTraceContextWithQuestionEvidence extracts async distance invalidation before RaiseException", () => {
  const context = "Current btlog context.";
  const question = `
[2026-06-09 11:18:00.911]-[INFO] nav_tick:task_starting_dist_data 2.025 (topicBase.h:70)
[2026-06-09 11:18:00.939]-[INFO] [DecelerateNavi RUNNING] mode=out, obs_dist=0.085, current_dist=2.025, prepare_dist=2.11, in_tolerance=false (DecelerateNavi.h:335)
[2026-06-09 11:18:01.153]-[INFO] lift height check node end,rtn=:true (liftHeightCheckNode.h:216)
[2026-06-09 11:18:01.153]-[INFO] nav_tick:task_starting_dist_data -99999 (topicBase.h:70)
[2026-06-09 11:18:01.154]-[ERROR] RaiseException: 603011|5|error/position/fork_abnormal_before_ready_point|未到准备点，叉齿位置异常 (dummy_nodes.h:102)
[2026-06-09 11:18:01.194]-[INFO] 当前任务和下一个任务是同一个任务，不触发强制停障, current_action=bt-unload-堆高, next_action=bt-unload-堆高 (forceStop.h:161)
`;

  const enriched = enrichTraceContextWithQuestionEvidence(context, question);

  assert.match(enriched, /Attached async log evidence was analyzed/);
  assert.match(enriched, /task_starting_dist_data changed 2\.025 -> -99999/);
  assert.match(enriched, /RaiseException 603011/);
  assert.match(enriched, /error\/position\/fork_abnormal_before_ready_point/);
  assert.match(enriched, /current_action=bt-unload-堆高, next_action=bt-unload-堆高/);
  assert.match(enriched, /invalid sentinel/);
});

test("enrichTraceContextWithQuestionEvidence prefers async lines near the primary exception", () => {
  const context = "Current btlog context.";
  const earlyNoise = Array.from({ length: 30 }, (_, index) =>
    `[2026-06-09 10:00:${String(index).padStart(2, "0")}.000]-[INFO] nav_tick:task_starting_dist_data ${index} (topicBase.h:70)`
  ).join("\n");
  const question = `
${earlyNoise}
[2026-06-09 11:18:00.911]-[INFO] nav_tick:task_starting_dist_data 2.025 (topicBase.h:70)
[2026-06-09 11:18:01.153]-[INFO] nav_tick:task_starting_dist_data -99999 (topicBase.h:70)
[2026-06-09 11:18:01.154]-[ERROR] RaiseException: 603011|5|error/position/fork_abnormal_before_ready_point|未到准备点，叉齿位置异常 (dummy_nodes.h:102)
`;

  const enriched = enrichTraceContextWithQuestionEvidence(context, question);

  assert.match(enriched, /Important async lines near the primary exception/);
  assert.match(enriched, /2026-06-09 11:18:01\.153 nav_tick:task_starting_dist_data -99999/);
  assert.doesNotMatch(enriched, /2026-06-09 10:00:00\.000 nav_tick/);
});

test("enrichTraceContextWithQuestionEvidence falls back to raw attached async excerpt near exception", () => {
  const context = "Current btlog context.";
  const earlyNoise = Array.from({ length: 30 }, (_, index) => `nav_tick:task_starting_dist_data ${index}`).join("\n");
  const question = `
${earlyNoise}
nav_tick:task_starting_dist_data 2.025
nav_tick:task_starting_dist_data -99999
RaiseException: 603011|5|error/position/fork_abnormal_before_ready_point|未到准备点，叉齿位置异常
`;

  const enriched = enrichTraceContextWithQuestionEvidence(context, question);

  assert.match(enriched, /Attached async log evidence was available, but only a raw excerpt could be parsed/);
  assert.match(enriched, /task_starting_dist_data -99999/);
  assert.match(enriched, /RaiseException: 603011/);
  assert.doesNotMatch(enriched, /nav_tick:task_starting_dist_data 0/);
});

test("enrichTraceContextWithQuestionEvidence leaves context unchanged without async log evidence", () => {
  const context = "Current btlog context.";
  assert.equal(enrichTraceContextWithQuestionEvidence(context, "why did it fail?"), context);
});
