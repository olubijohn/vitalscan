import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import type { Tenant, Subscriber, Device, Scan, ScanResult, SelfReport, LedgerEntry, Store } from "./store";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (err) {
    logger.warn({ err, filePath }, "Could not read env file");
  }
}

// Load env files from possible locations
loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), "../../.env"));
loadEnvFile(resolve(process.cwd(), "../../.env.local"));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!client && supabaseUrl && supabaseKey) {
    try {
      client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      logger.info({ url: supabaseUrl }, "Supabase client initialized for VitalScan backend CRUD");
    } catch (err) {
      logger.error({ err }, "Failed to initialize Supabase client");
    }
  }
  return client;
}

export async function syncWorkspaceToSupabase(tenant: Tenant) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const payload = {
      id: tenant.id,
      name: tenant.name,
      type: tenant.type,
      address: tenant.address || "",
      admin_name: tenant.adminName || "",
      admin_email: tenant.adminEmail || "",
      admin_phone: tenant.adminPhone || "",
      credit_balance: tenant.creditBalance,
      kiosk_enabled: tenant.kioskEnabled,
      status: tenant.status,
      created_at: tenant.createdAt,
    };

    // Try tenants table first, fallback to workspaces
    let { error } = await sb.from("tenants").upsert(payload, { onConflict: "id" });
    if (error) {
      const { error: wsErr } = await sb.from("workspaces").upsert(payload, { onConflict: "id" });
      if (wsErr) {
        logger.warn({ wsErr, tenantId: tenant.id }, "Supabase sync: tenant/workspace upsert failed");
      }
    }

    if (tenant.adminEmail) {
      try {
        let authUserId: string | null = null;
        const { data: userList } = await sb.auth.admin.listUsers();
        const existingAuth = (userList?.users as any[])?.find((u: any) => u.email?.toLowerCase() === tenant.adminEmail!.toLowerCase());
        if (existingAuth) {
          authUserId = existingAuth.id;
        } else {
          const { data: newUser, error: createAuthErr } = await sb.auth.admin.createUser({
            email: tenant.adminEmail,
            password: "Demo1234!",
            email_confirm: true,
            user_metadata: {
              full_name: tenant.adminName || "Workspace Admin",
              role: "tenant_admin",
              workspace_id: tenant.id,
            },
          });
          if (newUser?.user) {
            authUserId = newUser.user.id;
          } else if (createAuthErr) {
            logger.warn({ createAuthErr }, "Could not create Supabase auth user for tenant admin");
          }
        }

        if (authUserId) {
          await sb.from("profiles").upsert({
            id: authUserId,
            email: tenant.adminEmail,
            full_name: tenant.adminName || "Workspace Admin",
            phone: tenant.adminPhone || null,
            role: "tenant_admin",
            workspace_id: tenant.id,
          }, { onConflict: "id" });

          await sb.from("workspace_members").upsert({
            workspace_id: tenant.id,
            user_id: authUserId,
            role: "tenant_admin",
          }, { onConflict: "workspace_id,user_id" });
        }
      } catch (authErr) {
        logger.warn({ authErr }, "Error syncing Supabase tenant admin auth user");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on workspace");
  }
}

export async function deleteWorkspaceFromSupabase(id: string) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    // Find members and profiles linked to this workspace
    const { data: members } = await sb.from("workspace_members").select("user_id").eq("workspace_id", id);
    if (members && members.length > 0) {
      for (const m of members) {
        if (m.user_id) {
          try {
            await sb.auth.admin.deleteUser(m.user_id);
          } catch {}
          try {
            await sb.from("profiles").delete().eq("id", m.user_id);
          } catch {}
        }
      }
      await sb.from("workspace_members").delete().eq("workspace_id", id);
    }

    // Delete subscribers, devices, scans
    await sb.from("subscribers").delete().eq("workspace_id", id);
    await sb.from("devices").delete().eq("workspace_id", id);
    await sb.from("scans").delete().eq("workspace_id", id);
    await sb.from("tenants").delete().eq("id", id);
    await sb.from("workspaces").delete().eq("id", id);
    logger.info({ workspaceId: id }, "Supabase tenant/workspace and linked members completely erased");
  } catch (err) {
    logger.warn({ err }, "Supabase sync error deleting workspace");
  }
}

export async function syncSubscriberToSupabase(subscriber: Subscriber) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from("subscribers").upsert({
      id: subscriber.id,
      workspace_id: subscriber.tenantId,
      full_name: subscriber.name,
      email: subscriber.email || "",
      phone: subscriber.phone || "",
      whatsapp_number: subscriber.whatsappNumber || "",
      date_of_birth: subscriber.dob || null,
      biological_sex: subscriber.sex || null,
      height_cm: subscriber.heightCm ? Math.round(subscriber.heightCm) : null,
      weight_kg: subscriber.weightKg ? Number(subscriber.weightKg) : null,
      national_id_passport: subscriber.nationalIdPassport || null,
      consent_tenant_view_results: Boolean(subscriber.consentTenantViewResults),
      is_guest: Boolean(subscriber.isGuest),
      status: subscriber.status,
      created_at: subscriber.createdAt,
    }, { onConflict: "id" });
    if (error) logger.warn({ error, subscriberId: subscriber.id }, "Supabase sync: subscribers upsert failed");
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on subscriber");
  }
}

export async function syncDeviceToSupabase(device: Device) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from("devices").upsert({
      id: device.id,
      workspace_id: device.tenantId,
      device_code: device.id.slice(0, 8).toUpperCase(),
      label: device.label,
      type: device.type || "camera",
      location: device.location || "",
      status: "active",
      last_active_at: device.lastActive,
      created_at: device.createdAt,
    }, { onConflict: "id" });
    if (error) logger.warn({ error, deviceId: device.id }, "Supabase sync: devices upsert failed");
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on device");
  }
}

export async function syncScanToSupabase(scan: Scan, result?: ScanResult) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error: sErr } = await sb.from("scans").upsert({
      id: scan.id,
      workspace_id: scan.tenantId,
      subscriber_id: scan.subscriberId,
      device_id: scan.deviceId || null,
      operator_user_id: scan.operatorUserId || null,
      status: scan.status,
      source: "camera",
      credit_owner_type: scan.creditOwnerType,
      credit_used: scan.creditUsed,
      started_at: scan.startedAt,
      completed_at: scan.completedAt || null,
    }, { onConflict: "id" });
    if (sErr) logger.warn({ sErr, scanId: scan.id }, "Supabase sync: scans upsert failed");

    if (result && scan.status === "completed") {
      const { error: rErr } = await sb.from("scan_results").upsert({
        id: result.id,
        scan_id: scan.id,
        heart_rate: result.hr,
        respiratory_rate: result.rr,
        systolic_bp: result.sbp,
        diastolic_bp: result.dbp,
        oxygen_saturation: result.spo2,
        stress_index: result.stressIndex,
        wellness_score: result.wellnessScore,
        cardiovascular_age: result.cardiovascularAge,
        cvd_risk_percentage: result.cvdRiskPercentage,
        telemetry: result.healthRadar || {},
        signal_quality: result.signalQuality || {},
        low_confidence_flags: result.lowConfidenceFlags || [],
        created_at: result.createdAt || new Date().toISOString(),
      }, { onConflict: "id" });
      if (rErr) logger.warn({ rErr, scanId: scan.id }, "Supabase sync: scan_results upsert failed");
    }
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on scan");
  }
}

export async function syncSelfReportToSupabase(report: SelfReport) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from("self_reports").upsert({
      id: report.id,
      subscriber_id: report.subscriberId,
      recorded_at: report.recordedAt,
      heart_rate: report.heartRate,
      systolic_bp: report.systolicBp,
      diastolic_bp: report.diastolicBp,
      oxygen_saturation: report.spo2,
      respiratory_rate: report.respiratoryRate,
      symptoms: Array.isArray(report.symptoms) ? report.symptoms.join(", ") : report.symptoms || null,
      notes: report.notes || null,
      created_at: report.createdAt,
    }, { onConflict: "id" });
    if (error) logger.warn({ error, reportId: report.id }, "Supabase sync: self_reports upsert failed");
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on self report");
  }
}

export async function syncLedgerToSupabase(entry: LedgerEntry) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("credit_ledger").insert({
      id: entry.id,
      workspace_id: entry.ownerType === "tenant" ? entry.ownerId : null,
      subscriber_id: entry.ownerType === "subscriber" ? entry.ownerId : null,
      amount: entry.amount,
      entry_type: entry.type === "allocate" ? "grant" : entry.type === "consume" ? "consume" : "grant",
      created_by: entry.actorUserId || null,
      created_at: entry.createdAt,
    });
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on credit ledger");
  }
}

export async function syncAuditToSupabase(actorUserId: string | null, action: string, resourceType: string, resourceId: string, metadata: unknown) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("audit_logs").insert({
      actor_user_id: actorUserId || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      metadata: metadata || {},
    });
  } catch (err) {
    logger.warn({ err }, "Supabase sync error on audit log");
  }
}

/**
 * Hydrates the in-memory store from Supabase on startup so that
 * any data previously saved in Supabase is preserved and live.
 */
export async function hydrateFromSupabase(store: Store) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    // Try tenants first, fallback to workspaces
    let tRes = await sb.from("tenants").select("*");
    if (tRes.error || !tRes.data) {
      tRes = await sb.from("workspaces").select("*");
    }

    const [sRes, dRes, scRes, srRes, mRes, pRes, aRes] = await Promise.all([
      sb.from("subscribers").select("*"),
      sb.from("devices").select("*"),
      sb.from("scans").select("*, scan_results(*)"),
      sb.from("self_reports").select("*"),
      sb.from("workspace_members").select("*"),
      sb.from("profiles").select("*"),
      sb.from("audit_logs").select("*").eq("action", "tenant_created"),
    ]);

    const tenantRows = tRes.data || [];
    if (tenantRows.length > 0) {
      for (const row of tenantRows) {
        // find audit log or member profile for this workspace
        const auditLog = aRes.data?.find((a: any) => a.resource_id === row.id || a.metadata?.id === row.id || a.metadata?.after?.id === row.id);
        const auditAdmin = auditLog?.metadata?.adminEmail || auditLog?.metadata?.after?.adminEmail;
        const auditName = auditLog?.metadata?.adminName || auditLog?.metadata?.after?.adminName;
        const auditPhone = auditLog?.metadata?.adminPhone || auditLog?.metadata?.after?.adminPhone;

        const member = mRes.data?.find((m: any) => m.workspace_id === row.id && m.role === "tenant_admin");
        const profile = pRes.data?.find((p: any) => p.id === member?.user_id || p.id === row.id);

        const adminEmail = row.admin_email || profile?.email || auditAdmin || "";
        const adminName = row.admin_name || profile?.full_name || auditName || "Workspace Admin";
        const adminPhone = row.admin_phone || profile?.phone || auditPhone || "";

        const existing = store.tenants.find((t) => t.id === row.id);
        if (existing) {
          existing.name = row.name;
          existing.type = row.type;
          existing.address = row.address;
          existing.creditBalance = row.credit_balance;
          existing.kioskEnabled = row.kiosk_enabled;
          existing.status = row.status;
          if (adminEmail) existing.adminEmail = adminEmail;
          if (adminName) existing.adminName = adminName;
          if (adminPhone) existing.adminPhone = adminPhone;
        } else {
          store.tenants.push({
            id: row.id,
            name: row.name,
            type: row.type || "Corporate",
            address: row.address || "",
            adminName: adminName || undefined,
            adminEmail: adminEmail || undefined,
            adminPhone: adminPhone || undefined,
            creditBalance: row.credit_balance || 0,
            kioskEnabled: Boolean(row.kiosk_enabled),
            kioskCodeHash: "",
            isPrivateTenant: false,
            status: row.status || "active",
            createdAt: row.created_at || new Date().toISOString(),
          });
        }

        if (adminEmail && !store.users.some((u) => u.email.toLowerCase() === adminEmail.toLowerCase() && u.tenantId === row.id)) {
          store.users.push({
            id: member?.user_id || row.id,
            tenantId: row.id,
            role: "tenant_admin",
            subRole: "full_admin",
            name: adminName,
            email: adminEmail,
            phone: adminPhone,
            passwordHash: createHash("sha256").update("Demo1234!").digest("hex"),
            status: "active",
          });
        }
      }
      logger.info({ count: tenantRows.length }, "Hydrated tenants and tenant admins from Supabase");
    }

    if (sRes.data && sRes.data.length > 0) {
      for (const row of sRes.data) {
        const existing = store.subscribers.find((s) => s.id === row.id);
        if (existing) {
          existing.name = row.full_name;
          existing.email = row.email;
          existing.phone = row.phone;
          existing.whatsappNumber = row.whatsapp_number;
          existing.dob = row.date_of_birth || "";
          existing.sex = row.biological_sex || "";
          existing.heightCm = row.height_cm;
          existing.weightKg = row.weight_kg;
          existing.consentTenantViewResults = Boolean(row.consent_tenant_view_results);
          existing.status = row.status;
        } else {
          store.subscribers.push({
            id: row.id,
            tenantId: row.workspace_id,
            name: row.full_name,
            email: row.email || "",
            phone: row.phone || "",
            whatsappNumber: row.whatsapp_number || "",
            nationalIdPassport: row.national_id_passport || null,
            dob: row.date_of_birth || "",
            sex: row.biological_sex || "",
            heightCm: row.height_cm,
            weightKg: row.weight_kg,
            consentTenantViewResults: Boolean(row.consent_tenant_view_results),
            isGuest: Boolean(row.is_guest),
            creditBalance: 5,
            status: row.status || "active",
            createdAt: row.created_at || new Date().toISOString(),
          });
        }
      }
      logger.info({ count: sRes.data.length }, "Hydrated subscribers from Supabase");
    }

    if (dRes.data && dRes.data.length > 0) {
      for (const row of dRes.data) {
        if (!store.devices.some((d) => d.id === row.id)) {
          store.devices.push({
            id: row.id,
            tenantId: row.workspace_id,
            label: row.label,
            location: row.location || "",
            type: row.type || "kiosk",
            lastActive: row.last_active_at || row.created_at,
            createdAt: row.created_at,
          });
        }
      }
    }

    if (srRes.data && srRes.data.length > 0) {
      for (const row of srRes.data) {
        if (!store.selfReports.some((r) => r.id === row.id)) {
          store.selfReports.push({
            id: row.id,
            subscriberId: row.subscriber_id,
            recordedAt: row.recorded_at,
            heartRate: row.heart_rate,
            systolicBp: row.systolic_bp,
            diastolicBp: row.diastolic_bp,
            spo2: row.oxygen_saturation,
            respiratoryRate: row.respiratory_rate,
            temperatureC: null,
            symptoms: row.symptoms ? row.symptoms.split(",").map((s: string) => s.trim()) : [],
            notes: row.notes || null,
            createdAt: row.created_at,
          });
        }
      }
    }

    if (scRes.data && scRes.data.length > 0) {
      for (const row of scRes.data) {
        if (!store.scans.some((sc) => sc.id === row.id)) {
          const scanObj: Scan = {
            id: row.id,
            tenantId: row.workspace_id,
            subscriberId: row.subscriber_id,
            deviceId: row.device_id,
            operatorUserId: row.operator_user_id,
            status: row.status,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            creditUsed: row.credit_used || 1,
            creditOwnerType: row.credit_owner_type || "subscriber",
          };
          const res = Array.isArray(row.scan_results) ? row.scan_results[0] : row.scan_results;
          if (res) {
            scanObj.result = {
              id: res.id,
              scanId: row.id,
              hr: res.heart_rate || 72,
              rr: res.respiratory_rate || 16,
              sbp: res.systolic_bp || 120,
              dbp: res.diastolic_bp || 80,
              spo2: res.oxygen_saturation || 98,
              stressIndex: res.stress_index || 40,
              wellnessScore: res.wellness_score || 8.0,
              cardiovascularAge: res.cardiovascular_age || 35,
              cvdRiskPercentage: res.cvd_risk_percentage || 2.5,
              healthRadar: res.telemetry || {},
              signalQuality: res.signal_quality || {},
              lowConfidenceFlags: res.low_confidence_flags || [],
              isMock: false,
              createdAt: res.created_at,
            };
          }
          store.scans.push(scanObj);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Error hydrating store from Supabase");
  }
}
