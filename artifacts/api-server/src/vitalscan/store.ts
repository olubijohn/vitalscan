import { createHash, randomUUID } from "node:crypto";
import { syncAuditToSupabase, syncLedgerToSupabase, hydrateFromSupabase } from "./supabase";

export type Role = "super_admin" | "platform_staff" | "tenant_admin" | "tenant_subuser" | "subscriber";
export type TenantStatus = "active" | "suspended" | "deleted";
export type TopupStatus = "pending" | "approved" | "denied";
export type PermissionAction = "read" | "write" | "update" | "delete";
export type PermissionResource = "workspace" | "team" | "subscribers" | "scans" | "credits" | "devices" | "self_reports" | "settings";
export type PermissionSet = Record<PermissionResource, PermissionAction[]>;
export const permissionResources: PermissionResource[] = ["workspace", "team", "subscribers", "scans", "credits", "devices", "self_reports", "settings"];
export const allPermissionActions: PermissionAction[] = ["read", "write", "update", "delete"];
export const permissionsForRole = (role: Role): PermissionSet => {
  const full = Object.fromEntries(permissionResources.map((resource) => [resource, [...allPermissionActions]])) as PermissionSet;
  if (role === "tenant_subuser") return { ...full, workspace: ["read"], team: [], subscribers: ["read"], scans: ["read", "write"], credits: [], devices: ["read"], self_reports: [], settings: [] };
  if (role === "subscriber") return { ...full, workspace: [], team: [], subscribers: ["read", "update"], scans: ["read", "write"], credits: ["read", "write"], devices: [], self_reports: ["read", "write", "update", "delete"], settings: [] };
  return full;
};

export interface User {
  id: string;
  tenantId: string | null;
  role: Role;
  subRole: string | null;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  status: "active" | "invited" | "suspended";
  permissions?: PermissionSet;
}

export interface Tenant {
  id: string;
  name: string;
  type: string;
  address: string;
  adminName?: string;
  adminEmail?: string;
  adminPhone?: string;
  status: TenantStatus;
  creditBalance: number;
  kioskEnabled: boolean;
  kioskCodeHash: string;
  isPrivateTenant: boolean;
  createdAt: string;
}

export interface Subscriber {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  nationalIdPassport: string | null;
  dob: string;
  sex: string;
  heightCm: number | null;
  weightKg: number | null;
  status: "invited" | "active" | "suspended";
  consentTenantViewResults: boolean;
  isGuest: boolean;
  creditBalance: number;
  createdAt: string;
}

export interface Scan {
  id: string;
  subscriberId: string;
  tenantId: string;
  deviceId: string | null;
  operatorUserId: string | null;
  status: "pending" | "completed" | "aborted" | "failed";
  startedAt: string;
  completedAt: string | null;
  creditUsed: number;
  creditOwnerType: "tenant" | "subscriber";
  result?: ScanResult;
}

export interface ScanResult {
  id: string;
  scanId: string;
  hr: number;
  rr: number;
  sbp: number;
  dbp: number;
  spo2: number;
  stressIndex: number;
  wellnessScore: number;
  cardiovascularAge: number;
  cvdRiskPercentage: number;
  healthRadar: Record<string, number>;
  signalQuality: Record<string, number>;
  lowConfidenceFlags: string[];
  isMock: boolean;
  createdAt: string;
}

export interface SelfReport {
  id: string;
  subscriberId: string;
  recordedAt: string;
  heartRate: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  spo2: number | null;
  respiratoryRate: number | null;
  temperatureC: number | null;
  symptoms: string[];
  notes: string | null;
  createdAt: string;
}

export interface Topup {
  id: string;
  subscriberId: string;
  amountRequested: number;
  status: TopupStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface Device {
  id: string;
  tenantId: string;
  type: "kiosk" | "mobile";
  label: string;
  location: string;
  lastActive: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  ownerType: "platform" | "tenant" | "subscriber";
  ownerId: string;
  type: "grant" | "allocate" | "consume" | "refund" | "purchase";
  amount: number;
  note: string | null;
  actorUserId: string | null;
  relatedScanId: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string | null;
  subscriberId: string | null;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface Store {
  users: User[];
  tenants: Tenant[];
  subscribers: Subscriber[];
  scans: Scan[];
  topups: Topup[];
  devices: Device[];
  ledger: LedgerEntry[];
  selfReports: SelfReport[];
  notifications: Notification[];
  audit: AuditEntry[];
  sessions: Map<string, string>;
  settings: { defaultCreditGrant: number; lowCreditThreshold: number };
}

const now = Date.now();
const iso = (offsetDays = 0) => new Date(now - offsetDays * 86400000).toISOString();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const id = () => randomUUID();

export function makeVitals(age = 34, seed = Math.random()): Omit<ScanResult, "id" | "scanId" | "createdAt"> {
  const n = (min: number, max: number, bias = 0.5) => Math.round((min + (max - min) * ((seed + bias) % 1)) * 10) / 10;
  const hr = n(62, 88, 0.13);
  const rr = n(12, 18, 0.31);
  const sbp = n(108, 128, 0.42);
  const dbp = n(68, 84, 0.53);
  return {
    hr, rr, sbp, dbp, spo2: n(95, 99, 0.22),
    stressIndex: n(35, 180, 0.61),
    wellnessScore: n(7.2, 9.6, 0.77),
    cardiovascularAge: Math.max(18, Math.min(85, Math.round(age + n(-7, 7, 0.17)))),
    cvdRiskPercentage: n(2, 8, 0.39),
    healthRadar: { health: n(3.5, 4.8, 0.11), sleep: n(3.1, 4.7, 0.21), metabolism: n(3.2, 4.8, 0.34), equilibrium: n(3.4, 4.9, 0.45), activity: n(3, 4.8, 0.56), relaxation: n(2.9, 4.8, 0.68) },
    signalQuality: { hr_hrv: n(0.78, 0.97, 0.12), bp: n(0.76, 0.94, 0.28), resp: n(0.8, 0.98, 0.43), spo2: n(0.75, 0.96, 0.63) },
    lowConfidenceFlags: [],
    isMock: true,
  };
}

export function createStore(): Store {
  const privateTenant: Tenant = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Private / Direct Subscribers",
    type: "Private",
    address: "Cloud System",
    status: "active",
    creditBalance: 1000,
    kioskEnabled: false,
    kioskCodeHash: hash("482913"),
    isPrivateTenant: true,
    createdAt: new Date().toISOString(),
  };

  const users: User[] = [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      tenantId: null,
      role: "super_admin",
      subRole: null,
      name: "Dr. Admin",
      email: "admin@vitalscan.com",
      phone: "+1 555 0100",
      passwordHash: hash("Password123!"),
      status: "active",
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      tenantId: null,
      role: "super_admin",
      subRole: null,
      name: "Super Administrator",
      email: "admin@vitalscan.demo",
      phone: "+1 555 0101",
      passwordHash: hash("Demo1234!"),
      status: "active",
    },
  ];

  return {
    users,
    tenants: [privateTenant],
    subscribers: [],
    scans: [],
    topups: [],
    devices: [],
    ledger: [],
    selfReports: [],
    audit: [],
    sessions: new Map(),
    notifications: [],
    settings: { defaultCreditGrant: 10, lowCreditThreshold: 2 },
  };
}

export const store = createStore();

export function publicUser(user: User, storeRef = store) {
  const tenant = user.tenantId ? storeRef.tenants.find((item) => item.id === user.tenantId) : null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, subRole: user.subRole, tenantId: user.tenantId, tenantName: tenant?.name ?? null, permissions: user.permissions ?? permissionsForRole(user.role) };
}

export function subscriberView(subscriber: Subscriber, storeRef = store) {
  const scans = storeRef.scans.filter((scan) => scan.subscriberId === subscriber.id);
  const missingProfileFields = getMissingProfileFields(subscriber);
  return { ...subscriber, profileComplete: missingProfileFields.length === 0, missingProfileFields, creditsUsed: scans.filter((scan) => scan.status === "completed").length, scansRun: scans.filter((scan) => scan.status === "completed").length, lastScanDate: scans.filter((scan) => scan.status === "completed").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.completedAt ?? null };
}

export function getMissingProfileFields(subscriber: Pick<Subscriber, "name" | "whatsappNumber" | "dob" | "sex">) {
  return [
    !subscriber.name.trim() && "name",
    !subscriber.whatsappNumber.trim() && "WhatsApp number",
    !subscriber.dob.trim() && "date of birth",
    !subscriber.sex.trim() && "sex",
  ].filter((field): field is string => Boolean(field));
}

export function tenantView(tenant: Tenant, storeRef = store) {
  const subs = storeRef.subscribers.filter((s) => s.tenantId === tenant.id);
  const { kioskCodeHash: _kioskCodeHash, ...safeTenant } = tenant;
  return { ...safeTenant, kioskCodeConfigured: Boolean(tenant.kioskCodeHash), subscriberCount: subs.length, creditsConsumed: storeRef.ledger.filter((l) => l.ownerType === "subscriber" && subs.some((s) => s.id === l.ownerId) && l.type === "consume").reduce((sum, l) => sum + Math.abs(l.amount), 0), lastActive: storeRef.scans.filter((s) => s.tenantId === tenant.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.startedAt ?? null };
}

export function audit(actorUserId: string | null, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
  const entry: AuditEntry = { id: id(), actorUserId, action, targetType, targetId, before, after, createdAt: new Date().toISOString() };
  store.audit.unshift(entry);
  void syncAuditToSupabase(actorUserId, action, targetType, targetId, { before, after });
}

export function notify(subscriberId: string, type: string, title: string, message: string) {
  store.notifications.unshift({ id: id(), userId: null, subscriberId, type, title, message, read: false, createdAt: new Date().toISOString() });
}

export function addLedger(ownerType: LedgerEntry["ownerType"], ownerId: string, type: LedgerEntry["type"], amount: number, actorUserId: string | null, note: string | null, relatedScanId: string | null = null) {
  const entry: LedgerEntry = { id: id(), ownerType, ownerId, type, amount, actorUserId, note, relatedScanId, createdAt: new Date().toISOString() };
  store.ledger.unshift(entry);
  void syncLedgerToSupabase(entry);
}

export function toScan(scan: Scan) {
  return { id: scan.id, subscriberId: scan.subscriberId, status: scan.status, startedAt: scan.startedAt, completedAt: scan.completedAt, deviceLabel: scan.deviceId ? store.devices.find((d) => d.id === scan.deviceId)?.label ?? null : null, creditUsed: scan.creditUsed, creditOwnerType: scan.creditOwnerType };
}

export const privateTenantId = () => store.tenants.find((tenant) => tenant.isPrivateTenant)!.id;

// Hydrate on startup
void hydrateFromSupabase(store);