// Crypto-level test helpers for the server fairness adapter (P8-3c-1). They depend only on the
// adapter, so the adapter's tests run without the vault and store (P8-3c-2).
import { inspect } from "node:util";
import { expect } from "vitest";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";

/** One verified node:crypto adapter shared by the tests. */
export const nodeCrypto = createNodeFairnessCrypto();

/** Asserts that `run` rejects (or throws) with an error carrying `code`. */
export async function expectCode(
  run: Promise<unknown> | (() => unknown),
  code: string,
): Promise<void> {
  let error: unknown = null;
  try {
    await (typeof run === "function" ? run() : run);
  } catch (e) {
    error = e;
  }
  expect(error, `expected ${code}`).not.toBeNull();
  expect((error as { code?: string }).code).toBe(code);
}

/** Every common way a value can be turned into text. */
export function renderings(value: unknown): string[] {
  const out = [inspect(value, { depth: Infinity, showHidden: true, getters: true })];
  try {
    out.push(JSON.stringify(value) ?? "");
  } catch {
    // not serializable
  }
  try {
    out.push(String(value), `${value as string}`);
  } catch {
    // no string conversion
  }
  if (value && typeof value === "object") out.push(Object.keys(value).join(","));
  if (value instanceof Error) out.push(value.message, value.stack ?? "");
  return out;
}
