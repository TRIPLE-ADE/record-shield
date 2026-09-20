import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { installMockApi } from "@/lib/mock-api";
import { getSession, login, logout } from "./api";

describe("auth contract flow", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("requires a real login before returning server context", async () => {
    const session = await login({
      username: "amina.unity",
      password: "synthetic-example-password",
    });

    expect(session.user.username).toBe("amina.unity");
    expect(session.organization?.name).toBe("Unity Medical");
    expect(session.role).toBe("EMERGENCY_DOCTOR");

    const refreshed = await getSession();
    expect(refreshed.correlation_id).toMatch(/[0-9a-f-]{36}/);
  });

  test("returns a safe authentication error for invalid credentials", async () => {
    await expect(
      login({ username: "amina.unity", password: "incorrect-demo-password" }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      status: 401,
    });
  });

  test("applies a membership suspension on the next context request", async () => {
    const session = await login({
      username: "grace.unity",
      password: "synthetic-example-password",
    });
    runtime.service.suspendMembership(session.membership_id as string);

    await expect(getSession()).rejects.toMatchObject({
      code: "CONTEXT_DENIED",
      status: 403,
    });
  });

  test("logout invalidates the session and clears the query boundary", async () => {
    await login({ username: "john.mercy", password: "synthetic-example-password" });
    await logout();

    await expect(getSession()).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
    });
  });
});
