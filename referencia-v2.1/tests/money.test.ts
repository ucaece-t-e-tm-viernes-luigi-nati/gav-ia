import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToInput, parseMoney, splitInstallments } from "../src/lib/money.ts";

test("parseMoney interpreta formatos argentinos sin errores de punto flotante", () => {
  assert.equal(parseMoney("150000"), 15_000_000);
  assert.equal(parseMoney("150.000"), 15_000_000);
  assert.equal(parseMoney("150.000,50"), 15_000_050);
  assert.equal(parseMoney("$ 1.234.567,89"), 123_456_789);
  assert.equal(parseMoney("0,1"), 10);
  assert.equal(parseMoney("19.99"), 1_999);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney("1,234"), null);
  assert.equal(parseMoney(""), null);
});

test("las cuotas suman exactamente el total", () => {
  for (const [total, n] of [[129900, 3], [89900, 6], [39900, 12], [100, 3]]) {
    const parts = splitInstallments(total, n);
    assert.equal(parts.length, n);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
});

test("centsToInput es inversa de parseMoney", () => {
  for (const c of [0, 5, 100, 15_000_050, 123_456_789]) assert.equal(parseMoney(centsToInput(c)), c);
});
