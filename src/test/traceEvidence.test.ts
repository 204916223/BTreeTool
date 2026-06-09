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

  assert.match(enriched, /External async log evidence/);
  assert.match(enriched, /task_starting_dist_data changed 2\.025 -> -99999/);
  assert.match(enriched, /RaiseException 603011/);
  assert.match(enriched, /error\/position\/fork_abnormal_before_ready_point/);
  assert.match(enriched, /current_action=bt-unload-堆高, next_action=bt-unload-堆高/);
  assert.match(enriched, /invalid sentinel/);
});

test("enrichTraceContextWithQuestionEvidence leaves context unchanged without async log evidence", () => {
  const context = "Current btlog context.";
  assert.equal(enrichTraceContextWithQuestionEvidence(context, "why did it fail?"), context);
});
