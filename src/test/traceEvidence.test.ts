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

test("enrichTraceContextWithQuestionEvidence explains NavStatus data zero before unload", () => {
  const context = "Current btlog context.";
  const question = `
[2026-06-10 09:22:10.280]-[INFO] fork_height: 0 dist_to_target = 0.208 dist_to_start = 14.877 (main.cpp:903)
[2026-06-10 09:22:11.035]-[INFO] Call /jz_nav/get_status. (navStatus.h:32)
[2026-06-10 09:22:11.037]-[INFO] Call /jz_nav/get_status, success=1, data=0 (navStatus.h:36)
[2026-06-10 09:22:11.037]-[INFO] NavStop successed! (navStatus.h:41)
[2026-06-10 09:22:11.037]-[INFO] [载具控制] id:1,指令:22 目标位置:0.683388 最大速度: 0.000000 (carrierCtrlNode.h:178)
[2026-06-10 09:22:23.939]-[INFO] LoadRelease tick (loadRelease.h:121)
`;

  const enriched = enrichTraceContextWithQuestionEvidence(context, question);

  assert.match(enriched, /Navigation task status: 2026-06-10 09:22:11\.037/);
  assert.match(enriched, /data=0 means no live navigation task/);
  assert.match(enriched, /do not treat NavStatus or "NavStop successed!" as proof of arrival/);
  assert.match(enriched, /Unload-position reasoning rule/);
  assert.match(enriched, /navigation task was stopped\/not alive while close to the target/);
});

test("enrichTraceContextWithQuestionEvidence leaves context unchanged without async log evidence", () => {
  const context = "Current btlog context.";
  assert.equal(enrichTraceContextWithQuestionEvidence(context, "why did it fail?"), context);
});
