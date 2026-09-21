import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { getPatientDirectory } from ".";

describe("patient directory API", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("returns the patients assigned to the active organization", async () => {
    await login({ username: "grace.unity", password: "synthetic-example-password" });

    const result = await getPatientDirectory();

    expect(result.items.map((patient) => patient.name)).toEqual(["Musa Ibrahim", "Ada Nwosu"]);
    expect(result.items.every((patient) => patient.organization.name === "Unity Medical")).toBe(
      true,
    );
    expect(result.next_cursor).toBeNull();
  });

  test("does not expose a staff directory to a patient session", async () => {
    await login({ username: "musa.patient", password: "synthetic-example-password" });

    await expect(getPatientDirectory()).rejects.toMatchObject({
      code: "POLICY_DENIED",
      status: 403,
    });
  });

  test("paginates and searches before applying the page limit", async () => {
    await login({ username: "grace.unity", password: "synthetic-example-password" });
    const first = await getPatientDirectory({ limit: 1 });
    expect(first.items.map((item) => item.name)).toEqual(["Musa Ibrahim"]);
    expect(first.next_cursor).toBeTruthy();
    const second = await getPatientDirectory({ limit: 1, cursor: first.next_cursor! });
    expect(second.items.map((item) => item.name)).toEqual(["Ada Nwosu"]);
    expect(second.next_cursor).toBeNull();
    const search = await getPatientDirectory({ limit: 1, search: "  ADA  " });
    expect(search.items.map((item) => item.name)).toEqual(["Ada Nwosu"]);
    expect((await getPatientDirectory({ search: "HSP-99211" })).items[0]?.name).toBe("Ada Nwosu");
  });

  test("rejects cursors reused with another search or actor", async () => {
    await login({ username: "grace.unity", password: "synthetic-example-password" });
    const first = await getPatientDirectory({ limit: 1 });
    await expect(
      getPatientDirectory({ limit: 1, cursor: first.next_cursor!, search: "Ada" }),
    ).rejects.toMatchObject({ status: 422 });
    await logout();
    clearApiSession();
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    await expect(
      getPatientDirectory({ limit: 1, cursor: first.next_cursor! }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(getPatientDirectory({ search: "x".repeat(101) })).rejects.toMatchObject({
      status: 422,
    });
  });
});
