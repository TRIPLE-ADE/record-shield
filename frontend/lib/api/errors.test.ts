import { expect, test } from "vitest";
import { z } from "zod";
import { getApiErrorMessage } from "./errors";

test("response validation errors do not expose schema internals", () => {
  const result = z.strictObject({}).safeParse({ private_field: "private value" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const message = getApiErrorMessage(result.error);
    expect(message).toContain("Please try again");
    expect(message).not.toMatch(/private|unrecognized_keys|Zod/);
  }
});
