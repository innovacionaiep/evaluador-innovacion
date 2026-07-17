import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultBulkEvaluationConfig,
  mergeBulkEvaluationConfig,
} from "@/lib/bulk-evaluation-config";

describe("bulk-evaluation-config", () => {
  it("defaults incluyen índice local activo", () => {
    const d = defaultBulkEvaluationConfig();
    assert.equal(d.parallelProjects, 2);
    assert.equal(d.maxConcurrentLlm, 5);
    assert.equal(d.useClientKnowledgeIndex, true);
    assert.equal(d.preloadKnowledgeOnBulkStart, true);
  });

  it("parallelProjects se acota entre 1 y 10", () => {
    const merged = mergeBulkEvaluationConfig({ parallelProjects: 99 });
    assert.equal(merged.parallelProjects, 10);
  });

  it("maxConcurrentLlm se acota entre 1 y 10", () => {
    assert.equal(mergeBulkEvaluationConfig({ maxConcurrentLlm: 99 }).maxConcurrentLlm, 10);
    assert.equal(mergeBulkEvaluationConfig({ maxConcurrentLlm: 0 }).maxConcurrentLlm, 1);
  });
});
