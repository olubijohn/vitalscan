import { expect, test, type Page } from "@playwright/test";

type Role = "admin" | "platform_staff" | "tenant" | "tenant_subuser" | "subscriber";
type CapturedRequest = { method: string; path: string; body: unknown };

const tenant = {
  id: "tenant-1",
  name: "Northstar Health",
  type: "clinic",
  address: "10 Signal Street",
  status: "active",
  creditBalance: 120,
  subscriberCount: 2,
  creditsConsumed: 18,
};
const subscriber = {
  id: "subscriber-1",
  tenantId: tenant.id,
  name: "Ava Thompson",
  email: "ava@northstar.demo",
  phone: "+44 7700 910010",
  dob: "1990-04-15",
  sex: "female",
  heightCm: 168,
  weightKg: 64,
  status: "active",
  consentTenantViewResults: false,
  isGuest: false,
  profileComplete: true,
  missingProfileFields: [],
  creditBalance: 4,
  scansRun: 1,
  lastScanDate: null,
};
const scan = { id: "scan-1", subscriberId: subscriber.id, status: "pending", startedAt: "2026-09-02T10:00:00.000Z", completedAt: null, deviceLabel: "Front Desk Tablet", creditUsed: 0 };

function userForRole(role: Role) {
  return role === "admin"
    ? { id: "user-admin", name: "Elena Park", email: "admin@vitalscan.demo", role: "super_admin", subRole: null, tenantId: null, tenantName: null }
    : role === "platform_staff"
      ? { id: "user-platform-staff", name: "Alex Morgan", email: "support@vitalscan.demo", role: "platform_staff", subRole: "support", tenantId: null, tenantName: null }
    : role === "subscriber"
      ? { id: "user-subscriber", name: subscriber.name, email: "member2@privateselfsignup.demo", role: "subscriber", subRole: null, tenantId: "private-tenant", tenantName: "Private self-signup" }
      : role === "tenant_subuser"
        ? { id: "user-tenant-subuser", name: "Nina Shah", email: "kiosk@acmefitness.demo", role: "tenant_subuser", subRole: "kiosk_operator", tenantId: tenant.id, tenantName: tenant.name }
      : { id: "user-tenant", name: "Mara Chen", email: "admin@acmefitness.demo", role: "tenant_admin", subRole: "full_admin", tenantId: tenant.id, tenantName: tenant.name };
}

async function mockApi(page: Page) {
  let loggedInRole: Role | null = null;
  const requests: CapturedRequest[] = [];
  let currentSubscriber = { ...subscriber };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    requests.push({ method, path, body });

    const json = async (payload: unknown, status = 200) => {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    };
    if (path === "/api/auth/me" && method === "GET") {
      return loggedInRole ? json({ user: userForRole(loggedInRole), authenticated: true }) : json({ error: "Please log in to continue." }, 401);
    }
    if (path === "/api/auth/login" && method === "POST") {
      const email = String((body as { email?: string })?.email || "");
      loggedInRole = email.includes("support")
        ? "platform_staff"
        : email.includes("kiosk")
          ? "tenant_subuser"
          : email.includes("vitalscan")
            ? "admin"
            : email.includes("privateselfsignup")
              ? "subscriber"
              : "tenant";
      return json({ user: userForRole(loggedInRole), requiresMfa: false });
    }
    if (path === "/api/auth/logout" && method === "POST") {
      loggedInRole = null;
      return json({ ok: true });
    }
    if (path === "/api/healthz") return json({ ok: true });

    if (loggedInRole === "admin" || loggedInRole === "platform_staff") {
      if (path === "/api/admin/overview") return json({ activeTenants: 3, totalTenants: 3, totalSubscribers: 24, totalScans: 148, creditsConsumed: 92, creditsIssued: 500, trend: [] });
      if (path === "/api/admin/tenants" && method === "GET") return json([tenant]);
      if (path === "/api/admin/tenants" && method === "POST") return json({ ...tenant, id: "tenant-created", name: (body as { name?: string })?.name || "Created tenant" }, 201);
      if (path === "/api/admin/tenants/tenant-1" && method === "PATCH") return json({ ...tenant, status: "suspended" });
      if (path === "/api/admin/tenants/tenant-1" && method === "DELETE") return json({ ok: true });
      if (path === "/api/admin/analytics") return json({ topTenants: [{ name: tenant.name, scans: 18, credits: 12 }] });
      if (path === "/api/admin/private-tenant/subscribers") return json([]);
      if (path === "/api/admin/private-tenant/topups" && method === "GET") return json([{ id: "topup-1", subscriberName: "Private member", amountRequested: 5, status: "pending", createdAt: "2026-09-02T10:00:00.000Z" }]);
      if (path === "/api/admin/private-tenant/topups/topup-1/decide") return json({ id: "topup-1", status: "approved" });
      if (path === "/api/admin/platform-staff") return json([]);
      if (path === "/api/admin/settings") return json({ defaultCreditGrant: 100 });
    }

    if (loggedInRole === "tenant") {
      if (path === "/api/tenant/overview") return json({ tenant, pendingTopups: 1 });
      if (path === "/api/tenant/subscribers" && method === "GET") return json([currentSubscriber]);
      if (path === "/api/tenant/subscribers" && method === "POST") return json({ ...currentSubscriber, id: "subscriber-created", name: (body as { name?: string })?.name || "Created subscriber" }, 201);
      if (path === "/api/tenant/subscribers/subscriber-1" && method === "PATCH") return json({ ...currentSubscriber, status: "paused" });
      if (path === "/api/tenant/subscribers/subscriber-1") return json({ ...currentSubscriber, scans: [] });
      if (path === "/api/tenant/subscribers/subscriber-1/usage") return json({ scans: [], creditsUsed: 1 });
      if (path === "/api/tenant/subscribers/subscriber-1/result") return json(null);
      if (path === "/api/tenant/topups" && method === "GET") return json([{ id: "tenant-topup-1", subscriberName: currentSubscriber.name, amountRequested: 5, status: "pending", createdAt: "2026-09-02T10:00:00.000Z" }]);
      if (path === "/api/tenant/topups/tenant-topup-1/decide") return json({ id: "tenant-topup-1", status: "approved" });
      if (path === "/api/tenant/subusers") return json([]);
      if (path === "/api/tenant/devices" && method === "GET") return json([{ id: "device-1", label: "Front Desk Tablet", location: "Reception", type: "kiosk", lastActive: "2026-09-02T10:00:00.000Z" }]);
      if (path === "/api/tenant/devices" && method === "POST") return json({ id: "device-created", label: "Northstar station", location: "Front desk", type: "kiosk" }, 201);
      if (path === "/api/tenant/profile") return json(tenant);
      if (path === "/api/tenant/export/usage.csv") return route.fulfill({ status: 200, contentType: "text/csv", body: "name,scans\nAva Thompson,1\n" });
    }

    if (loggedInRole === "tenant" || loggedInRole === "tenant_subuser") {
      if (path === "/api/kiosk/lookup") return json([subscriber]);
      if (path === "/api/kiosk/scans/start") return json(scan, 201);
      if (path === "/api/kiosk/scans/scan-1/abort") return json({ ...scan, status: "aborted" });
      if (path === "/api/kiosk/scans/scan-1/complete") return json({ ...scan, status: "completed", creditUsed: 1 });
    }

    if (loggedInRole === "subscriber") {
      if (path === "/api/subscriber/me" && method === "GET") return json(currentSubscriber);
      if (path === "/api/subscriber/me" && method === "PATCH") {
        currentSubscriber = { ...currentSubscriber, ...(body as object) };
        return json(currentSubscriber);
      }
      if (path === "/api/subscriber/scans") return json([]);
      if (path === "/api/subscriber/notifications") return json([]);
      if (path === "/api/subscriber/scans/start") return json(scan, 201);
      if (path === "/api/subscriber/scans/scan-1/abort") return json({ ...scan, status: "aborted" });
      if (path === "/api/subscriber/scans/scan-1/complete") return json({ ...scan, status: "completed", creditUsed: 1 });
      if (path === "/api/subscriber/topups") return json({ id: "topup-created", amountRequested: 5, status: "pending" }, 201);
    }

    return json({}, 200);
  });

  return requests;
}

async function login(page: Page, role: Role) {
  const emailForRole: Record<Role, string> = {
    admin: "admin@vitalscan.demo",
    platform_staff: "support@vitalscan.demo",
    tenant: "admin@acmefitness.demo",
    tenant_subuser: "kiosk@acmefitness.demo",
    subscriber: "member2@privateselfsignup.demo",
  };
  const expectedPath = role === "admin" || role === "platform_staff"
    ? "/admin"
    : role === "tenant"
      ? "/tenant"
      : role === "tenant_subuser"
        ? "/kiosk"
        : "/subscriber";

  await page.goto("/login");
  await page.getByTestId("input-login-email").fill(emailForRole[role]);
  await page.getByTestId("button-submit-login").click();
  await expect(page).toHaveURL(expectedPath);
}

async function installSdkStub(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { FHVitalsSDK?: unknown }).FHVitalsSDK = {
      ERROR_CODE: { NONE: "NONE", ERROR_HAS_INITIALIZED: "ERROR_HAS_INITIALIZED" },
      init: async () => ({ error: "NONE" }),
      resetFPS: async () => ({ error: "NONE" }),
      startPreview: async () => ({ error: "NONE" }),
      stopPreview: async () => ({ error: "NONE" }),
      startMeasuring: async () => ({ error: "NONE" }),
      stopMeasuring: async () => ({ error: "NONE" }),
      getCameraStatus: () => ({ currentFps: 30 }),
    };
  });
}

test("admin navigation and tenant/top-up actions remain wired", async ({ page }) => {
  const requests = await mockApi(page);
  await login(page, "admin");
  await expect(page.getByRole("heading", { name: "Good morning, Elena." })).toBeVisible();

  await page.getByTestId("link-tenants").click();
  await expect(page).toHaveURL("/admin?view=tenants");
  await expect(page.getByRole("heading", { name: "All tenant workspaces" })).toBeVisible();
  await page.getByTestId("button-add-tenant-secondary").click();
  await page.getByTestId("input-tenant-name").fill("Created workspace");
  await page.getByTestId("input-tenant-admin-name").fill("Taylor Admin");
  await page.getByTestId("input-tenant-admin-email").fill("taylor@workspace.demo");
  await page.getByTestId("button-submit-tenant").click();
  await expect(page.getByText("Tenant workspace created.")).toBeVisible();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/admin/tenants")).toBeTruthy();

  await page.getByTestId("button-toggle-tenant-tenant-1").click();
  expect(requests.some((request) => request.method === "PATCH" && request.path === "/api/admin/tenants/tenant-1")).toBeTruthy();
  await page.getByTestId("link-platform-overview").click();
  await page.getByTestId("button-approve-topup-topup-1").click();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/admin/private-tenant/topups/topup-1/decide")).toBeTruthy();
});

test("tenant navigation, mobile menu, and subscriber actions remain wired", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockApi(page);
  await login(page, "tenant");
  await expect(page.getByRole("heading", { name: "Your care console." })).toBeVisible();

  await page.getByTestId("button-open-menu").click();
  await expect(page.getByTestId("button-close-menu")).toBeVisible();
  await page.getByTestId("button-close-menu").click();
  await expect(page.locator(".side-rail")).not.toHaveClass(/is-open/);

  await page.getByTestId("button-open-menu").click();
  await page.getByTestId("link-subscribers").click();
  await expect(page).toHaveURL("/tenant?view=subscribers");
  await expect(page.getByRole("heading", { name: "Subscribers" })).toBeVisible();
  await page.getByTestId("button-add-subscriber").click();
  await page.getByTestId("input-subscriber-name").fill("Created subscriber");
  await page.getByTestId("input-subscriber-email").fill("created@northstar.demo");
  await page.getByTestId("button-submit-subscriber").click();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/tenant/subscribers")).toBeTruthy();

  await page.getByTestId("button-edit-subscriber-subscriber-1").click();
  expect(requests.some((request) => request.method === "PATCH" && request.path === "/api/tenant/subscribers/subscriber-1")).toBeTruthy();
  await page.getByTestId("button-approve-tenant-topup-tenant-topup-1").click();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/tenant/topups/tenant-topup-1/decide")).toBeTruthy();
});

test("subscriber query views, consent update, and camera abort remain wired", async ({ page }) => {
  await installSdkStub(page);
  const requests = await mockApi(page);
  await login(page, "subscriber");
  await expect(page.getByRole("heading", { name: "Good morning, Ava." })).toBeVisible();

  await page.getByTestId("link-profile-&-consent").click();
  await expect(page).toHaveURL("/subscriber?view=profile");
  await page.locator(".profile-consent .switch").click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect.poll(() => requests.some((request) => request.method === "PATCH" && request.path === "/api/subscriber/me")).toBeTruthy();

  await page.getByTestId("link-my-overview").click();
  await page.getByTestId("button-start-scan").click();
  await expect(page.getByTestId("button-camera-cancel")).toBeVisible();
  await page.getByTestId("button-camera-cancel").click();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/subscriber/scans/scan-1/abort")).toBeTruthy();
});

test("all session roles land on and stay within their allowed console", async ({ page }) => {
  await mockApi(page);
  const roles = {
    admin: { ownPath: "/admin", heading: "Good morning, Elena.", allowedPaths: ["/admin"] },
    platform_staff: { ownPath: "/admin", heading: "Good morning, Elena.", allowedPaths: ["/admin"] },
    tenant: { ownPath: "/tenant", heading: "Your care console.", allowedPaths: ["/tenant", "/kiosk"] },
    tenant_subuser: { ownPath: "/kiosk", heading: "Guest details", allowedPaths: ["/kiosk"] },
    subscriber: { ownPath: "/subscriber", heading: "Good morning, Ava.", allowedPaths: ["/subscriber"] },
  } satisfies Record<Role, { ownPath: string; heading: string; allowedPaths: string[] }>;
  const consolePaths = ["/admin", "/tenant", "/subscriber", "/kiosk"];
  const headingsByPath: Record<string, string> = {
    "/admin": "Good morning, Elena.",
    "/tenant": "Your care console.",
    "/subscriber": "Good morning, Ava.",
    "/kiosk": "Guest details",
  };

  for (const role of Object.keys(roles) as Role[]) {
    await login(page, role);
    await page.goto("/");
    await expect(page).toHaveURL(roles[role].ownPath);
    await expect(page.getByRole("heading", { name: roles[role].heading })).toBeVisible();

    for (const consolePath of consolePaths) {
      await page.goto(consolePath);
      const allowed = roles[role].allowedPaths.includes(consolePath);
      const expectedPath = allowed ? consolePath : roles[role].ownPath;
      await expect(page).toHaveURL(expectedPath);
      await expect(page.getByRole("heading", { name: allowed ? headingsByPath[consolePath] : roles[role].heading })).toBeVisible();
    }
  }
});

test("unauthenticated direct console URLs return to sign in", async ({ page }) => {
  await mockApi(page);

  for (const consolePath of ["/admin", "/tenant", "/subscriber", "/kiosk"]) {
    await page.goto(consolePath);
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: "Sign in to VitalScan" })).toBeVisible();
  }
});

test("kiosk lookup, query-driven selection, and scan abort remain wired", async ({ page }) => {
  await installSdkStub(page);
  const requests = await mockApi(page);
  await login(page, "tenant");
  await page.goto("/kiosk");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByTestId("input-kiosk-search").fill("Ava");
  await page.getByTestId("button-kiosk-subscriber-subscriber-1").click();
  await page.getByTestId("button-kiosk-start").click();
  await expect(page.getByTestId("button-camera-cancel")).toBeVisible();
  await page.getByTestId("button-camera-cancel").click();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/kiosk/lookup")).toBeFalsy();
  expect(requests.some((request) => request.method === "GET" && request.path === "/api/kiosk/lookup")).toBeTruthy();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/kiosk/scans/start")).toBeTruthy();
  expect(requests.some((request) => request.method === "POST" && request.path === "/api/kiosk/scans/scan-1/abort")).toBeTruthy();
  await expect(page.getByTestId("input-kiosk-search")).toBeVisible();
});