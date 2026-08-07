import { describe, expect, it } from "vitest";

import {
  computeBranchReconciliationPlan,
  type ActiveDefinitionRow,
  type ExistingRunModuleRow,
  type RunModuleStatus,
} from "./reconcile-run-modules.js";

const BRANCH_ID = "branch-1";
const PROGRAM_VERSION_ID = "program-version-1";

function def(id: string, sequenceIndex: number, moduleKey = id, title = `Title ${id}`): ActiveDefinitionRow {
  return { id, moduleKey, title, sequenceIndex };
}

function existing(
  id: string,
  moduleDefinitionId: string,
  sequenceIndex: number,
  status: RunModuleStatus,
  titleSnapshot = `Title ${moduleDefinitionId}`,
): ExistingRunModuleRow {
  return { id, moduleDefinitionId, titleSnapshot, sequenceIndex, status };
}

function plan(activeDefs: ActiveDefinitionRow[], current: ExistingRunModuleRow[]) {
  return computeBranchReconciliationPlan(BRANCH_ID, PROGRAM_VERSION_ID, activeDefs, current);
}

describe("computeBranchReconciliationPlan", () => {
  it("is empty when the Run already matches the active chain exactly", () => {
    const activeDefs = [def("d1", 1), def("d2", 2)];
    const current = [existing("r1", "d1", 1, "completed"), existing("r2", "d2", 2, "available")];
    const result = plan(activeDefs, current);
    expect(result.isEmpty).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.promotions).toEqual([]);
  });

  it("inserts a single missing Module as available when its predecessor is completed", () => {
    const activeDefs = [def("d1", 1), def("d2", 2)];
    const current = [existing("r1", "d1", 1, "completed")];
    const result = plan(activeDefs, current);
    expect(result.isEmpty).toBe(false);
    expect(result.missing).toEqual([
      { moduleDefinitionId: "d2", moduleKey: "d2", title: "Title d2", finalSequenceIndex: 2, status: "available" },
    ]);
  });

  it("inserts a single missing Module as locked when its predecessor is not completed/inherited", () => {
    const activeDefs = [def("d1", 1), def("d2", 2)];
    const current = [existing("r1", "d1", 1, "available")];
    const result = plan(activeDefs, current);
    expect(result.missing[0]!.status).toBe("locked");
  });

  it("has no predecessor for the first Module — always inserted as available", () => {
    const activeDefs = [def("d1", 1)];
    const result = plan(activeDefs, []);
    expect(result.missing).toEqual([
      { moduleDefinitionId: "d1", moduleKey: "d1", title: "Title d1", finalSequenceIndex: 1, status: "available" },
    ]);
  });

  it("two consecutive missing Modules: first available, second locked — computed in a single pass", () => {
    const activeDefs = [def("d1", 1), def("d2", 2), def("d3", 3), def("d4", 4)];
    const current = [existing("r1", "d1", 1, "completed"), existing("r4", "d4", 4, "locked")];
    const result = plan(activeDefs, current);

    const m2 = result.missing.find((row) => row.moduleDefinitionId === "d2")!;
    const m3 = result.missing.find((row) => row.moduleDefinitionId === "d3")!;
    expect(m2.status).toBe("available");
    expect(m3.status).toBe("locked");
    // d4 was already locked and its predecessor (d3, freshly inserted as
    // locked) does not allow access — must NOT be promoted.
    expect(result.promotions).toEqual([]);
  });

  it("promotes a locked Module whose predecessor is completed (repair)", () => {
    const activeDefs = [def("d1", 1), def("d2", 2)];
    const current = [existing("r1", "d1", 1, "completed"), existing("r2", "d2", 2, "locked")];
    const result = plan(activeDefs, current);
    expect(result.promotions).toEqual(["r2"]);
  });

  it("promotes a locked Module whose predecessor is inherited (repair)", () => {
    const activeDefs = [def("d1", 1), def("d2", 2)];
    const current = [existing("r1", "d1", 1, "inherited"), existing("r2", "d2", 2, "locked")];
    const result = plan(activeDefs, current);
    expect(result.promotions).toEqual(["r2"]);
  });

  it("promotes the new chain head when the former first Module is archived (no predecessor at all)", () => {
    // d1 no longer active (archived out of module_definitions) — the
    // active chain now starts at d2. The Run still has a row for the old
    // d1 (now an orphan) and d2 was previously locked behind it.
    const activeDefs = [def("d2", 2)];
    const current = [existing("r1", "orphan-def", 1, "locked"), existing("r2", "d2", 2, "locked")];
    const result = plan(activeDefs, current);
    expect(result.promotions).toEqual(["r2"]);
    expect(result.orphanedIds).toEqual(["r1"]);
  });

  it("never relocks an existing non-locked row, regardless of predecessor (monotonic access)", () => {
    // Insert a brand new Module between d1 (completed) and d2, which was
    // already available/in_progress/completed from before the insertion.
    for (const priorStatus of ["available", "in_progress", "ready_to_unlock", "completed"] as const) {
      const activeDefs = [def("d1", 1), def("dNew", 2), def("d2", 3)];
      const current = [existing("r1", "d1", 1, "completed"), existing("r2", "d2", 3, priorStatus)];
      const result = plan(activeDefs, current);
      // dNew is inserted locked (predecessor d1 completed -> actually d1
      // is completed so dNew becomes available); regardless, r2's status
      // must never be touched — it's not in promotions and no status
      // field for it appears anywhere in the plan.
      expect(result.promotions).not.toContain("r2");
    }
  });

  it("archiving a Module frees its sequence_index for a promoted sibling in the same plan", () => {
    // Previously: d1(seq1) d2(seq2, now archived/orphan) d3(seq3). Content
    // now has d1(seq1) d3(seq2) — d3 moved into d2's old slot.
    const activeDefs = [def("d1", 1), def("d3", 2)];
    const current = [
      existing("r1", "d1", 1, "completed"),
      existing("r2", "orphan-def", 2, "completed"),
      existing("r3", "d3", 3, "locked"),
    ];
    const result = plan(activeDefs, current);

    expect(result.orphanedIds).toEqual(["r2"]);
    const d3Update = result.sequenceUpdates.find((row) => row.id === "r3");
    expect(d3Update).toEqual({ id: "r3", finalSequenceIndex: 2 });
    // r2 (orphan) must move out of the way — activeMaxSequence is 2, so it
    // lands at 3.
    const orphanUpdate = result.sequenceUpdates.find((row) => row.id === "r2");
    expect(orphanUpdate).toEqual({ id: "r2", finalSequenceIndex: 3 });
    expect(result.promotions).toEqual(["r3"]); // d1 completed -> d3 promoted
  });

  it("orphans preserve their relative order among themselves when pushed to the tail", () => {
    // d1's real desired position (per module_definitions.sequenceIndex) is
    // 5 — e.g. after earlier archival churn — but it's currently sitting
    // at Run position 1, ahead of both orphans. Moving it to 5 forces both
    // orphans to move too; they must land after it, in their own original
    // relative order (rA before rB, since 1 < 2).
    const activeDefs = [def("d1", 5)];
    const current = [
      existing("rA", "orphan-a", 1, "completed"),
      existing("rB", "orphan-b", 2, "completed"),
      existing("r1", "d1", 3, "completed"),
    ];
    const result = plan(activeDefs, current);
    expect(result.isEmpty).toBe(false);

    const seqById = new Map(result.sequenceUpdates.map((row) => [row.id, row.finalSequenceIndex]));
    expect(seqById.get("r1")).toBe(5); // d1 moves to its real desired position
    expect(seqById.get("rA")).toBe(6); // activeMax(5) + 1
    expect(seqById.get("rB")).toBe(7); // activeMax(5) + 2 — still after rA
  });

  it("always renumbers orphans to sit consecutively right after the active max, even if they were already past it", () => {
    // rO already sits at 5, safely past d1's only active position (1) —
    // this still normalizes it to activeMax+1 rather than leaving a gap,
    // which keeps the renumbering rule (and its offset-overflow guard)
    // simple and independent of how far out of the way an orphan
    // happened to already be.
    const activeDefs = [def("d1", 1)];
    const current = [existing("r1", "d1", 1, "completed"), existing("rO", "orphan", 5, "locked")];
    const result = plan(activeDefs, current);
    expect(result.isEmpty).toBe(false);
    expect(result.orphanedIds).toEqual(["rO"]);
    expect(result.sequenceUpdates).toEqual([{ id: "rO", finalSequenceIndex: 2 }]);
  });

  it("computes an offset that clears every desired final sequence_index", () => {
    const activeDefs = [def("d1", 2), def("d2", 1)]; // swapped vs. current
    const current = [existing("r1", "d1", 1, "completed"), existing("r2", "d2", 2, "available")];
    const result = plan(activeDefs, current);
    expect(result.offset).toBeGreaterThan(2);
  });
});
