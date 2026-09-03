import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import app from "../src/app";
import { createStore, store } from "../src/vitalscan/store";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Unable to start API test server.");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  Object.assign(store, createStore());
});

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Demo1234!" }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  return cookie!.split(";")[0];
}

async function apiRequest(path: string, cookie: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      cookie,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

describe("tenant and kiosk role boundaries", () => {
  test("kiosk operators cannot read or mutate tenant-console resources", async () => {
    const cookie = await login("kiosk@acmefitness.demo");
    const tenant = store.tenants.find((item) => item.name === "Acme Fitness")!;
    const subscriber = store.subscribers.find((item) => item.tenantId === tenant.id)!;

    const responses = await Promise.all([
      apiRequest("/api/tenant/overview", cookie),
      apiRequest("/api/tenant/subscribers", cookie),
      apiRequest(`/api/tenant/subscribers/${subscriber.id}`, cookie),
      apiRequest(`/api/tenant/subscribers/${subscriber.id}/usage`, cookie),
      apiRequest("/api/tenant/devices", cookie),
      apiRequest("/api/tenant/export/usage.csv", cookie),
      apiRequest("/api/tenant/subscribers", cookie, {
        method: "POST",
        body: JSON.stringify({ name: "Blocked member", email: "blocked@example.test" }),
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
  });

  test("kiosk operators retain kiosk access", async () => {
    const cookie = await login("kiosk@acmefitness.demo");
    const response = await apiRequest("/api/kiosk/lookup?query=member", cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toBeInstanceOf(Array);
  });

  test("tenant admins retain tenant-console and kiosk access", async () => {
    const cookie = await login("admin@acmefitness.demo");
    const tenantResponse = await apiRequest("/api/tenant/overview", cookie);
    const kioskResponse = await apiRequest("/api/kiosk/lookup?query=member", cookie);

    expect(tenantResponse.status).toBe(200);
    expect(kioskResponse.status).toBe(200);
  });
});