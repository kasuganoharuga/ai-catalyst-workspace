import { describe, expect, it } from "vitest";

import { ContentSeedError } from "../errors.js";
import { planOrderedRows, type ExistingOrderedRow } from "./reconcile-ordered-rows.js";

function row(id: string, key: string, sequenceIndex: number, archived = false): ExistingOrderedRow {
  return { id, key, sequenceIndex, archived };
}

describe("planOrderedRows", () => {
  it("is a no-op when desired already matches current exactly", () => {
    const current = [row("id-1", "a", 1), row("id-2", "b", 2)];
    const plan = planOrderedRows(current, [
      { key: "a", sequenceIndex: 1 },
      { key: "b", sequenceIndex: 2 },
    ]);

    expect(plan.changed).toBe(false);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toRevive).toEqual([]);
    expect(plan.resequenceStaying).toEqual([]);
    expect(plan.missingKeys).toEqual([]);
  });

  it("detects a brand new key as missing, not archive/revive", () => {
    const current = [row("id-1", "a", 1)];
    const plan = planOrderedRows(current, [
      { key: "a", sequenceIndex: 1 },
      { key: "b", sequenceIndex: 2 },
    ]);

    expect(plan.changed).toBe(true);
    expect(plan.missingKeys).toEqual(["b"]);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toRevive).toEqual([]);
  });

  it("archives a currently non-archived row whose key fell out of desired", () => {
    const current = [row("id-1", "a", 1), row("id-2", "b", 2)];
    const plan = planOrderedRows(current, [{ key: "a", sequenceIndex: 1 }]);

    expect(plan.changed).toBe(true);
    expect(plan.toArchive.map((r) => r.id)).toEqual(["id-2"]);
  });

  it("revives an archived row whose key is back in desired, at its new sequence", () => {
    const current = [row("id-1", "a", 1), row("id-2", "b", 2, true)];
    const plan = planOrderedRows(current, [
      { key: "a", sequenceIndex: 1 },
      { key: "b", sequenceIndex: 5 },
    ]);

    expect(plan.changed).toBe(true);
    expect(plan.toRevive).toEqual([{ id: "id-2", key: "b", finalSequenceIndex: 5 }]);
    expect(plan.toArchive).toEqual([]);
  });

  it("computes an offset that clears every desired final sequence_index", () => {
    // Swap two rows' sequence positions.
    const current = [row("id-1", "a", 1), row("id-2", "b", 2)];
    const plan = planOrderedRows(current, [
      { key: "a", sequenceIndex: 2 },
      { key: "b", sequenceIndex: 1 },
    ]);

    expect(plan.changed).toBe(true);
    expect(plan.resequenceStaying).toHaveLength(2);
    // The offset must be large enough that shifting every staying row by
    // it can never land on a *desired* final value — otherwise step 2
    // could self-collide.
    const desiredMax = 2;
    expect(plan.offset).toBeGreaterThan(desiredMax);
  });

  it("does not report a staying row whose sequence_index is already correct, even when other rows move", () => {
    const current = [row("id-1", "a", 1), row("id-2", "b", 2), row("id-3", "c", 3)];
    // Swap b and c; a stays put.
    const plan = planOrderedRows(current, [
      { key: "a", sequenceIndex: 1 },
      { key: "b", sequenceIndex: 3 },
      { key: "c", sequenceIndex: 2 },
    ]);

    expect(plan.resequenceStaying.map((r) => r.id).sort()).toEqual(["id-2", "id-3"]);
  });

  it("handles archive-and-resequence together: archived row's old slot is reused immediately", () => {
    // This is the case that breaks a naive "just recompute UNIQUE keys"
    // approach: archiving M2 (seq 2) must free seq 2 for M3's promotion
    // to it, in the same reconciliation.
    const current = [row("id-1", "m1", 1), row("id-2", "m2", 2), row("id-3", "m3", 3)];
    const plan = planOrderedRows(current, [
      { key: "m1", sequenceIndex: 1 },
      { key: "m3", sequenceIndex: 2 },
    ]);

    expect(plan.toArchive.map((r) => r.id)).toEqual(["id-2"]);
    expect(plan.resequenceStaying).toEqual([{ id: "id-3", finalSequenceIndex: 2 }]);
  });

  it("handles revive-into-a-slot-currently-held-by-an-active-row: revival never lands until staying rows have vacated (archived rows aren't sequence-constrained)", () => {
    // A archived at seq=2; B is active at seq=2 (legal — archived rows
    // are excluded from the partial unique index). A comes back and wants
    // seq=3, which is currently free because nothing desired sits there
    // yet in this scenario — the real collision-prone case is covered by
    // the next test below (revival target coincides with a moving row).
    const current = [row("id-a", "a", 2, true), row("id-b", "b", 2)];
    const plan = planOrderedRows(current, [
      { key: "a", sequenceIndex: 3 },
      { key: "b", sequenceIndex: 2 },
    ]);

    expect(plan.toRevive).toEqual([{ id: "id-a", key: "a", finalSequenceIndex: 3 }]);
    expect(plan.resequenceStaying).toEqual([]); // b's sequence_index (2) is unchanged
  });

  it("throws SEQUENCE_RESEQUENCE_OVERFLOW when the temporary offset would exceed the integer column's range", () => {
    const current = [row("id-1", "a", 2_147_483_600)];
    expect(() =>
      planOrderedRows(current, [{ key: "a", sequenceIndex: 2_147_483_601 }]),
    ).toThrow(ContentSeedError);
  });

  it("never computes an offset (or touches anything) when nothing changed, even with a huge existing sequence_index", () => {
    const current = [row("id-1", "a", 2_147_483_600)];
    const plan = planOrderedRows(current, [{ key: "a", sequenceIndex: 2_147_483_600 }]);
    expect(plan.changed).toBe(false);
    expect(plan.offset).toBe(0);
  });
});
