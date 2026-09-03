/*
 * VitalScanSupabase.jsx
 * Portable single-file React frontend for a Supabase-backed PreCURE app.
 *
 * Install:
 *   npm install react @supabase/supabase-js
 *
 * Required environment variables:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * This file assumes the tables, views, RPCs, and RLS policies described in
 * VitalScan-Supabase-Migration-Guide.md. The FaceHeart/FHVitals browser SDK
 * is intentionally required at scan time; this file never silently invents
 * clinical readings when the SDK is unavailable.
 */

import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
);

const COLUMNS = {
  profile: "id,full_name,email,phone,whatsapp_number,date_of_birth,biological_sex,role,workspace_id,status",
  subscriber: "id,workspace_id,user_id,full_name,email,phone,whatsapp_number,date_of_birth,biological_sex,height_cm,weight_kg,national_id_passport,consent_tenant_view_results,is_guest,status,created_at",
  device: "id,workspace_id,device_code,label,type,location,status,last_active_at,created_at",
  scan: "id,workspace_id,subscriber_id,device_id,operator_user_id,status,source,credit_owner_type,credit_used,started_at,completed_at",
  result: "id,scan_id,heart_rate,respiratory_rate,systolic_bp,diastolic_bp,oxygen_saturation,stress_index,wellness_score,cardiovascular_age,cvd_risk_percentage,telemetry,signal_quality,low_confidence_flags,created_at",
  report: "id,subscriber_id,recorded_at,heart_rate,respiratory_rate,systolic_bp,diastolic_bp,oxygen_saturation,stress_index,wellness_score,symptoms,notes,created_by,created_at",
};

const fmt = (value) =>
  value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const shortDate = (value) => (value ? new Date(value).toLocaleDateString([], { dateStyle: "medium" }) : "—");
const esc = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const idLabel = (value) => (value ? value.slice(0, 8).toUpperCase() : "—");

function App() {
  const kioskMode = new URLSearchParams(window.location.search).get("kiosk") === "1";
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) setProfile(await loadProfile(data.session.user.id));
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      setProfile(next?.user ? await loadProfile(next.user.id) : null);
      setLoading(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (kioskMode) return <KioskLogin />;
  if (loading) return <Page><Card><h2>Loading PreCURE…</h2></Card></Page>;
  if (!session) return <Login />;
  if (!profile) return <Page><Card><h2>Profile unavailable</h2><p className="muted">Your authenticated account has no PreCURE profile.</p><Button onClick={() => supabase.auth.signOut()}>Sign out</Button></Card></Page>;

  return (
    <Page>
      <Header profile={profile} onSignOut={() => supabase.auth.signOut()} />
      {profile.role === "subscriber" ? <SubscriberPortal profile={profile} /> : <WorkspaceConsole profile={profile} />}
    </Page>
  );
}

async function loadProfile(userId) {
  const { data, error: queryError } = await supabase.from("profiles").select(COLUMNS.profile).eq("id", userId).single();
  if (queryError) throw queryError;
  return data;
}

function KioskLogin() {
  const [form, setForm] = useState({ email: "", password: "", kioskCode: "", deviceId: "" });
  const [unlocked, setUnlocked] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function unlock(event) {
    event.preventDefault(); setBusy(true); setError("");
    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    if (authError || !auth.user) { setError(authError?.message || "Kiosk credentials were not accepted."); setBusy(false); return; }
    const user = await loadProfile(auth.user.id);
    if (!["tenant_admin", "kiosk_operator", "tenant_staff"].includes(user.role) || !user.workspace_id) { await supabase.auth.signOut(); setError("This account is not authorized to operate a kiosk."); setBusy(false); return; }
    const { data: allowed, error: accessError } = await supabase.rpc("verify_kiosk_access", { p_workspace_id: user.workspace_id, p_kiosk_code: form.kioskCode, p_device_id: form.deviceId });
    if (accessError || !allowed) { await supabase.auth.signOut(); setError(accessError?.message || "The kiosk code, workspace, or device ID is invalid."); setBusy(false); return; }
    setUnlocked({ user, deviceId: form.deviceId });
    setBusy(false);
  }
  if (unlocked) return <KioskConsole operator={unlocked.user} deviceId={unlocked.deviceId} onExit={async (code) => { const { data } = await supabase.rpc("verify_kiosk_access", { p_workspace_id: unlocked.user.workspace_id, p_kiosk_code: code, p_device_id: unlocked.deviceId }); if (!data) return false; await supabase.auth.signOut(); setUnlocked(null); return true; }} />;
  return <Page narrow><div className="brand"><span className="brandMark">V</span><span>Vital<span className="accent">Scan</span></span></div><Card><p className="eyebrow">Protected station</p><h1>Unlock kiosk</h1><p className="muted">Use your workspace credentials, the six-digit kiosk code, and the UUID of the registered device.</p><form onSubmit={unlock} className="stack"><Input label="Operator email" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} /><Input label="Password" type="password" required value={form.password} onChange={(v) => setForm({ ...form, password: v })} /><Input label="Kiosk code" inputMode="numeric" pattern="[0-9]{6}" required value={form.kioskCode} onChange={(v) => setForm({ ...form, kioskCode: v })} /><Input label="Registered device UUID" required value={form.deviceId} onChange={(v) => setForm({ ...form, deviceId: v })} />{error && <Notice>{error}</Notice>}<Button disabled={busy}>{busy ? "Unlocking…" : "Open kiosk"}</Button></form></Card></Page>;
}

function KioskConsole({ operator, deviceId, onExit }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const [code, setCode] = useState("");
  const [exitError, setExitError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.length < 2) { setPeople([]); return; }
    supabase.from("subscribers").select("id,full_name,email,phone,credit_balance").eq("workspace_id", operator.workspace_id).or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`).limit(8).then(({ data }) => setPeople(data || []));
  }, [query, operator.workspace_id]);
  async function startScan() {
    if (!selected) return;
    setBusy(true);
    if (!window.FHVitals || typeof window.FHVitals.measure !== "function") { alert("The official FaceHeart/FHVitals SDK is not loaded."); setBusy(false); return; }
    const { data: scan, error } = await supabase.from("scans").insert({ workspace_id: operator.workspace_id, subscriber_id: selected.id, device_id: deviceId, operator_user_id: operator.id, source: "camera", credit_owner_type: "tenant", credit_used: 1, status: "pending" }).select(COLUMNS.scan).single();
    if (error) { alert(error.message); setBusy(false); return; }
    try {
      const measurement = await window.FHVitals.measure({ subscriberId: selected.id, deviceId });
      const { error: resultError } = await supabase.from("scan_results").insert({ scan_id: scan.id, ...normalizeMeasurement(measurement) });
      if (resultError) throw resultError;
      await supabase.from("scans").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", scan.id);
      alert("Scan completed. Results are stored in the subscriber record.");
    } catch (scanError) {
      await supabase.from("scans").update({ status: "aborted" }).eq("id", scan.id);
      alert(scanError.message || "Scan failed.");
    }
    setBusy(false);
  }
  async function exit(event) {
    event.preventDefault(); setExitError("");
    if (!await onExit(code)) setExitError("The kiosk code is incorrect.");
  }
  return <Page><header className="header"><div><div className="brand"><span className="brandMark">V</span><span>Vital<span className="accent">Scan</span></span></div><p className="muted">Device {idLabel(deviceId)} · Results are not shown on this station.</p></div><form onSubmit={exit} className="headerRight"><Input label="Exit code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={setCode} /> <Button variant="secondary">Exit</Button></form></header>{exitError && <Notice>{exitError}</Notice>}<Card><p className="eyebrow">Subscriber check-in</p><h1>Start a private scan</h1><Input label="Search subscriber" value={query} onChange={setQuery} placeholder="Name, email, or phone" />{people.map((person) => <button className="directoryRow" key={person.id} onClick={() => setSelected(person)}><span className="avatar">U</span><span className="historyMain"><b>User {idLabel(person.id)}</b><small>{person.email}</small></span></button>)}{selected && <div className="scanState">Selected user {idLabel(selected.id)}<br /><Button onClick={startScan} disabled={busy}>{busy ? "Measuring…" : "Begin scan"}</Button></div>}</Card></Page>;
}

function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", fullName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
      : await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { full_name: form.fullName } } });
    if (result.error) setError(result.error.message);
    else if (mode === "signup") setError("Account created. Check your email if confirmation is enabled.");
    setBusy(false);
  }

  return (
    <Page narrow>
      <div className="brand"><span className="brandMark">V</span><span>Vital<span className="accent">Scan</span></span></div>
      <Card>
        <p className="eyebrow">Private wellness platform</p>
        <h1>{mode === "login" ? "Welcome back." : "Create your account."}</h1>
        <p className="muted">Access your personal health history or your workspace console.</p>
        <form onSubmit={submit} className="stack">
          {mode === "signup" && <Input label="Full name" required value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />}
          <Input label="Email" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input label="Password" type="password" required minLength={8} value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          {error && <Notice tone={error.startsWith("Account") ? "success" : "danger"}>{error}</Notice>}
          <Button disabled={busy}>{busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}</Button>
        </form>
        <button className="linkButton" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
        </button>
      </Card>
      <SdkNotice />
    </Page>
  );
}

function Header({ profile, onSignOut }) {
  return <header className="header"><div className="brand"><span className="brandMark">V</span><span>Vital<span className="accent">Scan</span></span></div><div className="headerRight"><span className="rolePill">{profile.role.replaceAll("_", " ")}</span><span className="muted">{profile.full_name || profile.email}</span><button className="ghostButton" onClick={onSignOut}>Sign out</button></div></header>;
}

function SubscriberPortal({ profile }) {
  const [tab, setTab] = useState("overview");
  const [subscriber, setSubscriber] = useState(null);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);

  async function refresh() {
    setBusy(true);
    const { data, error } = await supabase.from("subscribers").select(COLUMNS.subscriber).eq("user_id", profile.id).single();
    if (error) setNotice(error.message);
    else {
      setSubscriber(data);
      setHistory(await loadCombinedHistory(data.id, true));
    }
    setBusy(false);
  }
  useEffect(() => { refresh(); }, [profile.id]);

  if (busy && !subscriber) return <Card><h2>Loading your record…</h2></Card>;
  if (!subscriber) return <Card><h2>Subscriber record not found</h2><p className="muted">Ask a workspace administrator to provision your record.</p></Card>;
  return <main>
    <div className="tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Health history</button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile & consent</button></div>
    {notice && <Notice>{notice}</Notice>}
    {tab === "overview" && <SubscriberOverview subscriber={subscriber} history={history} onScan={() => setTab("scan")} onSelect={setSelected} />}
    {tab === "history" && <CombinedHistory history={history} onSelect={setSelected} onAddReport={() => setTab("report")} />}
    {tab === "profile" && <SubscriberProfile subscriber={subscriber} onSaved={refresh} />}
    {tab === "scan" && <ScanPanel subscriber={subscriber} onDone={refresh} onBack={() => setTab("overview")} />}
    {tab === "report" && <SelfReportForm subscriber={subscriber} onDone={refresh} onBack={() => setTab("history")} />}
    {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
  </main>;
}

function SubscriberOverview({ subscriber, history, onScan, onSelect, }) {
  const latest = history[0];
  return <><section className="hero"><div><p className="eyebrow">Your latest signal</p><h1>Small check-in.<br /><span className="accent">Clearer next step.</span></h1><p className="muted">{latest ? `Last activity ${shortDate(latest.at)}.` : "Start building your personal baseline."}</p><Button onClick={onScan} disabled={!subscriber.profile_complete && false}>Start camera scan</Button></div><div className="score"><strong>{latest?.result?.wellness_score ?? "—"}</strong><span>wellness / 10</span></div></section><div className="grid two"><Card><div className="cardTitle"><h2>Recent activity</h2><button className="linkButton" onClick={() => document.querySelector(".tabs button:nth-child(2)")?.click()}>View all</button></div>{history.slice(0, 4).map((item) => <HistoryRow key={item.key} item={item} onClick={() => onSelect(item)} />)}{!history.length && <Empty text="No health activity yet." />}</Card><Card><h2>Privacy controls</h2><p className="muted">Workspace result sharing is currently <b>{subscriber.consent_tenant_view_results ? "on" : "off"}</b>.</p><button className="linkButton" onClick={() => document.querySelector(".tabs button:nth-child(3)")?.click()}>Manage consent</button></Card></div></>;
}

function SubscriberProfile({ subscriber, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(subscriber);
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true);
    const { error } = await supabase.from("subscribers").update({
      full_name: form.full_name, phone: form.phone, whatsapp_number: form.whatsapp_number,
      date_of_birth: form.date_of_birth, biological_sex: form.biological_sex, height_cm: form.height_cm,
      weight_kg: form.weight_kg, national_id_passport: form.national_id_passport,
      consent_tenant_view_results: form.consent_tenant_view_results,
    }).eq("id", subscriber.id);
    if (error) alert(error.message); else { setEditing(false); onSaved(); }
    setBusy(false);
  }
  return <Card><div className="cardTitle"><div><p className="eyebrow">Personal record</p><h2>Profile & consent</h2></div>{!editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}</div><form onSubmit={save} className="formGrid">{["full_name", "phone", "whatsapp_number", "date_of_birth", "biological_sex", "height_cm", "weight_kg", "national_id_passport"].map((field) => <Input key={field} label={field.replaceAll("_", " ")} type={field === "date_of_birth" ? "date" : "text"} disabled={!editing} value={form[field] || ""} onChange={(value) => setForm({ ...form, [field]: value })} />)}<label className={`consent ${!editing ? "disabled" : ""}`}><input type="checkbox" disabled={!editing} checked={Boolean(form.consent_tenant_view_results)} onChange={(event) => setForm({ ...form, consent_tenant_view_results: event.target.checked })} /><span><b>Share results with my workspace</b><small>When off, staff can see that a scan occurred but not captured readings.</small></span></label>{editing && <div className="actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button><Button type="button" variant="secondary" onClick={() => { setForm(subscriber); setEditing(false); }}>Cancel</Button></div>}</form></Card>;
}

function CombinedHistory({ history, onSelect, onAddReport }) {
  return <Card><div className="cardTitle"><div><p className="eyebrow">Combined record</p><h2>Camera scans & manual entries</h2></div><Button variant="secondary" onClick={onAddReport}>Add manual entry</Button></div>{history.map((item) => <HistoryRow key={item.key} item={item} onClick={() => onSelect(item)} />)}{!history.length && <Empty text="Your combined history will appear here." />}</Card>;
}

function HistoryRow({ item, onClick }) {
  return <button className="historyRow" onClick={onClick}><span className={`historyIcon ${item.kind}`}>{item.kind === "scan" ? "◉" : "✎"}</span><span className="historyMain"><b>{item.kind === "scan" ? "Camera scan" : "Manual health entry"}</b><small>{fmt(item.at)} · {item.device?.label || item.source || "Personal record"}</small></span><span className="historyValue">{item.restricted ? "Private" : item.result?.wellness_score ? `${item.result.wellness_score}/10` : "View details"}<br /><small>{item.kind === "scan" ? item.status : "Self-report"}</small></span></button>;
}

async function loadCombinedHistory(subscriberId, includeResults) {
  const [{ data: scans }, { data: reports }] = await Promise.all([
    supabase.from("scans").select(`${COLUMNS.scan},scan_results(${COLUMNS.result})`).eq("subscriber_id", subscriberId).order("started_at", { ascending: false }),
    supabase.from("self_reports").select(COLUMNS.report).eq("subscriber_id", subscriberId).order("recorded_at", { ascending: false }),
  ]);
  const deviceIds = (scans || []).map((s) => s.device_id).filter(Boolean);
  const { data: devices } = deviceIds.length ? await supabase.from("devices").select(COLUMNS.device).in("id", deviceIds) : { data: [] };
  const deviceMap = Object.fromEntries((devices || []).map((d) => [d.id, d]));
  return [
    ...(scans || []).map((scan) => ({ key: `scan-${scan.id}`, kind: "scan", at: scan.started_at, status: scan.status, scan, device: deviceMap[scan.device_id], result: includeResults ? (Array.isArray(scan.scan_results) ? scan.scan_results[0] : scan.scan_results) : null, restricted: !includeResults })),
    ...(reports || []).map((report) => ({ key: `report-${report.id}`, kind: "report", at: report.recorded_at, report, result: includeResults ? report : null, restricted: !includeResults })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
}

function DetailModal({ item, onClose }) {
  const result = item.result;
  return <div className="modalBackdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="cardTitle"><div><p className="eyebrow">{item.kind === "scan" ? "Camera scan" : "Manual entry"}</p><h2>{fmt(item.at)}</h2></div><button className="close" onClick={onClose}>×</button></div>{item.restricted ? <Notice>Readings are private because workspace sharing is disabled.</Notice> : <div className="metricGrid">{[["Heart rate", result?.heart_rate, "bpm"], ["Blood pressure", result?.systolic_bp && `${result.systolic_bp}/${result.diastolic_bp}`, "mmHg"], ["Respiratory rate", result?.respiratory_rate, "brpm"], ["Oxygen saturation", result?.oxygen_saturation, "%"], ["Stress", result?.stress_index, ""], ["Wellness", result?.wellness_score, "/10"]].map(([label, value, unit]) => <div className="metric" key={label}><small>{label}</small><strong>{value ?? "—"} <em>{unit}</em></strong></div>)}</div>}{item.kind === "scan" && <dl className="details"><dt>Device</dt><dd>{item.device?.label || "Personal camera"} {item.device?.id && `(${idLabel(item.device.id)})`}</dd><dt>Source</dt><dd>{item.scan.source || "camera"}</dd><dt>Credit owner</dt><dd>{item.scan.credit_owner_type}</dd><dt>Operator</dt><dd>{idLabel(item.scan.operator_user_id)}</dd></dl>}{item.kind === "report" && <dl className="details"><dt>Symptoms</dt><dd>{item.report.symptoms || "None recorded"}</dd><dt>Notes</dt><dd>{item.report.notes || "None recorded"}</dd></dl>}</div></div>;
}

function SelfReportForm({ subscriber, onDone, onBack }) {
  const [form, setForm] = useState({ recorded_at: new Date().toISOString().slice(0, 16), heart_rate: "", systolic_bp: "", diastolic_bp: "", respiratory_rate: "", oxygen_saturation: "", stress_index: "", wellness_score: "", symptoms: "", notes: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, ["symptoms", "notes", "recorded_at"].includes(key) ? value : value === "" ? null : Number(value)]));
    const { error } = await supabase.from("self_reports").insert({ ...payload, subscriber_id: subscriber.id, created_by: subscriber.user_id });
    if (error) alert(error.message); else onDone();
    setBusy(false);
  }
  return <Card><div className="cardTitle"><h2>Manual health entry</h2><Button variant="secondary" onClick={onBack}>Back</Button></div><form onSubmit={submit} className="formGrid">{Object.keys(form).filter((key) => !["symptoms", "notes"].includes(key)).map((key) => <Input key={key} label={key.replaceAll("_", " ")} type={key === "recorded_at" ? "datetime-local" : "number"} value={form[key]} onChange={(value) => setForm({ ...form, [key]: value })} />)}<Input label="Symptoms" value={form.symptoms} onChange={(value) => setForm({ ...form, symptoms: value })} /><Input label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} /><Button disabled={busy}>{busy ? "Saving…" : "Save entry"}</Button></form></Card>;
}

function ScanPanel({ subscriber, onDone, onBack }) {
  const [status, setStatus] = useState("ready");
  const [error, setError] = useState("");
  async function start() {
    setStatus("starting"); setError("");
    if (!window.FHVitals || typeof window.FHVitals.measure !== "function") { setStatus("ready"); setError("The official FaceHeart/FHVitals SDK is not loaded. Configure its browser script and adapter before starting a real scan."); return; }
    const { data: scan, error: insertError } = await supabase.from("scans").insert({ subscriber_id: subscriber.id, source: "camera", credit_owner_type: "subscriber", credit_used: 1, status: "pending" }).select(COLUMNS.scan).single();
    if (insertError) { setError(insertError.message); setStatus("ready"); return; }
    try {
      const measurement = await window.FHVitals.measure({ subscriberId: subscriber.id });
      const { error: resultError } = await supabase.from("scan_results").insert({ scan_id: scan.id, ...normalizeMeasurement(measurement) });
      if (resultError) throw resultError;
      await supabase.from("scans").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", scan.id);
      onDone();
    } catch (scanError) {
      await supabase.from("scans").update({ status: "aborted" }).eq("id", scan.id);
      setError(scanError.message || "The scan could not be completed."); setStatus("ready");
    }
  }
  return <Card><div className="cardTitle"><h2>Camera scan</h2><Button variant="secondary" onClick={onBack}>Back</Button></div><p className="muted">The official FaceHeart/FHVitals SDK must be present. PreCURE does not use synthetic fallback readings.</p>{error && <Notice>{error}</Notice>}<div className="scanState">{status === "starting" ? "Preparing secure measurement…" : "Ready when you are."}</div><Button onClick={start} disabled={status === "starting"}>{status === "starting" ? "Measuring…" : "Start measurement"}</Button></Card>;
}

function normalizeMeasurement(value) {
  return { heart_rate: value.heart_rate ?? value.hr, respiratory_rate: value.respiratory_rate ?? value.rr, systolic_bp: value.systolic_bp ?? value.sbp, diastolic_bp: value.diastolic_bp ?? value.dbp, oxygen_saturation: value.oxygen_saturation ?? value.spo2, stress_index: value.stress_index ?? value.stressIndex, wellness_score: value.wellness_score ?? value.wellnessScore, cardiovascular_age: value.cardiovascular_age ?? value.cardiovascularAge, cvd_risk_percentage: value.cvd_risk_percentage ?? value.cvdRiskPercentage, telemetry: value.telemetry ?? value.healthRadar ?? {}, signal_quality: value.signal_quality ?? value.signalQuality ?? {}, low_confidence_flags: value.low_confidence_flags ?? value.lowConfidenceFlags ?? [] };
}

function WorkspaceConsole({ profile }) {
  const [tab, setTab] = useState("subscribers");
  const [workspace, setWorkspace] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [settings, setSettings] = useState({ kiosk_code: "", kiosk_enabled: true });
  const [notice, setNotice] = useState("");
  const canManage = ["tenant_admin", "super_admin"].includes(profile.role);
  async function refresh() {
    const [{ data: workspaceData }, { data: subscriberData }, { data: deviceData }] = await Promise.all([
      supabase.from("workspaces").select("id,name,type,address,status,kiosk_enabled,credit_balance").eq("id", profile.workspace_id).single(),
      supabase.from("subscribers").select(COLUMNS.subscriber).eq("workspace_id", profile.workspace_id).order("created_at", { ascending: false }),
      supabase.from("devices").select(COLUMNS.device).eq("workspace_id", profile.workspace_id).order("created_at", { ascending: false }),
    ]);
    setWorkspace(workspaceData); setSubscribers(subscriberData || []); setDevices(deviceData || []);
  }
  useEffect(() => { refresh(); }, [profile.workspace_id]);
  return <main><div className="tabs"><button className={tab === "subscribers" ? "active" : ""} onClick={() => setTab("subscribers")}>Subscribers</button><button className={tab === "devices" ? "active" : ""} onClick={() => setTab("devices")}>Devices</button><button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Reports</button>{canManage && <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Workspace settings</button>}</div>{notice && <Notice>{notice}</Notice>}{tab === "subscribers" && <WorkspaceSubscribers subscribers={subscribers} onSelect={setSelected} />}{tab === "devices" && <DeviceManager workspaceId={profile.workspace_id} devices={devices} onSaved={refresh} canManage={canManage} />}{tab === "reports" && <ReportPanel workspaceId={profile.workspace_id} />}{tab === "settings" && <KioskSettings workspace={workspace} settings={settings} setSettings={setSettings} onSaved={(message) => setNotice(message)} />}{selected && <WorkspaceSubscriberModal subscriber={selected} onClose={() => setSelected(null)} />}</main>;
}

function WorkspaceSubscribers({ subscribers, onSelect }) {
  return <Card><div className="cardTitle"><div><p className="eyebrow">Workspace directory</p><h2>Subscribers</h2></div><span className="rolePill">{subscribers.length} records</span></div>{subscribers.map((subscriber) => <button className="directoryRow" key={subscriber.id} onClick={() => onSelect(subscriber)}><span className="avatar">{(subscriber.full_name || "U").slice(0, 1)}</span><span className="historyMain"><b>{subscriber.consent_tenant_view_results ? subscriber.full_name : `User ${idLabel(subscriber.id)}`}</b><small>{subscriber.email} · {subscriber.is_guest ? "Guest" : "Subscriber"}</small></span><span className="historyValue">{subscriber.status}</span></button>)}{!subscribers.length && <Empty text="No subscribers in this workspace." />}</Card>;
}

function WorkspaceSubscriberModal({ subscriber, onClose }) {
  const [history, setHistory] = useState([]);
  useEffect(() => { loadCombinedHistory(subscriber.id, subscriber.consent_tenant_view_results).then(setHistory); }, [subscriber.id, subscriber.consent_tenant_view_results]);
  return <div className="modalBackdrop" onClick={onClose}><div className="modal wide" onClick={(event) => event.stopPropagation()}><div className="cardTitle"><div><p className="eyebrow">Privacy-aware history</p><h2>{subscriber.consent_tenant_view_results ? subscriber.full_name : `User ${idLabel(subscriber.id)}`}</h2><p className="muted">{subscriber.consent_tenant_view_results ? "Results shared by the subscriber." : "Readings masked; activity timestamps remain visible."}</p></div><button className="close" onClick={onClose}>×</button></div>{history.map((item) => <HistoryRow key={item.key} item={item} onClick={() => {}} />)}{!history.length && <Empty text="No activity recorded." />}</div></div>;
}

function DeviceManager({ workspaceId, devices, onSaved, canManage }) {
  const [form, setForm] = useState({ label: "", type: "camera", location: "" });
  const [busy, setBusy] = useState(false);
  async function add(event) {
    event.preventDefault(); setBusy(true);
    const { error } = await supabase.from("devices").insert({ ...form, workspace_id: workspaceId, device_code: `VS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: "active" });
    if (error) alert(error.message); else { setForm({ label: "", type: "camera", location: "" }); onSaved(); }
    setBusy(false);
  }
  return <div className="grid two"><Card><div className="cardTitle"><h2>Registered devices</h2></div>{devices.map((device) => <div className="deviceRow" key={device.id}><div><b>{device.label}</b><small>{device.device_code} · {device.location || "No location"}</small></div><span className="rolePill">{device.status}</span></div>)}{!devices.length && <Empty text="Create the first kiosk device." />}</Card>{canManage && <Card><h2>Add device</h2><form onSubmit={add} className="stack"><Input label="Device name" required value={form.label} onChange={(v) => setForm({ ...form, label: v })} /><Input label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} /><Input label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} /><Button disabled={busy}>{busy ? "Creating…" : "Create device & allocate ID"}</Button></form></Card>}</div>;
}

function KioskSettings({ workspace, settings, setSettings, onSaved }) {
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc("set_workspace_kiosk_code", { p_workspace_id: workspace.id, p_kiosk_code: settings.kiosk_code, p_kiosk_enabled: settings.kiosk_enabled });
    if (error) onSaved(error.message); else onSaved("Kiosk settings saved.");
    setBusy(false);
  }
  return <Card><p className="eyebrow">Protected kiosk access</p><h2>Workspace settings</h2><p className="muted">Set a six-digit code. Operators still need their account password and a registered device ID.</p><form onSubmit={save} className="stack"><Input label="New kiosk code" required minLength={6} maxLength={6} value={settings.kiosk_code} onChange={(v) => setSettings({ ...settings, kiosk_code: v })} /><label className="consent"><input type="checkbox" checked={settings.kiosk_enabled} onChange={(e) => setSettings({ ...settings, kiosk_enabled: e.target.checked })} /><span><b>Enable kiosk access</b><small>{workspace?.kiosk_enabled ? "Kiosk is currently enabled." : "Kiosk is currently disabled."}</small></span></label><Button disabled={busy}>{busy ? "Saving…" : "Save kiosk settings"}</Button></form></Card>;
}

function ReportPanel({ workspaceId }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    const [{ data: scans }, { data: devices }] = await Promise.all([
      supabase.from("scans").select(`${COLUMNS.scan},scan_results(${COLUMNS.result})`).eq("workspace_id", workspaceId).order("started_at", { ascending: false }),
      supabase.from("devices").select(COLUMNS.device).eq("workspace_id", workspaceId),
    ]);
    const deviceMap = Object.fromEntries((devices || []).map((d) => [d.id, d]));
    const lines = (scans || []).map((scan) => { const r = Array.isArray(scan.scan_results) ? scan.scan_results[0] : scan.scan_results; const d = deviceMap[scan.device_id]; return [scan.subscriber_id, scan.id, scan.status, scan.started_at, scan.completed_at, d?.device_code || "personal", d?.label || "Personal camera", scan.operator_user_id || scan.subscriber_id, r?.heart_rate, r?.systolic_bp, r?.diastolic_bp, r?.respiratory_rate, r?.oxygen_saturation, r?.stress_index, r?.wellness_score].map(esc).join(","); });
    const csv = ["User ID,Scan ID,Status,Started At,Completed At,Device ID,Device Name,Operator User ID,Heart Rate,Systolic BP,Diastolic BP,Respiratory Rate,SpO2,Stress Index,Wellness Score", ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = `vitalscan-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); setBusy(false);
  }
  return <Card><p className="eyebrow">Privacy-safe export</p><h2>Workspace reporting</h2><p className="muted">Exports use subscriber and operator IDs, device IDs, timestamps, and captured telemetry. Names are not included.</p><Button onClick={download} disabled={busy}>{busy ? "Preparing…" : "Download CSV report"}</Button></Card>;
}

function SdkNotice() { return <p className="sdkNotice">Real scans require the official FaceHeart/FHVitals browser SDK. The exported app intentionally has no silent mock fallback.</p>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }
function Notice({ children, tone = "danger" }) { return <div className={`notice ${tone}`}>{children}</div>; }
function Input({ label, value, onChange, disabled, ...props }) { return <label className="input"><span>{label}</span><input {...props} disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>; }
function Button({ children, variant = "primary", ...props }) { return <button className={`button ${variant}`} {...props}>{children}</button>; }
function Card({ children, className = "" }) { return <section className={`card ${className}`}>{children}</section>; }
function Page({ children, narrow }) { return <div className={`app ${narrow ? "narrow" : ""}`}><style>{CSS}</style>{children}</div>; }

const CSS = `
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172a3a;background:#f6f9fb;line-height:1.45}
*{box-sizing:border-box}body{margin:0}.app{min-height:100vh;max-width:1180px;margin:auto;padding:28px 28px 64px}.app.narrow{max-width:520px;padding-top:12vh}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}.headerRight{display:flex;align-items:center;gap:14px}.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800;letter-spacing:-.04em}.brandMark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#0e8790;color:white}.accent{color:#0e8790}.muted{color:#71808c}.eyebrow{color:#0e8790;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;margin:0 0 8px}.rolePill{background:#e6f3f1;color:#0a7178;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;text-transform:capitalize}.hero{display:flex;justify-content:space-between;align-items:center;background:#e5f4f1;border-radius:24px;padding:42px;margin-bottom:22px}.hero h1{font-size:48px;line-height:1.02;letter-spacing:-.06em;margin:0 0 16px}.score{width:164px;height:164px;border-radius:50%;background:white;display:grid;place-content:center;text-align:center;box-shadow:0 16px 40px #0e87901a}.score strong{font-size:48px;line-height:1}.score span{font-size:12px;color:#71808c}.card{background:white;border:1px solid #e4eaee;border-radius:18px;padding:24px;box-shadow:0 10px 30px #19324708;margin-bottom:22px}.card h1,.card h2{margin:0 0 8px;letter-spacing:-.04em}.card h2{font-size:21px}.grid{display:grid;gap:22px}.grid.two{grid-template-columns:1.2fr .8fr}.cardTitle{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:16px}.tabs{display:flex;gap:6px;border-bottom:1px solid #dfe7eb;margin-bottom:22px;overflow:auto}.tabs button{border:0;background:none;padding:12px 16px;color:#71808c;font-weight:700;white-space:nowrap;cursor:pointer}.tabs button.active{color:#0e8790;border-bottom:2px solid #0e8790}.button{border:0;border-radius:11px;padding:11px 16px;font-weight:800;cursor:pointer}.button:disabled{opacity:.5;cursor:not-allowed}.button.primary{background:#0e8790;color:white}.button.secondary,.ghostButton{background:#edf3f5;color:#28505b}.ghostButton{border:0;border-radius:9px;padding:8px 12px;cursor:pointer}.linkButton{border:0;background:none;color:#0e8790;font-weight:800;cursor:pointer;padding:4px 0}.stack{display:grid;gap:15px}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.input{display:grid;gap:6px;color:#526572;font-size:12px;font-weight:800;text-transform:capitalize}.input input{width:100%;border:1px solid #d7e1e6;border-radius:10px;padding:11px 12px;font:inherit;color:#172a3a;background:white}.input input:disabled{background:#f5f8f9;color:#71808c}.formGrid .consent,.formGrid .actions,.formGrid>.button{grid-column:1/-1}.consent{display:flex;gap:10px;align-items:flex-start;padding:15px;border:1px solid #dce7ea;border-radius:12px}.consent.disabled{background:#f5f8f9}.consent input{margin-top:3px;accent-color:#0e8790}.consent span{display:grid;gap:3px}.consent small{color:#71808c}.notice{padding:12px 14px;border-radius:10px;background:#fff1ef;color:#aa463d;margin-bottom:16px}.notice.success{background:#e8f7ef;color:#28704b}.historyRow,.directoryRow{width:100%;display:flex;align-items:center;gap:13px;border:0;border-top:1px solid #edf1f3;background:white;text-align:left;padding:14px 2px;cursor:pointer}.historyRow:hover,.directoryRow:hover{background:#f7fbfb}.historyIcon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#e8f5f3;color:#0e8790}.historyIcon.report{background:#f7efe5;color:#a86326}.historyMain{display:grid;gap:3px;flex:1}.historyMain b{font-size:14px}.historyMain small,.deviceRow small{color:#71808c}.historyValue{text-align:right;color:#0e8790;font-weight:800}.historyValue small{font-weight:600;color:#71808c}.empty{text-align:center;padding:34px 10px;color:#84939c}.metricGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.metric{background:#f3f8f8;border-radius:12px;padding:14px}.metric small{display:block;color:#71808c}.metric strong{font-size:21px}.metric em{font-size:11px;font-style:normal;color:#71808c}.details{display:grid;grid-template-columns:130px 1fr;gap:8px;border-top:1px solid #edf1f3;padding-top:16px}.details dt{color:#71808c}.details dd{margin:0;font-weight:700}.modalBackdrop{position:fixed;inset:0;background:#132b3b80;display:grid;place-items:center;padding:20px;z-index:5}.modal{background:white;border-radius:18px;padding:24px;width:min(600px,100%);max-height:90vh;overflow:auto}.modal.wide{width:min(760px,100%)}.close{background:none;border:0;font-size:28px;color:#71808c;cursor:pointer}.scanState{padding:34px;text-align:center;border-radius:14px;background:#eef6f6;margin:20px 0;color:#0e7178;font-weight:800}.deviceRow{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #edf1f3;padding:14px 0}.deviceRow div{display:grid;gap:3px}.avatar{width:36px;height:36px;border-radius:50%;background:#dcefed;color:#0e7178;display:grid;place-items:center;font-weight:800}.sdkNotice{font-size:12px;color:#71808c;text-align:center;margin-top:20px}.linkButton:focus-visible,.button:focus-visible,input:focus-visible{outline:3px solid #8ed5d2;outline-offset:2px}
@media(max-width:700px){.app{padding:18px 14px 44px}.header{align-items:flex-start;gap:14px}.headerRight{flex-wrap:wrap;justify-content:flex-end;gap:7px}.headerRight .muted{display:none}.hero{padding:28px 22px;display:block}.hero h1{font-size:38px}.score{margin:28px auto 0;width:130px;height:130px}.grid.two,.formGrid{grid-template-columns:1fr}.metricGrid{grid-template-columns:1fr 1fr}.formGrid .consent,.formGrid .actions,.formGrid>.button{grid-column:auto}}
`;

createRoot(document.getElementById("root")).render(<App />);