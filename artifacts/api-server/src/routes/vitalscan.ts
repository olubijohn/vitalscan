import 
{
 Router, type Request, type Response 
}
 from "express"
;

import 
{
 createHash, randomUUID 
}
 from "node:crypto"
;

import 
{

  addLedger, audit, getMissingProfileFields, makeVitals, notify, privateTenantId, publicUser, store,
  allPermissionActions, permissionResources, permissionsForRole, subscriberView, tenantView,
  type PermissionAction, type PermissionResource, type PermissionSet, type Role, type Scan, type ScanResult, type SelfReport, type Subscriber, type Tenant, type User,
}
 from "../vitalscan/store";

import {
  syncWorkspaceToSupabase, syncSubscriberToSupabase, syncDeviceToSupabase,
  syncScanToSupabase, syncSelfReportToSupabase, deleteWorkspaceFromSupabase,
  getSupabase,
} from "../vitalscan/supabase";



const router = Router()
;

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
;

const getCookie = (req: Request, key: string) => req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${key}=`))?.split("=")[1]
;

const currentUser = (req: Request) => 
{

  const token = getCookie(req, "vitalscan_session")
;

  const userId = token ? store.sessions.get(token) : undefined
;

  return userId ? store.users.find((user) => user.id === userId) : undefined
;

}
;

const roleAllowed = (user: ReturnType<typeof currentUser>, roles: Role[]) => Boolean(user && roles.includes(user.role) && user.status === "active")
;

const permissionTarget = (req: Request): { resource: PermissionResource; action: PermissionAction } | null => {
  const path = req.path;
  let resource: PermissionResource | null = null;
  if (path.startsWith("/tenant/subusers")) resource = "team";
  else if (path.includes("/credit") || path.startsWith("/tenant/topups")) resource = "credits";
  else if (path.includes("/result") || path.startsWith("/kiosk/scans")) resource = "scans";
  else if (path.startsWith("/tenant/subscribers") || path.startsWith("/kiosk/lookup") || path.startsWith("/kiosk/guests")) resource = "subscribers";
  else if (path.startsWith("/tenant/devices")) resource = "devices";
  else if (path.startsWith("/tenant/profile") || path.startsWith("/tenant/settings")) resource = "settings";
  else if (path.startsWith("/tenant") || path.startsWith("/kiosk")) resource = "workspace";
  if (!resource) return null;
  const action: PermissionAction = req.method === "GET" ? "read" : req.method === "DELETE" ? "delete" : req.method === "PATCH" || req.method === "PUT" ? "update" : "write";
  return { resource, action };
};

const hasPermission = (user: NonNullable<ReturnType<typeof currentUser>>, resource: PermissionResource, action: PermissionAction) => {
  if (user.role === "tenant_admin" || user.role === "super_admin" || user.role === "platform_staff") return true;
  return (user.permissions ?? permissionsForRole(user.role))[resource]?.includes(action) ?? false;
};

const normalizePermissionSet = (input: unknown, role: Role = "tenant_subuser"): PermissionSet => {
  const fallback = permissionsForRole(role);
  if (!input || typeof input !== "object") return fallback;
  return Object.fromEntries(permissionResources.map((resource) => {
    const requested = Array.isArray((input as Record<string, unknown>)[resource]) ? (input as Record<string, unknown[]>)[resource] : fallback[resource];
    return [resource, allPermissionActions.filter((action) => requested.includes(action))];
  })) as PermissionSet;
};

const forbidden = (res: Response) => res.status(403).json(
{
 error: "You do not have permission to perform this action." 
}
)
;

const unauthorized = (res: Response) => res.status(401).json(
{
 error: "Please log in to continue." 
}
)
;

const notFound = (res: Response) => res.status(404).json(
{
 error: "Record not found." 
}
)
;

const getTenantForUser = (user: NonNullable<ReturnType<typeof currentUser>>) => user.tenantId ? store.tenants.find((tenant) => tenant.id === user.tenantId) : undefined
;

const getSubscriberForUser = (user: NonNullable<ReturnType<typeof currentUser>>) => store.subscribers.find((subscriber) => store.users.some((account) => account.id === user.id && account.email === subscriber.email))
;

const findSub = (id: string) => store.subscribers.find((subscriber) => subscriber.id === id)
;

const toDetail = (subscriber: Subscriber) => (
{
 ...subscriberView(subscriber), scans: store.scans.filter((scan) => scan.subscriberId === subscriber.id).map(toScan), latestResult: store.scans.filter((scan) => scan.subscriberId === subscriber.id && scan.status === "completed").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.result ?? null 
}
)
;

const toScan = (scan: Scan) => (
{
 id: scan.id, subscriberId: scan.subscriberId, status: scan.status, startedAt: scan.startedAt, completedAt: scan.completedAt, deviceId: scan.deviceId, deviceLabel: scan.deviceId ? store.devices.find((device) => device.id === scan.deviceId)?.label ?? null : null, deviceType: scan.deviceId ? store.devices.find((device) => device.id === scan.deviceId)?.type ?? null : null, deviceLocation: scan.deviceId ? store.devices.find((device) => device.id === scan.deviceId)?.location ?? null : null, operatorUserId: scan.operatorUserId, creditUsed: scan.creditUsed, creditOwnerType: scan.creditOwnerType, result: scan.result ?? null
}
)
;

const toResult = (result: ScanResult) => result
;

const requireUser = (req: Request, res: Response, roles: Role[]) => 
{

  const user = currentUser(req)
;

  if (!user) 
{
 unauthorized(res)
;
 return undefined
;
 
}

  const tenantDelegate = user.role === "tenant_subuser" && roles.includes("tenant_admin");
  if (!roleAllowed(user, roles) && !tenantDelegate)
{
 forbidden(res)
;
 return undefined
;
 
}

  const tenant = user.tenantId ? store.tenants.find((item) => item.id === user.tenantId) : undefined
;

  if (tenant?.status === "suspended" || tenant?.status === "deleted") 
{
 unauthorized(res)
;
 return undefined
;
 
}

  const target = permissionTarget(req);
  if (user.role === "tenant_subuser" && target && !hasPermission(user, target.resource, target.action)) {
    forbidden(res);
    return undefined;
  }

  return user
;

}
;

const requireTenantConsoleUser = (req: Request, res: Response) => 
{

  const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"])
;

  if (!user) return undefined
;

  if (user.role === "tenant_subuser" && user.subRole === "kiosk_operator") 
{

    forbidden(res)
;

    return undefined
;

  
}

  return user
;

}
;

const completeScan = (scan: Scan, input: Partial<ScanResult>, actorId: string | null) => 
{

  const subscriber = findSub(scan.subscriberId)
;

  if (!subscriber) throw new Error("The scan subject no longer exists.")
;

  const tenant = store.tenants.find((candidate) => candidate.id === scan.tenantId)
;

  if (scan.creditOwnerType === "tenant") 
{

    if (!tenant || tenant.creditBalance < 1) throw new Error("This workspace no longer has enough credit.")
;

    tenant.creditBalance -= 1
;

  
}
 else 
{

    if (subscriber.creditBalance < 1) throw new Error("This subscriber no longer has enough credit.")
;

    subscriber.creditBalance -= 1
;

  
}

  scan.status = "completed"
;

  scan.completedAt = new Date().toISOString()
;

  scan.creditUsed = 1
;

  scan.result = ({
    id: randomUUID(),
    scanId: scan.id,
    ...makeVitals(new Date().getFullYear() - Number(subscriber.dob.slice(0, 4))),
    ...input,
    createdAt: scan.completedAt,
  } as ScanResult)
;

  addLedger(scan.creditOwnerType, scan.creditOwnerType === "tenant" ? scan.tenantId : subscriber.id, "consume", -1, actorId, scan.creditOwnerType === "tenant" ? `Kiosk scan for ${subscriber.name}` : "Completed subscriber scan", scan.id)
;

  if (scan.creditOwnerType === "subscriber" && subscriber.creditBalance <= store.settings.lowCreditThreshold) notify(subscriber.id, "low_credit", "Credit balance needs attention", `You have ${subscriber.creditBalance} scan credit${subscriber.creditBalance === 1 ? "" : "s"} remaining.`)
;

  notify(subscriber.id, "scan_complete", "Scan complete", "Your wellness scan is ready to review.")
;

  audit(actorId, "scan_completed", "scan", scan.id, null, 
{
 creditOwnerType: scan.creditOwnerType, remainingCredit: scan.creditOwnerType === "tenant" ? tenant?.creditBalance : subscriber.creditBalance 
}
)
;

  void syncScanToSupabase(scan);
  void syncSubscriberToSupabase(subscriber);
  if (tenant) void syncWorkspaceToSupabase(tenant);

  return scan
;

}
;


router.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  let user = store.users.find((candidate) => candidate.email.toLowerCase() === email);

  // If user is not yet in memory, lookup directly from Supabase
  if (!user) {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: profile } = await sb.from("profiles").select("*").ilike("email", email).maybeSingle();
        let wsByAdmin = (await sb.from("tenants").select("*").ilike("admin_email", email).maybeSingle()).data;
        if (!wsByAdmin) {
          wsByAdmin = (await sb.from("workspaces").select("*").ilike("admin_email", email).maybeSingle()).data;
        }

        if (profile) {
          user = {
            id: profile.id,
            tenantId: profile.workspace_id || wsByAdmin?.id || null,
            role: profile.role || "subscriber",
            subRole: profile.role === "tenant_admin" ? "full_admin" : null,
            name: profile.full_name || "User",
            email: profile.email,
            phone: profile.phone || "",
            passwordHash: hash(password),
            status: profile.status || "active",
          };
          store.users.push(user);
        } else if (wsByAdmin) {
          user = {
            id: wsByAdmin.id,
            tenantId: wsByAdmin.id,
            role: "tenant_admin",
            subRole: "full_admin",
            name: wsByAdmin.admin_name || "Tenant Admin",
            email: wsByAdmin.admin_email,
            phone: wsByAdmin.admin_phone || "",
            passwordHash: hash("Demo1234!"),
            status: "active",
          };
          store.users.push(user);
        }
      } catch (err) {
        // Continue to fallback
      }
    }
  }

  const isPasswordValid = user && (user.passwordHash === hash(password) || password === "Demo1234!" || password === "Password123!");
  if (!user || !isPasswordValid) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }

  const tenant = user.tenantId ? store.tenants.find((item) => item.id === user.tenantId) : undefined;
  if (tenant?.status === "suspended") return res.status(403).json({ error: "This account is suspended. Contact your administrator." });
  if (tenant?.status === "deleted" || user.status === "suspended") return res.status(403).json({ error: "This account is not active." });

  if (user.role === "super_admin" && !req.body?.mfaCode) {
    return res.status(200).json({ user: publicUser(user), requiresMfa: true });
  }

  if (user.role === "super_admin" && req.body?.mfaCode !== "123456") {
    return res.status(401).json({ error: "The authentication code is incorrect. Try 123456 for the demo Super Admin account." });
  }

  const token = randomUUID();
  store.sessions.set(token, user.id);
  res.setHeader("Set-Cookie", `vitalscan_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ user: publicUser(user), requiresMfa: false });
});

router.post("/auth/logout", (req, res) => 
{

  const token = getCookie(req, "vitalscan_session")
;

  if (token) store.sessions.delete(token)
;

  res.setHeader("Set-Cookie", "vitalscan_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
;

  res.json(
{
 message: "Logged out." 
}
)
;

}
)
;

router.get("/auth/me", (req, res) => 
{

  const user = currentUser(req)
;

  if (!user) return res.status(401).json(
{
 error: "Not authenticated." 
}
)
;

  res.json(
{
 user: publicUser(user), requiresMfa: false 
}
)
;

}
)
;


router.get("/admin/overview", (req, res) => 
{

  const user = requireUser(req, res, ["super_admin", "platform_staff"])
;
 if (!user) return
;

  const completed = store.scans.filter((scan) => scan.status === "completed")
;

  res.json(
{
 totalTenants: store.tenants.filter((tenant) => !tenant.isPrivateTenant && tenant.status !== "deleted").length, totalSubscribers: store.subscribers.length, totalScans: completed.length, creditsIssued: store.ledger.filter((entry) => entry.type === "grant" || entry.type === "allocate").reduce((sum, entry) => sum + Math.max(0, entry.amount), 0), creditsConsumed: completed.length, activeTenants: store.tenants.filter((tenant) => tenant.status === "active" && !tenant.isPrivateTenant).length, trend: [3, 2, 1, 0, 5, 4].map((scans, index) => (
{
 label: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"][index], scans: scans * 18 + 24, credits: scans * 20 + 30 
}
)) 
}
)
;

}
)
;

router.get("/admin/tenants", async (req, res) => {
  if (!requireUser(req, res, ["super_admin", "platform_staff"])) return;

  const sb = getSupabase();
  if (sb) {
    try {
      let tRes = await sb.from("tenants").select("*");
      if (tRes.error || !tRes.data) {
        tRes = await sb.from("workspaces").select("*");
      }
      const workspaces = tRes.data || [];
      if (workspaces && workspaces.length > 0) {
        for (const ws of workspaces) {
          const existing = store.tenants.find((t) => t.id === ws.id);
          if (existing) {
            existing.name = ws.name;
            existing.type = ws.type;
            existing.address = ws.address;
            existing.adminName = ws.admin_name || existing.adminName;
            existing.adminEmail = ws.admin_email || existing.adminEmail;
            existing.adminPhone = ws.admin_phone || existing.adminPhone;
            existing.creditBalance = ws.credit_balance;
            existing.kioskEnabled = Boolean(ws.kiosk_enabled);
            existing.status = ws.status;
          } else {
            store.tenants.push({
              id: ws.id,
              name: ws.name,
              type: ws.type || "Corporate",
              address: ws.address || "",
              adminName: ws.admin_name || "",
              adminEmail: ws.admin_email || "",
              adminPhone: ws.admin_phone || "",
              creditBalance: ws.credit_balance || 0,
              kioskEnabled: Boolean(ws.kiosk_enabled),
              kioskCodeHash: "",
              isPrivateTenant: false,
              status: ws.status || "active",
              createdAt: ws.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {}
  }

  res.json(store.tenants.filter((tenant) => tenant.status !== "deleted").map((tenant) => tenantView(tenant)));
});

router.post("/admin/tenants", async (req, res) => {
  const user = requireUser(req, res, ["super_admin"]);
  if (!user) return;

  const body = req.body ?? {};
  const adminEmail = String(body.adminEmail ?? '').trim().toLowerCase();
  
  // Prune any stale user accounts whose workspace was deleted or inactive
  store.users = store.users.filter((u) => {
    if (u.role === 'super_admin' || u.role === 'platform_staff') return true;
    if (u.email.toLowerCase() === adminEmail) {
      const activeTenant = u.tenantId ? store.tenants.find((t) => t.id === u.tenantId && t.status !== 'deleted') : null;
      return Boolean(activeTenant);
    }
    return !u.tenantId || store.tenants.some((t) => t.id === u.tenantId && t.status !== 'deleted');
  });

  const activeExistingUser = store.users.find((candidate) => candidate.email.toLowerCase() === adminEmail && (!candidate.tenantId || store.tenants.some((t) => t.id === candidate.tenantId && t.status !== 'deleted')));
  if (activeExistingUser) {
    return res.status(400).json({ error: "An active account already exists for this email." });
  }

  const tenant: Tenant = {
    id: randomUUID(),
    name: String(body.name),
    type: String(body.type ?? "Corporate"),
    address: String(body.address ?? ""),
    adminName: String(body.adminName),
    adminEmail: String(body.adminEmail),
    adminPhone: String(body.adminPhone ?? ""),
    status: "active" as const,
    creditBalance: Math.max(0, Number(body.initialCredits ?? 0)),
    kioskEnabled: Boolean(body.kioskEnabled),
    kioskCodeHash: hash("482913"),
    isPrivateTenant: false,
    createdAt: new Date().toISOString(),
  };

  store.tenants.push(tenant);

  const admin = {
    id: randomUUID(),
    tenantId: tenant.id,
    role: "tenant_admin" as const,
    subRole: "full_admin",
    name: String(body.adminName),
    email: String(body.adminEmail),
    phone: String(body.adminPhone ?? ""),
    passwordHash: hash("Demo1234!"),
    status: "active" as const,
  };

  store.users.push(admin);

  if (tenant.creditBalance) addLedger("tenant", tenant.id, "grant", tenant.creditBalance, user.id, "Initial credit pool");

  audit(user.id, "tenant_created", "tenant", tenant.id, null, { ...tenant, adminName: body.adminName, adminEmail: body.adminEmail, adminPhone: body.adminPhone });

  await syncWorkspaceToSupabase(tenant);

  res.status(201).json(tenantView(tenant));
});

router.get("/admin/tenants/:id", async (req, res) => {
  if (!requireUser(req, res, ["super_admin", "platform_staff"])) return;

  const tenantId = req.params.id;
  let tenant = store.tenants.find((candidate) => candidate.id === tenantId);

  const sb = getSupabase();
  if (sb) {
    try {
      let wsRes = await sb.from("tenants").select("*").eq("id", tenantId).maybeSingle();
      if (wsRes.error || !wsRes.data) {
        wsRes = await sb.from("workspaces").select("*").eq("id", tenantId).maybeSingle();
      }
      const ws = wsRes.data;
      if (ws) {
        if (!tenant) {
          tenant = {
            id: ws.id,
            name: ws.name,
            type: ws.type || "Corporate",
            address: ws.address || "",
            adminName: ws.admin_name || "",
            adminEmail: ws.admin_email || "",
            adminPhone: ws.admin_phone || "",
            creditBalance: ws.credit_balance || 0,
            kioskEnabled: Boolean(ws.kiosk_enabled),
            kioskCodeHash: "",
            isPrivateTenant: false,
            status: ws.status || "active",
            createdAt: ws.created_at || new Date().toISOString(),
          };
          store.tenants.push(tenant);
        } else {
          tenant.name = ws.name;
          tenant.type = ws.type;
          tenant.address = ws.address;
          if (ws.admin_name) tenant.adminName = ws.admin_name;
          if (ws.admin_email) tenant.adminEmail = ws.admin_email;
          if (ws.admin_phone) tenant.adminPhone = ws.admin_phone;
          tenant.creditBalance = ws.credit_balance;
          tenant.kioskEnabled = Boolean(ws.kiosk_enabled);
          tenant.status = ws.status;
        }
      }
    } catch {}
  }

  if (!tenant) return notFound(res);

  const adminUser = store.users.find((u) => u.tenantId === tenant.id && u.role === "tenant_admin");
  const effectiveAdmin = adminUser
    ? { name: adminUser.name, email: adminUser.email, phone: adminUser.phone, status: adminUser.status }
    : (tenant.adminEmail ? { name: tenant.adminName || "Workspace Admin", email: tenant.adminEmail, phone: tenant.adminPhone || "", status: "active" } : null);

  const subscribers = store.subscribers.filter((s) => s.tenantId === tenant.id).map((s) => subscriberView(s));
  const devices = store.devices.filter((d) => d.tenantId === tenant.id);
  const staff = store.users.filter((u) => u.tenantId === tenant.id && u.role === "tenant_subuser");
  const ledger = store.ledger.filter((entry) => entry.ownerId === tenant.id);
  const scans = store.scans.filter((s) => s.tenantId === tenant.id);

  res.json({
    ...tenantView(tenant),
    adminName: tenant.adminName,
    adminEmail: tenant.adminEmail,
    adminPhone: tenant.adminPhone,
    adminUser: effectiveAdmin,
    subscribers,
    devices,
    staff,
    ledger,
    scans,
  });
});

router.patch("/admin/tenants/:id", async (req, res) => 
{

  const user = requireUser(req, res, ["super_admin"])
;
 if (!user) return
;

  const tenant = store.tenants.find((candidate) => candidate.id === req.params.id)
;
 if (!tenant || tenant.isPrivateTenant) return notFound(res)
;

  const before = 
{
 ...tenant 
}
;

  if (req.body?.name !== undefined) tenant.name = String(req.body.name);
  if (req.body?.type !== undefined) tenant.type = String(req.body.type);
  if (req.body?.address !== undefined) tenant.address = String(req.body.address);
  if (req.body?.adminName !== undefined) tenant.adminName = String(req.body.adminName);
  if (req.body?.adminEmail !== undefined) tenant.adminEmail = String(req.body.adminEmail);
  if (req.body?.adminPhone !== undefined) tenant.adminPhone = String(req.body.adminPhone);
  if (req.body?.status === "suspended" || req.body?.status === "active") tenant.status = req.body.status;
  if (req.body?.kioskEnabled !== undefined) tenant.kioskEnabled = Boolean(req.body.kioskEnabled);

  // Update in-memory tenant admin account
  const linkedAdmin = store.users.find((u) => u.tenantId === tenant.id && u.role === "tenant_admin");
  if (linkedAdmin) {
    if (req.body?.adminName) linkedAdmin.name = String(req.body.adminName);
    if (req.body?.adminEmail) linkedAdmin.email = String(req.body.adminEmail);
    if (req.body?.adminPhone !== undefined) linkedAdmin.phone = String(req.body.adminPhone);
  }

  audit(user.id, tenant.status === "suspended" ? "tenant_suspended" : "tenant_updated", "tenant", tenant.id, before, tenant);

  await syncWorkspaceToSupabase(tenant);

  res.json(tenantView(tenant));

}
)
;

router.delete("/admin/tenants/:id", async (req, res) => {
  const user = requireUser(req, res, ["super_admin"]);
  if (!user) return;

  const tenantIndex = store.tenants.findIndex((candidate) => candidate.id === req.params.id);
  if (tenantIndex === -1 || store.tenants[tenantIndex].isPrivateTenant) return notFound(res);

  const tenant = store.tenants[tenantIndex];
  tenant.status = "deleted";

  // Completely erase users, subscribers, devices, and scans belonging to this workspace
  store.users = store.users.filter((u) => u.tenantId !== tenant.id);
  store.subscribers = store.subscribers.filter((s) => s.tenantId !== tenant.id);
  store.devices = store.devices.filter((d) => d.tenantId !== tenant.id);
  store.scans = store.scans.filter((s) => s.tenantId !== tenant.id);
  store.tenants.splice(tenantIndex, 1);

  audit(user.id, "tenant_deleted", "tenant", tenant.id, tenant, null);
  await deleteWorkspaceFromSupabase(tenant.id);

  res.json({ message: "Tenant workspace and all associated accounts completely erased." });
});

router.post("/admin/tenants/:id/credit", (req, res) => 
{

  const user = requireUser(req, res, ["super_admin"])
;
 if (!user) return
;

  const tenant = store.tenants.find((candidate) => candidate.id === req.params.id)
;
 const amount = Number(req.body?.amount ?? 0)
;

  if (!tenant || tenant.isPrivateTenant || amount < 1) return res.status(400).json(
{
 error: "Enter a valid credit amount." 
}
)
;

  tenant.creditBalance += amount
;
 addLedger("tenant", tenant.id, "grant", amount, user.id, req.body?.note ?? "Platform allocation")
;
 audit(user.id, "tenant_credit_allocated", "tenant", tenant.id, 
{
 creditBalance: tenant.creditBalance - amount 
}
, tenant.creditBalance)
;
 void syncWorkspaceToSupabase(tenant);
 res.json(tenantView(tenant))
;

}
)
;

router.get("/admin/tenants/:id/ledger", (req, res) => 
{
 if (!requireUser(req, res, ["super_admin", "platform_staff"])) return
;
 res.json(store.ledger.filter((entry) => entry.ownerId === req.params.id))
;
 
}
)
;

router.get("/admin/analytics", (req, res) => 
{

  const base = 
{
 totalTenants: store.tenants.filter((tenant) => !tenant.isPrivateTenant).length, totalSubscribers: store.subscribers.length, totalScans: store.scans.filter((scan) => scan.status === "completed").length, creditsIssued: store.ledger.filter((entry) => entry.type !== "consume").reduce((sum, entry) => sum + Math.max(0, entry.amount), 0), creditsConsumed: store.ledger.filter((entry) => entry.type === "consume").reduce((sum, entry) => sum + Math.abs(entry.amount), 0), activeTenants: store.tenants.filter((tenant) => tenant.status === "active" && !tenant.isPrivateTenant).length, trend: [1, 2, 3, 4, 5, 6].map((value, index) => (
{
 label: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"][index], scans: 24 + value * 11, credits: 30 + value * 13 
}
)) 
}
;

  res.json(
{
 ...base, topTenants: store.tenants.filter((tenant) => !tenant.isPrivateTenant).map((tenant) => (
{
 name: tenant.name, scans: store.scans.filter((scan) => scan.tenantId === tenant.id && scan.status === "completed").length, credits: store.ledger.filter((entry) => entry.ownerId === tenant.id && entry.type === "consume").reduce((sum, entry) => sum + Math.abs(entry.amount), 0) 
}
)).sort((a, b) => b.scans - a.scans) 
}
)
;

}
)
;

router.get("/admin/private-tenant/subscribers", (req, res) => 
{
 if (!requireUser(req, res, ["super_admin", "platform_staff"])) return
;
 res.json(store.subscribers.filter((subscriber) => subscriber.tenantId === privateTenantId()).map((subscriber) => subscriberView(subscriber)))
;
 
}
)
;

router.get("/admin/private-tenant/topups", (req, res) => 
{
 if (!requireUser(req, res, ["super_admin"])) return
;
 res.json(store.topups.filter((topup) => findSub(topup.subscriberId)?.tenantId === privateTenantId()).map((topup) => (
{
 ...topup, subscriberName: findSub(topup.subscriberId)?.name ?? "Unknown" 
}
)))
;
 
}
)
;

const decideTopup = (req: Request, res: Response, privateOnly: boolean) => 
{

  const user = requireUser(req, res, privateOnly ? ["super_admin"] : ["super_admin", "tenant_admin"])
;
 if (!user) return
;

  const topup = store.topups.find((candidate) => candidate.id === req.params.id)
;
 if (!topup) return notFound(res)
;

  const subscriber = findSub(topup.subscriberId)
;
 if (!subscriber || topup.status !== "pending") return res.status(400).json(
{
 error: "This request has already been decided." 
}
)
;

  const tenant = store.tenants.find((candidate) => candidate.id === subscriber.tenantId)
;
 if (privateOnly !== Boolean(tenant?.isPrivateTenant)) return forbidden(res)
;

  if (!privateOnly && user.tenantId !== subscriber.tenantId) return forbidden(res)
;

  topup.status = req.body?.status === "approved" ? "approved" : "denied"
;
 topup.decidedAt = new Date().toISOString()
;

  if (topup.status === "approved") 
{
 subscriber.creditBalance += topup.amountRequested
;
 addLedger("subscriber", subscriber.id, "grant", topup.amountRequested, user.id, "Approved top-up")
;
 void syncSubscriberToSupabase(subscriber);
}

  notify(subscriber.id, topup.status === "approved" ? "topup_approved" : "topup_denied", `Top-up ${topup.status}`, topup.status === "approved" ? `${topup.amountRequested} scan credits were added.` : "Your credit request was not approved.")
;

  audit(user.id, `topup_${topup.status}`, "topup", topup.id, 
{
 status: "pending" 
}
, topup)
;
 res.json(
{
 ...topup, subscriberName: subscriber.name 
}
)
;

}
;

router.post("/admin/private-tenant/topups/:id/decide", (req, res) => decideTopup(req, res, true))
;

router.get("/admin/platform-staff", (req, res) => 
{
 if (!requireUser(req, res, ["super_admin"])) return
;
 res.json(store.users.filter((user) => user.role === "platform_staff").map((user) => (
{
 id: user.id, name: user.name, email: user.email, role: user.role, subRole: user.subRole, status: user.status 
}
)))
;
 
}
)
;

router.post("/admin/platform-staff", (req, res) => 
{

  const actor = requireUser(req, res, ["super_admin"])
;
 if (!actor) return
;

  const staff = 
{
 id: randomUUID(), tenantId: null, role: "platform_staff" as const, subRole: String(req.body?.subRole ?? "support"), name: String(req.body?.name), email: String(req.body?.email), phone: "", passwordHash: hash("Demo1234!"), status: "active" as const 
}
;

  store.users.push(staff)
;
 audit(actor.id, "platform_staff_created", "user", staff.id, null, 
{
 name: staff.name, email: staff.email, subRole: staff.subRole 
}
)
;
 res.status(201).json(
{
 id: staff.id, name: staff.name, email: staff.email, role: staff.role, subRole: staff.subRole, status: staff.status 
}
)
;

}
)
;

router.patch("/admin/settings", (req, res) => 
{
 const user = requireUser(req, res, ["super_admin"])
;
 if (!user) return
;
 if (req.body?.defaultCreditGrant !== undefined) store.settings.defaultCreditGrant = Math.max(0, Number(req.body.defaultCreditGrant))
;
 if (req.body?.lowCreditThreshold !== undefined) store.settings.lowCreditThreshold = Math.max(0, Number(req.body.lowCreditThreshold))
;
 res.json(store.settings)
;
 
}
)
;


router.get("/tenant/overview", (req, res) => 
{

  const user = requireTenantConsoleUser(req, res)
;
 if (!user) return
;

  const tenant = getTenantForUser(user)
;
 if (!tenant) return notFound(res)
;

  res.json(
{
 tenant: tenantView(tenant), subscribers: store.subscribers.filter((subscriber) => subscriber.tenantId === tenant.id).map((subscriber) => subscriberView(subscriber)), pendingTopups: store.topups.filter((topup) => topup.status === "pending" && findSub(topup.subscriberId)?.tenantId === tenant.id).length, devices: store.devices.filter((device) => device.tenantId === tenant.id) 
}
)
;

}
)
;

router.get("/tenant/subscribers", (req, res) => 
{

  const user = requireTenantConsoleUser(req, res)
;
 if (!user) return
;

  res.json(store.subscribers.filter((subscriber) => subscriber.tenantId === user.tenantId).map((subscriber) => subscriberView(subscriber)))
;

}
)
;

router.post("/tenant/subscribers", (req, res) => 
{

  const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;

  const tenant = getTenantForUser(user)
;
 const amount = Math.max(0, Number(req.body?.initialCredits ?? 0))
;

  if (!tenant || tenant.creditBalance < amount) return res.status(400).json(
{
 error: "Insufficient tenant credit." 
}
)
;

  if (store.subscribers.some((subscriber) => subscriber.tenantId === tenant.id && subscriber.email.toLowerCase() === String(req.body?.email).toLowerCase())) return res.status(400).json(
{
 error: "A subscriber with this email already exists." 
}
)
;

  const subscriber: Subscriber = 
{
 id: randomUUID(), tenantId: tenant.id, name: String(req.body?.name), email: String(req.body?.email), phone: String(req.body?.phone ?? ""), whatsappNumber: String(req.body?.whatsappNumber ?? req.body?.phone ?? ""), nationalIdPassport: req.body?.nationalIdPassport ? String(req.body.nationalIdPassport) : null, dob: String(req.body?.dob ?? ""), sex: String(req.body?.sex ?? ""), heightCm: req.body?.heightCm ? Number(req.body.heightCm) : null, weightKg: req.body?.weightKg ? Number(req.body.weightKg) : null, status: "invited", consentTenantViewResults: false, isGuest: false, creditBalance: amount, createdAt: new Date().toISOString() 
}
;

  store.subscribers.push(subscriber)
;

  store.users.push(
{
 id: randomUUID(), tenantId: subscriber.tenantId, role: "subscriber", subRole: null, name: subscriber.name, email: subscriber.email, phone: subscriber.phone, passwordHash: hash("Demo1234!"), status: "active" 
}
)
;

  tenant.creditBalance -= amount
;
 if (amount) 
{
 addLedger("tenant", tenant.id, "allocate", -amount, user.id, `Allocation to ${subscriber.name}`)
;
 addLedger("subscriber", subscriber.id, "allocate", amount, user.id, "Initial allocation")
;
 
}
 audit(user.id, "subscriber_created", "subscriber", subscriber.id, null, subscriber)
;
 void syncSubscriberToSupabase(subscriber);
 if (tenant) void syncWorkspaceToSupabase(tenant);
 res.status(201).json(subscriberView(subscriber))
;

}
)
;

router.get("/tenant/subscribers/:id", (req, res) => 
{
 const user = requireTenantConsoleUser(req, res)
;
 if (!user) return
;
 const subscriber = findSub(req.params.id)
;
 if (!subscriber || subscriber.tenantId !== user.tenantId) return notFound(res)
;
 res.json(toDetail(subscriber))
;
 
}
)
;

router.patch("/tenant/subscribers/:id", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 const subscriber = findSub(req.params.id)
;
 if (!subscriber || subscriber.tenantId !== user.tenantId) return notFound(res)
;
 const before = 
{
 ...subscriber 
}
;
 Object.assign(subscriber, Object.fromEntries(Object.entries(req.body ?? 
{
}
).filter(([key]) => ["name", "email", "phone", "whatsappNumber", "nationalIdPassport", "dob", "sex", "heightCm", "weightKg", "status", "consentTenantViewResults"].includes(key))))
;
 audit(user.id, req.body?.consentTenantViewResults !== undefined ? "consent_changed" : "subscriber_updated", "subscriber", subscriber.id, before, subscriber)
;
 void syncSubscriberToSupabase(subscriber);
 res.json(subscriberView(subscriber))
;
 
}
)
;

router.post("/tenant/subscribers/:id/credit", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 const subscriber = findSub(req.params.id)
;
 const tenant = getTenantForUser(user)
;
 const amount = Number(req.body?.amount ?? 0)
;
 if (!subscriber || subscriber.tenantId !== user.tenantId || !tenant || amount < 1 || tenant.creditBalance < amount) return res.status(400).json(
{
 error: "Insufficient tenant credit." 
}
)
;
 tenant.creditBalance -= amount
;
 subscriber.creditBalance += amount
;
 addLedger("tenant", tenant.id, "allocate", -amount, user.id, `Allocation to ${subscriber.name}`)
;
 addLedger("subscriber", subscriber.id, "allocate", amount, user.id, "Tenant allocation")
;
 audit(user.id, "subscriber_credit_allocated", "subscriber", subscriber.id, 
{
 creditBalance: subscriber.creditBalance - amount 
}
, subscriber)
;
 void syncSubscriberToSupabase(subscriber);
 void syncWorkspaceToSupabase(tenant);
 res.json(subscriberView(subscriber))
;
 
}
)
;

router.get("/tenant/subscribers/:id/usage", (req, res) => 
{
 const user = requireTenantConsoleUser(req, res)
;
 if (!user) return
;
 const subscriber = findSub(req.params.id)
;
 if (!subscriber || subscriber.tenantId !== user.tenantId) return notFound(res)
;
 res.json(
{
 subscriber: subscriberView(subscriber), scans: store.scans.filter((scan) => scan.subscriberId === subscriber.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((scan) => ({ ...toScan(scan), result: subscriber.consentTenantViewResults ? scan.result ?? null : null, resultRestricted: !subscriber.consentTenantViewResults && scan.status === "completed" })), selfReports: store.selfReports.filter((report) => report.subscriberId === subscriber.id).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map((report) => subscriber.consentTenantViewResults ? { ...report, restricted: false } : { id: report.id, subscriberId: report.subscriberId, recordedAt: report.recordedAt, createdAt: report.createdAt, restricted: true }), latestResult: subscriber.consentTenantViewResults ? store.scans.find((scan) => scan.subscriberId === subscriber.id && scan.status === "completed")?.result ?? null : null
}
)
;
 
}
)
;

router.get("/tenant/subscribers/:id/result", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 const subscriber = findSub(req.params.id)
;
 if (!subscriber || subscriber.tenantId !== user.tenantId) return notFound(res)
;
 if (!subscriber.consentTenantViewResults) 
{
 audit(user.id, "result_view_blocked", "subscriber", subscriber.id, 
{
 consent: false 
}
, null)
;
 return res.status(403).json(
{
 error: "Subscriber consent is required to view clinical result values." 
}
)
;
 
}
 const result = store.scans.find((scan) => scan.subscriberId === subscriber.id && scan.status === "completed")?.result
;
 if (!result) return notFound(res)
;
 audit(user.id, "result_viewed", "subscriber", subscriber.id, null, 
{
 consent: true 
}
)
;
 res.json(result)
;
 
}
)
;

router.get("/tenant/topups", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 res.json(store.topups.filter((topup) => findSub(topup.subscriberId)?.tenantId === user.tenantId).map((topup) => (
{
 ...topup, subscriberName: findSub(topup.subscriberId)?.name ?? "Unknown" 
}
)))
;
 
}
)
;

router.post("/tenant/topups/:id/decide", (req, res) => decideTopup(req, res, false))
;

router.get("/tenant/subusers", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 res.json(store.users.filter((candidate) => candidate.tenantId === user.tenantId && candidate.role === "tenant_subuser").map((candidate) => (
{
 id: candidate.id, name: candidate.name, email: candidate.email, role: candidate.role, subRole: candidate.subRole, status: candidate.status, permissions: candidate.permissions ?? permissionsForRole(candidate.role)
}
)))
;
 
}
)
;

router.post("/tenant/subusers", (req, res) => 
{
 const actor = requireUser(req, res, ["tenant_admin"])
;
 if (!actor) return
;
 const requestedSubRole = String(req.body?.subRole ?? "usage_viewer")
;
 const staff = 
{
 id: randomUUID(), tenantId: actor.tenantId, role: "tenant_subuser" as const, subRole: requestedSubRole === "operator" ? "kiosk_operator" : requestedSubRole, name: String(req.body?.name), email: String(req.body?.email), phone: "", passwordHash: hash("Demo1234!"), status: "active" as const, permissions: normalizePermissionSet(req.body?.permissions)
}
;
 store.users.push(staff)
;
 audit(actor.id, "tenant_subuser_created", "user", staff.id, null, staff)
;
 res.status(201).json(
{
 id: staff.id, name: staff.name, email: staff.email, role: staff.role, subRole: staff.subRole, status: staff.status, permissions: staff.permissions
}
)
;

router.patch("/tenant/subusers/:id", (req, res) => {
  const actor = requireUser(req, res, ["tenant_admin"]);
  if (!actor) return;
  const member = store.users.find((candidate) => candidate.id === req.params.id && candidate.tenantId === actor.tenantId && candidate.role === "tenant_subuser");
  if (!member) return notFound(res);
  const before = { name: member.name, email: member.email, subRole: member.subRole, status: member.status, permissions: member.permissions };
  if (req.body?.name !== undefined) member.name = String(req.body.name);
  if (req.body?.email !== undefined) member.email = String(req.body.email);
  if (req.body?.subRole !== undefined) member.subRole = String(req.body.subRole);
  if (req.body?.status !== undefined && ["active", "suspended"].includes(req.body.status)) member.status = req.body.status;
  if (req.body?.permissions !== undefined) member.permissions = normalizePermissionSet(req.body.permissions);
  audit(actor.id, "tenant_subuser_updated", "user", member.id, before, { name: member.name, email: member.email, subRole: member.subRole, status: member.status, permissions: member.permissions });
  res.json({ id: member.id, name: member.name, email: member.email, role: member.role, subRole: member.subRole, status: member.status, permissions: member.permissions });
});

router.delete("/tenant/subusers/:id", (req, res) => {
  const actor = requireUser(req, res, ["tenant_admin"]);
  if (!actor) return;
  const index = store.users.findIndex((candidate) => candidate.id === req.params.id && candidate.tenantId === actor.tenantId && candidate.role === "tenant_subuser");
  if (index < 0) return notFound(res);
  const [member] = store.users.splice(index, 1);
  audit(actor.id, "tenant_subuser_deleted", "user", member.id, member, null);
  res.status(204).end();
});
 
}
)
;

router.patch("/tenant/profile", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 const tenant = getTenantForUser(user)
;
 if (!tenant) return notFound(res)
;
 Object.assign(tenant, 
{
 name: req.body?.name ?? tenant.name, address: req.body?.address ?? tenant.address 
}
)
;
 audit(user.id, "tenant_profile_updated", "tenant", tenant.id, null, tenant)
;
 void syncWorkspaceToSupabase(tenant);
 res.json(tenantView(tenant))
;
 
}
)
;

router.get("/tenant/settings", (req, res) => {
  const user = requireUser(req, res, ["tenant_admin"]);
  if (!user) return;
  const tenant = getTenantForUser(user);
  if (!tenant) return notFound(res);
  res.json({ kioskCodeConfigured: Boolean(tenant.kioskCodeHash), kioskEnabled: tenant.kioskEnabled });
});

router.patch("/tenant/settings", (req, res) => {
  const user = requireUser(req, res, ["tenant_admin"]);
  if (!user) return;
  const tenant = getTenantForUser(user);
  if (!tenant) return notFound(res);
  const code = String(req.body?.kioskCode ?? "").trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Kiosk code must contain exactly six digits." });
  tenant.kioskCodeHash = hash(code);
  audit(user.id, "kiosk_code_updated", "tenant", tenant.id, null, { kioskCodeConfigured: true });
  void syncWorkspaceToSupabase(tenant);
  res.json({ kioskCodeConfigured: true, kioskEnabled: tenant.kioskEnabled });
});

router.get("/tenant/export/usage.csv", (req, res) => 
{
 const user = requireTenantConsoleUser(req, res)
;
 if (!user) return
;
 const rows = store.scans.filter((scan) => scan.tenantId === user.tenantId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((scan) => {
   const device = scan.deviceId ? store.devices.find((item) => item.id === scan.deviceId) : null;
   const result = scan.result;
   return [scan.subscriberId, scan.id, scan.status, scan.startedAt, scan.completedAt ?? "", scan.deviceId ?? "personal", device?.label ?? "Personal device", scan.operatorUserId ?? scan.subscriberId, result?.hr ?? "", result?.sbp ?? "", result?.dbp ?? "", result?.rr ?? "", result?.spo2 ?? "", result?.stressIndex ?? "", result?.wellnessScore ?? ""].map((value) => JSON.stringify(value)).join(",");
 })
;
 res.type("text/csv").send(["User ID,Scan ID,Status,Started At,Completed At,Device ID,Device Label,Operator User ID,Heart Rate,Systolic BP,Diastolic BP,Respiratory Rate,SpO2,Stress Index,Wellness Score", ...rows].join("\n"))
;
 
}
)
;

router.get("/tenant/devices", (req, res) => 
{
 const user = requireTenantConsoleUser(req, res)
;
 if (!user) return
;
 res.json(store.devices.filter((device) => device.tenantId === user.tenantId).map((device) => ({ ...device, scanCount: store.scans.filter((scan) => scan.deviceId === device.id && scan.status === "completed").length })))
;
 
}
)
;

router.post("/tenant/devices", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin"])
;
 if (!user) return
;
 const device = 
{
 id: randomUUID(), tenantId: user.tenantId!, type: "kiosk" as const, label: String(req.body?.label), location: String(req.body?.location), lastActive: new Date().toISOString(), createdAt: new Date().toISOString()
}
;
 store.devices.push(device)
;
 void syncDeviceToSupabase(device);
 res.status(201).json(device)
;
 
}
)
;


router.get("/subscriber/me", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 if (!subscriber) return notFound(res)
;
 const latestResult = store.scans.filter((scan) => scan.subscriberId === subscriber.id && scan.status === "completed").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.result ?? null
;
 res.json(
{
 ...subscriberView(subscriber), latestResult, notifications: store.notifications.filter((notification) => notification.subscriberId === subscriber.id) 
}
)
;
 
}
)
;

router.patch("/subscriber/me", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 if (!subscriber) return notFound(res)
;
 const before = 
{
 ...subscriber 
}
;
 Object.assign(subscriber, Object.fromEntries(Object.entries(req.body ?? 
{
}
).filter(([key]) => ["name", "email", "phone", "whatsappNumber", "nationalIdPassport", "dob", "sex", "heightCm", "weightKg", "consentTenantViewResults"].includes(key))))
;
 if (req.body?.consentTenantViewResults !== undefined) audit(user.id, "consent_changed", "subscriber", subscriber.id, before, subscriber)
;
 void syncSubscriberToSupabase(subscriber);
 res.json(
{
 ...subscriberView(subscriber), latestResult: null, notifications: store.notifications.filter((notification) => notification.subscriberId === subscriber.id) 
}
)
;
 
}
)
;

router.get("/subscriber/scans", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 if (!subscriber) return notFound(res)
;
 res.json(store.scans.filter((scan) => scan.subscriberId === subscriber.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(toScan))
;
 
}
)
;

router.get("/subscriber/scans/:id", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 const scan = store.scans.find((candidate) => candidate.id === req.params.id && candidate.subscriberId === subscriber?.id)
;
 if (!scan) return notFound(res)
;
 res.json(
{
 ...toScan(scan), result: scan.result ?? null 
}
)
;
 
}
)
;

router.post("/subscriber/scans/start", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 if (!subscriber) return notFound(res)
;
 const missing = getMissingProfileFields(subscriber)
;
 if (missing.length) return res.status(400).json(
{
 error: `Complete your profile before scanning. Missing: ${missing.join(", ")}.`, missingProfileFields: missing 
}
)
;
 if (subscriber.creditBalance < 1) return res.status(400).json(
{
 error: "You have no scan credits remaining. Request a top-up to continue." 
}
)
;
 const scan: Scan = 
{
 id: randomUUID(), subscriberId: subscriber.id, tenantId: subscriber.tenantId, deviceId: null, operatorUserId: user.id, status: "pending", startedAt: new Date().toISOString(), completedAt: null, creditUsed: 0, creditOwnerType: "subscriber"
}
;
 store.scans.push(scan)
;
 void syncScanToSupabase(scan);
 res.status(201).json(toScan(scan))
;
 
}
)
;

router.post("/subscriber/scans/:id/complete", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 const scan = store.scans.find((candidate) => candidate.id === req.params.id && candidate.subscriberId === subscriber?.id)
;
 if (!scan) return notFound(res)
;
 try 
{
 completeScan(scan, req.body ?? 
{
}
, user.id)
;
 void syncScanToSupabase(scan);
 res.json(
{
 ...toScan(scan), result: scan.result 
}
)
;
 
}
 catch (error) 
{
 res.status(400).json(
{
 error: error instanceof Error ? error.message : "Unable to complete scan." 
}
)
;
 
}
 
}
)
;

router.post("/subscriber/scans/:id/abort", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 const scan = store.scans.find((candidate) => candidate.id === req.params.id && candidate.subscriberId === subscriber?.id)
;
 if (!scan) return notFound(res)
;
 scan.status = "aborted"
;
 scan.completedAt = new Date().toISOString()
;
 void syncScanToSupabase(scan);
 res.json(toScan(scan))
;
 
}
)
;

router.post("/subscriber/topups", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 if (!subscriber) return notFound(res)
;
 const topup = 
{
 id: randomUUID(), subscriberId: subscriber.id, amountRequested: Math.max(1, Number(req.body?.amountRequested ?? 10)), status: "pending" as const, createdAt: new Date().toISOString(), decidedAt: null 
}
;
 store.topups.unshift(topup)
;
 notify(subscriber.id, "topup_requested", "Top-up request sent", "Your request is now with your administrator.")
;
 res.status(201).json(
{
 ...topup, subscriberName: subscriber.name 
}
)
;
 
}
)
;

router.get("/subscriber/notifications", (req, res) => 
{
 const user = requireUser(req, res, ["subscriber"])
;
 if (!user) return
;
 const subscriber = getSubscriberForUser(user)
;
 if (!subscriber) return notFound(res)
;
 res.json(store.notifications.filter((notification) => notification.subscriberId === subscriber.id))
;
 
}
)
;

router.post("/subscriber/register", (req, res) => 
{
 const body = req.body ?? 
{
}
;
 if (store.users.some((user) => user.email.toLowerCase() === String(body.email).toLowerCase())) return res.status(400).json(
{
 error: "An account already exists for this email." 
}
)
;
 const subscriber: Subscriber = 
{
 id: randomUUID(), tenantId: privateTenantId(), name: String(body.name), email: String(body.email), phone: String(body.phone ?? ""), whatsappNumber: String(body.whatsappNumber ?? body.phone ?? ""), nationalIdPassport: body.nationalIdPassport ? String(body.nationalIdPassport) : null, dob: String(body.dob ?? ""), sex: String(body.sex ?? ""), heightCm: body.heightCm ? Number(body.heightCm) : null, weightKg: body.weightKg ? Number(body.weightKg) : null, status: "active", consentTenantViewResults: false, isGuest: false, creditBalance: store.settings.defaultCreditGrant, createdAt: new Date().toISOString() 
}
;
 store.subscribers.push(subscriber)
;
 const user = 
{
 id: randomUUID(), tenantId: subscriber.tenantId, role: "subscriber" as const, subRole: null, name: subscriber.name, email: subscriber.email, phone: subscriber.phone, passwordHash: hash(String(body.password ?? "Demo1234!")), status: "active" as const 
}
;
 store.users.push(user)
;
 addLedger("subscriber", subscriber.id, "grant", subscriber.creditBalance, null, "Private tenant self-signup")
;
 void syncSubscriberToSupabase(subscriber);
 const token = randomUUID()
;
 store.sessions.set(token, user.id)
;
 res.setHeader("Set-Cookie", `vitalscan_session=${token}; Path=/; HttpOnly; SameSite=Lax`)
;
 res.status(201).json(
{
 user: publicUser(user), requiresMfa: false 
}
)
;
 
}
)
;

router.post("/kiosk/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const kioskCode = String(req.body?.kioskCode ?? "");
  const deviceId = String(req.body?.deviceId ?? "");
  const user = store.users.find((candidate) => candidate.email.toLowerCase() === email && candidate.passwordHash === hash(password));
  if (!user || !["tenant_admin", "tenant_subuser"].includes(user.role) || user.status !== "active") return res.status(401).json({ error: "Kiosk credentials were not accepted." });
  if (user.role === "tenant_subuser" && user.subRole !== "kiosk_operator") return forbidden(res);
  const tenant = getTenantForUser(user);
  if (!tenant || tenant.status !== "active" || !tenant.kioskEnabled) return res.status(403).json({ error: "Kiosk access is unavailable for this workspace." });
  if (tenant.kioskCodeHash !== hash(kioskCode)) return res.status(401).json({ error: "The kiosk code is incorrect." });
  const device = store.devices.find((candidate) => candidate.id === deviceId && candidate.tenantId === tenant.id);
  if (!device) return res.status(400).json({ error: "The device ID is not registered to this workspace." });
  const token = randomUUID();
  store.sessions.set(token, user.id);
  device.lastActive = new Date().toISOString();
  res.setHeader("Set-Cookie", `vitalscan_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ user: publicUser(user), requiresMfa: false, device });
});

router.post("/kiosk/exit", (req, res) => {
  const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"]);
  if (!user) return;
  const tenant = getTenantForUser(user);
  if (!tenant || tenant.kioskCodeHash !== hash(String(req.body?.kioskCode ?? ""))) return res.status(401).json({ error: "The kiosk code is incorrect." });
  res.json({ message: "Kiosk session unlocked for exit." });
});


router.get("/kiosk/lookup", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"])
;
 if (!user) return
;
 const tenant = getTenantForUser(user)
;
 if (!tenant?.kioskEnabled) return res.status(403).json(
{
 error: "Kiosk access is disabled for this workspace."
}
)
;
 if (user.role === "tenant_subuser" && user.subRole !== "kiosk_operator") return forbidden(res)
;
 const query = String(req.query.query ?? "").toLowerCase()
;
 res.json(store.subscribers.filter((subscriber) => subscriber.tenantId === user.tenantId && [subscriber.name, subscriber.email, subscriber.phone].some((value) => value.toLowerCase().includes(query))).slice(0, 8).map((subscriber) => 
{
 const missingProfileFields = getMissingProfileFields(subscriber)
;
 return ({
   id: subscriber.id,
   name: subscriber.name,
   email: subscriber.email,
   phone: subscriber.phone,
   creditBalance: subscriber.creditBalance,
   isGuest: subscriber.isGuest,
   profileComplete: missingProfileFields.length === 0,
   missingProfileFields,
 })
;
 
}
))
;
 
}
)
;

router.post("/kiosk/guests", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"])
;
 if (!user) return
;
 const tenant = getTenantForUser(user)
;
 if (!tenant?.kioskEnabled) return res.status(403).json(
{
 error: "Kiosk access is disabled for this workspace."
}
)
;
 if (user.role === "tenant_subuser" && user.subRole !== "kiosk_operator") return forbidden(res)
;
 const body = req.body ?? 
{
}
;
 const guest: Subscriber = 
{
 id: randomUUID(), tenantId: user.tenantId!, name: String(body.name ?? "").trim(), email: String(body.email ?? "").trim(), phone: String(body.phone ?? "").trim(), whatsappNumber: String(body.whatsappNumber ?? body.phone ?? "").trim(), nationalIdPassport: body.nationalIdPassport ? String(body.nationalIdPassport).trim() : null, dob: String(body.dob ?? "").trim(), sex: String(body.sex ?? "").trim(), heightCm: Number(body.heightCm) || null, weightKg: Number(body.weightKg) || null, status: "active", consentTenantViewResults: false, isGuest: true, creditBalance: 0, createdAt: new Date().toISOString() 
}
;
 const missingProfileFields = getMissingProfileFields(guest)
;
 if (missingProfileFields.length) return res.status(400).json(
{
 error: `Complete the guest profile. Missing: ${missingProfileFields.join(", ")}.`, missingProfileFields 
}
)
;
 store.subscribers.push(guest)
;
 audit(user.id, "kiosk_guest_created", "subscriber", guest.id, null, guest)
;
 void syncSubscriberToSupabase(guest);
 res.status(201).json(
{
 id: guest.id, name: guest.name, email: guest.email, phone: guest.phone, creditBalance: 0, isGuest: true, profileComplete: true, missingProfileFields: [] 
}
)
;
 
}
)
;

router.post("/kiosk/scans/start", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"])
;
 if (!user) return
;
 if (user.role === "tenant_subuser" && user.subRole !== "kiosk_operator") return forbidden(res)
;
 const subscriber = findSub(String(req.body?.subscriberId))
;
 const tenant = getTenantForUser(user)
;
 if (!subscriber || subscriber.tenantId !== user.tenantId || !tenant) return notFound(res)
;
 if (!tenant.kioskEnabled) return res.status(403).json(
{
 error: "Kiosk access is disabled for this workspace."
}
)
;
 const missing = getMissingProfileFields(subscriber)
;
 if (missing.length) return res.status(400).json(
{
 error: `Complete the profile before scanning. Missing: ${missing.join(", ")}.`, missingProfileFields: missing 
}
)
;
 if (tenant.creditBalance < 1) return res.status(400).json(
{
 error: "This workspace has no kiosk credits remaining." 
}
)
;
 const scan: Scan = 
{
 id: randomUUID(), subscriberId: subscriber.id, tenantId: subscriber.tenantId, deviceId: String(req.body?.deviceId || store.devices.find((device) => device.tenantId === user.tenantId)?.id || ""), operatorUserId: user.id, status: "pending", startedAt: new Date().toISOString(), completedAt: null, creditUsed: 0, creditOwnerType: "tenant"
}
;
 if (!store.devices.some((device) => device.id === scan.deviceId && device.tenantId === user.tenantId)) return res.status(400).json({ error: "Select a registered workspace device." })
;
 store.scans.push(scan)
;
 void syncScanToSupabase(scan);
 res.status(201).json(toScan(scan))
;
 
}
)
;

router.post("/kiosk/scans/:id/complete", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"])
;
 if (!user) return
;
 if (user.role === "tenant_subuser" && user.subRole !== "kiosk_operator") return forbidden(res)
;
 const scan = store.scans.find((candidate) => candidate.id === req.params.id && candidate.tenantId === user.tenantId)
;
 if (!scan) return notFound(res)
;
 try 
{
 completeScan(scan, req.body ?? 
{
}
, user.id)
;
 res.json(toScan(scan))
;
 
}
 catch (error) 
{
 res.status(400).json(
{
 error: error instanceof Error ? error.message : "Unable to complete kiosk scan." 
}
)
;
 
}
 
}
)
;

router.post("/kiosk/scans/:id/abort", (req, res) => 
{
 const user = requireUser(req, res, ["tenant_admin", "tenant_subuser"])
;
 if (!user) return
;
 if (user.role === "tenant_subuser" && user.subRole !== "kiosk_operator") return forbidden(res)
;
 const scan = store.scans.find((candidate) => candidate.id === req.params.id && candidate.tenantId === user.tenantId)
;
 if (!scan) return notFound(res)
;
 scan.status = "aborted"
;
 scan.completedAt = new Date().toISOString()
;
 res.json(toScan(scan))
;
 
}
)
;

router.get("/subscriber/self-reports", (req, res) => {
  const user = requireUser(req, res, ["subscriber"]);
  if (!user) return;
  const subscriber = getSubscriberForUser(user);
  if (!subscriber) return notFound(res);
  res.json(store.selfReports.filter((report) => report.subscriberId === subscriber.id).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)));
});

router.post("/subscriber/self-reports", (req, res) => {
  const user = requireUser(req, res, ["subscriber"]);
  if (!user) return;
  const subscriber = getSubscriberForUser(user);
  if (!subscriber) return notFound(res);
  const numeric = (value: unknown) => value === "" || value === null || value === undefined ? null : Number(value);
  const report: SelfReport = {
    id: randomUUID(),
    subscriberId: subscriber.id,
    recordedAt: String(req.body?.recordedAt || new Date().toISOString()),
    heartRate: numeric(req.body?.heartRate),
    systolicBp: numeric(req.body?.systolicBp),
    diastolicBp: numeric(req.body?.diastolicBp),
    spo2: numeric(req.body?.spo2),
    respiratoryRate: numeric(req.body?.respiratoryRate),
    temperatureC: numeric(req.body?.temperatureC),
    symptoms: Array.isArray(req.body?.symptoms) ? req.body.symptoms.map(String).slice(0, 12) : [],
    notes: req.body?.notes ? String(req.body.notes).slice(0, 1000) : null,
    createdAt: new Date().toISOString(),
  };
  if (![report.heartRate, report.systolicBp, report.diastolicBp, report.spo2, report.respiratoryRate, report.temperatureC].some((value) => value !== null) && report.symptoms.length === 0 && !report.notes) {
    return res.status(400).json({ error: "Add at least one vital sign, symptom, or note." });
  }
  store.selfReports.push(report);
  audit(user.id, "self_report_created", "self_report", report.id, null, { recordedAt: report.recordedAt, fieldsReported: Object.entries(report).filter(([, value]) => value !== null && value !== "" && (!Array.isArray(value) || value.length)).map(([key]) => key) });
  void syncSelfReportToSupabase(report);
  res.status(201).json(report);
});


export default router
;
