import { test } from "node:test";
import assert from "node:assert/strict";
import { forwardBackendRequest, adaptBackendResponse, auditStreamId } from "./backend-gateway.ts";
const base = "https://backend.example/api/v1";
const request = (path, options) => new Request(`http://localhost:3000/api/v1/${path}`, options);
test("missing and unsafe routes never reach backend", async () => {
  for (const path of ["patients/abc/context", "worklist", "_infrastructure/m1/probe", "../me"]) {
    const response = await forwardBackendRequest(request(path), path.split("/"), base, () => {
      throw Error("must not fetch");
    });
    assert.ok([404, 501].includes(response.status));
  }
});
test("forwards scoped credentials and preserves backend denials", async () => {
  const response = await forwardBackendRequest(
    request("consent/requests?domains=a&domains=b", {
      method: "POST",
      body: "{}",
      headers: {
        origin: "http://localhost:3000",
        cookie: "rs_session=synthetic; unrelated=private",
        "X-CSRF-Token": "csrf",
        "Idempotency-Key": "retry-key",
        "If-Match": "1",
      },
    }),
    ["consent", "requests"],
    base,
    async (url, options) => {
      assert.equal(url.href, `${base}/consent/requests?domains=a&domains=b`);
      assert.equal(options.headers.get("cookie"), "rs_session=synthetic");
      assert.equal(options.headers.get("X-CSRF-Token"), "csrf");
      assert.equal(options.headers.get("Idempotency-Key"), "retry-key");
      assert.equal(options.headers.get("If-Match"), "1");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "manual");
      return Response.json({ error: { code: "ACCESS_DENIED" } }, { status: 403 });
    },
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("rejects cross-origin writes and insecure backend", async () => {
  assert.equal(
    (
      await forwardBackendRequest(
        request("auth/login", { method: "POST", headers: { origin: "https://evil.example" } }),
        ["auth", "login"],
        base,
      )
    ).status,
    403,
  );
  assert.equal(
    (await forwardBackendRequest(request("me"), ["me"], "http://backend.example")).status,
    503,
  );
});
test("logout preserves expiry and scopes cookies locally", async () => {
  const response = await forwardBackendRequest(
    request("auth/logout", { method: "POST" }),
    ["auth", "logout"],
    base,
    async () =>
      new Response(null, {
        status: 204,
        headers: { "Set-Cookie": "rs_session=; Max-Age=0; Domain=backend.example; Secure" },
      }),
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(response.headers.get("set-cookie"), /Domain=|Secure/);
});
test("redirects and malformed responses fail safely", async () => {
  for (const upstream of [
    new Response(null, { status: 302 }),
    new Response("private error details"),
  ]) {
    const response = await forwardBackendRequest(request("me"), ["me"], base, async () => upstream);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private error details/);
  }
});
test("normalizes missing compatibility fields only", () => {
  assert.equal(auditStreamId("exchange"), "86856f58-f59b-51ca-8d7f-7c4ad73275c0");
  const session = { user: { id: "synthetic" }, role: "TRUST_OPERATOR" };
  assert.equal(adaptBackendResponse("/me", session).security_stream_id, auditStreamId("exchange"));
  assert.equal(
    adaptBackendResponse("/me", { ...session, security_stream_id: null }).security_stream_id,
    null,
  );
  assert.equal(
    adaptBackendResponse("/me", { ...session, role: "DOCTOR" }).security_stream_id,
    null,
  );
  assert.deepEqual(
    adaptBackendResponse("/emergency/sessions/example/expand", { session: {}, records: [] }),
    { session: {}, records: [], view: "expanded" },
  );
});

test("Next normalized URLs accept the original HTTP host", async () => {
  const response = await forwardBackendRequest(
    new Request("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      body: "{}",
    }),
    ["auth", "login"],
    base,
    async () => Response.json({ ok: true }),
  );
  assert.equal(response.status, 200);
});
