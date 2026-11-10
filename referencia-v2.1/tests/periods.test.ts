import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonPeriods, seasonStartYear } from "../src/lib/periods.ts";

test("períodos: temporada 15/11 al 30/04, meses y quincenas de diciembre a marzo", () => {
  assert.equal(seasonStartYear("2026-10-30"), 2026);
  assert.equal(seasonStartYear("2027-02-10"), 2026);
  const p = seasonPeriods("2026-10-30");
  assert.deepEqual([p[0].from, p[0].to], ["2026-11-15", "2027-04-30"]);
  const feb = p.filter((x) => x.group === "Febrero");
  assert.deepEqual(feb.map((x) => [x.from, x.to]), [["2027-02-01", "2027-02-28"], ["2027-02-01", "2027-02-15"], ["2027-02-16", "2027-02-28"]]);
  assert.equal(p.find((x) => x.key === "2026-12-q2")?.to, "2026-12-31");
  assert.equal(p.length, 1 + 4 * 3);
});