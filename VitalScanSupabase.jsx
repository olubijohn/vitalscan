/*
 * VitalScanSupabase.jsx
 * Portable single-file React frontend for a Supabase-backed VitalScan app.
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

const rawUrl = import.meta.env.VITE_SUPABASE_URL || "";
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const isConfigured = Boolean(rawUrl && rawKey && !rawUrl.includes("YOUR_PROJECT") && rawUrl.startsWith("http"));

const supabase = isConfigured
  ? createClient(rawUrl, rawKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

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
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConfigured || !supabase) return;
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
      listener?.subscription?.unsubscribe();
    };
  }, []);

  if (!isConfigured) {
    return (
      <Page narrow>
        <Card>
          <p className="eyebrow">Setup Required</p>
          <h2>Connect to Supabase</h2>
          <p className="muted">To get VitalScan running, add your Supabase project credentials to <code>.env.local</code>:</p>
          <div className="stack" style={{ margin: "16px 0" }}>
            <div className="notice" style={{ background: "#f0f7f8", color: "#0e7178" }}>
              <strong>1. Create / Edit <code>.env.local</code>:</strong><br />
              <code>VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co</code><br />
              <code>VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY</code>
            </div>
            <div className="notice success">
              <strong>2. Execute the Database Migration:</strong><br />
              Run <code>supabase/migrations/001_vitalscan.sql</code> in your Supabase SQL Editor.
            </div>
          </div>
          <p className="muted" style={{ fontSize: "13px" }}>Restart your Vite dev server after updating <code>.env.local</code>.</p>
        </Card>
      </Page>
    );
  }

  if (loading) return <Page><Card><h2>Loading VitalScan…</h2></Card></Page>;
  if (!session) return <Login />;
  if (!profile) return <Page><Card><h2>Profile unavailable</h2><p className="muted">Your authenticated account has no VitalScan profile.</p><Button onClick={() => supabase.auth.signOut()}>Sign out</Button></Card></Page>;

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

function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", fullName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="loginViewport">
      <style>{LOGIN_CSS}</style>
      <div className="loginCard">
        {/* Left Side: VitalScan Info Panel */}
        <div className="loginLeft">
          <div className="loginLeftTop">
            <div className="loginBrand">
              <span className="brandMark">V</span>
              <div className="loginBrandText">
                <span className="loginBrandTitle">VitalScan</span>
                <span className="loginBrandSubtitle">VITAL SIGNS & WELLNESS PLATFORM</span>
              </div>
            </div>

            <div className="loginComplianceBadge">
              <span className="badgeDot"></span>
              CONTACTLESS VITAL MONITORING
            </div>

            <h1 className="loginLeftHeading">
              Non-Invasive Vital Signs & Health Intelligence
            </h1>

            <p className="loginLeftDesc">
              Capture and analyze physiological signals including heart rate, blood pressure, oxygen saturation (SpO2), respiratory rate, and stress index with real-time biometric analytics and secure records.
            </p>
          </div>

          <div className="loginLeftBottom">
            <div className="loginMetaGrid">
              <div className="loginMetaItem">
                <span className="loginMetaLabel">PHYSIOLOGICAL SIGNALS</span>
                <strong className="loginMetaVal">HR · BP · SpO2 · RR · Stress</strong>
              </div>
              <div className="loginMetaItem">
                <span className="loginMetaLabel">MONITORING ENGINE</span>
                <strong className="loginMetaVal">Real-time Telemetry Node</strong>
              </div>
            </div>

            <div className="loginCopyright">
              <p>© VitalScan Wellness Platform. All rights reserved.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Panel */}
        <div className="loginRight">
          <div className="loginRightContent">
            <div className="loginRightBadge">
              <span className="brandMark" style={{ width: 44, height: 44, fontSize: 22 }}>V</span>
            </div>

            <h2 className="loginRightHeading">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>

            <p className="loginRightSub">
              {mode === "login"
                ? "Sign in to access your personal wellness telemetry or workspace management console."
                : "Register an account to start tracking vital signs, camera scans, and health records."}
            </p>

            <form onSubmit={submit} className="loginForm">
              {mode === "signup" && (
                <div className="loginField">
                  <label>Full name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </div>
              )}

              <div className="loginField">
                <label>Email address</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="loginField">
                <label>Password</label>
                <div className="inputWrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="••••••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="eyeButton"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className={`loginAlert ${error.startsWith("Account") ? "success" : "error"}`}>
                  {error}
                </div>
              )}

              <button type="submit" className="loginPrimaryBtn" disabled={busy}>
                {busy ? "Signing in…" : mode === "login" ? "Sign in to VitalScan" : "Create Account"}
              </button>
            </form>

            <div className="loginSwitchMode">
              <button
                type="button"
                className="loginSwitchBtn"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                }}
              >
                {mode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  if (!subscriber) return <NoSubscriberOnboarding profile={profile} onCreated={refresh} />;
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

function NoSubscriberOnboarding({ profile, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleEnroll() {
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("self_enroll_subscriber");
      if (!rpcError) {
        onCreated();
        return;
      }
      const { data: workspaces } = await supabase.from("workspaces").select("id").limit(1);
      const wsId = workspaces?.[0]?.id || "00000000-0000-0000-0000-000000000001";
      const { error: insError } = await supabase.from("subscribers").insert({
        workspace_id: wsId,
        user_id: profile.id,
        full_name: profile.full_name || profile.email.split("@")[0],
        email: profile.email,
        consent_tenant_view_results: true,
        status: "active",
      });
      if (insError) throw insError;
      onCreated();
    } catch (err) {
      setError(err.message || "Please make sure the SQL migration in supabase/migrations/001_vitalscan.sql has been executed in Supabase SQL Editor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="cardTitle">
        <div>
          <p className="eyebrow">Welcome to VitalScan</p>
          <h2>Set Up Your Wellness Profile</h2>
        </div>
      </div>
      <p className="muted">
        Welcome, <b>{profile.full_name || profile.email}</b>! Click below to initialize your personal subscriber profile and start recording vital signs, camera scans, and health entries.
      </p>
      {error && <Notice>{error}</Notice>}
      <div style={{ marginTop: 18 }}>
        <Button onClick={handleEnroll} disabled={busy}>
          {busy ? "Setting up profile…" : "Initialize My Profile"}
        </Button>
      </div>
    </Card>
  );
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
  return <Card><div className="cardTitle"><h2>Camera scan</h2><Button variant="secondary" onClick={onBack}>Back</Button></div><p className="muted">The official FaceHeart/FHVitals SDK must be present. VitalScan does not use synthetic fallback readings.</p>{error && <Notice>{error}</Notice>}<div className="scanState">{status === "starting" ? "Preparing secure measurement…" : "Ready when you are."}</div><Button onClick={start} disabled={status === "starting"}>{status === "starting" ? "Measuring…" : "Start measurement"}</Button></Card>;
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
function Input({ label, value, onChange, disabled, type = "text", ...props }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const actualType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <label className="input">
      <span>{label}</span>
      <div className="inputWrapper">
        <input
          {...props}
          type={actualType}
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            className="eyeButton"
            onClick={() => setShowPassword((prev) => !prev)}
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            )}
          </button>
        )}
      </div>
    </label>
  );
}
function Button({ children, variant = "primary", ...props }) { return <button className={`button ${variant}`} {...props}>{children}</button>; }
function Card({ children, className = "" }) { return <section className={`card ${className}`}>{children}</section>; }
function Page({ children, narrow }) { return <div className={`app ${narrow ? "narrow" : ""}`}><style>{CSS}</style>{children}</div>; }

const LOGIN_CSS = `
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  background: #080c16;
  overflow-x: hidden;
}
.loginViewport {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 25%, #141c2e 0%, #080c16 100%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1e293b;
  padding: 16px;
  box-sizing: border-box;
  margin: 0;
}
.loginCard {
  width: 100%;
  max-width: 980px;
  background: #0f172a;
  border-radius: 20px;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  overflow: hidden;
  box-shadow: 0 25px 80px -20px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.loginLeft {
  background: linear-gradient(155deg, #131b2e 0%, #0b1120 100%);
  padding: 36px 36px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #f8fafc;
  position: relative;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}
.loginBrand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.brandMark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: #0e8790;
  color: white;
  font-weight: 800;
  font-size: 18px;
  box-shadow: 0 4px 14px rgba(14, 135, 144, 0.4);
}
.loginBrandText {
  display: flex;
  flex-direction: column;
}
.loginBrandTitle {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #ffffff;
}
.loginBrandSubtitle {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #64748b;
  font-weight: 700;
}
.loginComplianceBadge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(14, 135, 144, 0.12);
  border: 1px solid rgba(14, 135, 144, 0.4);
  color: #2dd4bf;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  margin-bottom: 16px;
  width: fit-content;
}
.badgeDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2dd4bf;
  box-shadow: 0 0 8px #2dd4bf;
}
.loginLeftHeading {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.22;
  color: #ffffff;
  margin: 0 0 12px 0;
}
.loginLeftDesc {
  font-size: 13px;
  line-height: 1.6;
  color: #94a3b8;
  margin: 0;
}
.loginMetaGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 18px;
  margin-bottom: 16px;
}
.loginMetaItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.loginMetaLabel {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #64748b;
}
.loginMetaVal {
  font-size: 12.5px;
  font-weight: 700;
  color: #e2e8f0;
}
.loginCopyright {
  font-size: 11px;
  color: #475569;
}
.loginCopyright p {
  margin: 0;
}
.loginRight {
  background: #ffffff;
  padding: 36px 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.loginRightContent {
  width: 100%;
  max-width: 350px;
  margin: 0 auto;
}
.loginRightBadge {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}
.loginRightHeading {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
  text-align: center;
  color: #0f172a;
  margin: 0 0 6px 0;
}
.loginRightSub {
  font-size: 12.5px;
  line-height: 1.45;
  color: #64748b;
  text-align: center;
  margin: 0 0 20px 0;
}
.loginForm {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.loginField {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.loginField label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
}
.loginField input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  color: #0f172a;
  background: #f8fafc;
  transition: all 0.15s ease;
}
.loginField input:focus {
  outline: none;
  background: #ffffff;
  border-color: #0e8790;
  box-shadow: 0 0 0 3px rgba(14, 135, 144, 0.15);
}
.inputWrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.inputWrapper input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 12px 46px 12px 14px;
  font-size: 14px;
  font-family: inherit;
  color: #0f172a;
  background: #f8fafc;
  transition: all 0.15s ease;
}
.inputWrapper input:focus {
  outline: none;
  background: #ffffff;
  border-color: #0e8790;
  box-shadow: 0 0 0 3px rgba(14, 135, 144, 0.15);
}
.inputWrapper input:disabled {
  background: #f1f5f9;
  color: #94a3b8;
}
.eyeButton {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.eyeButton:hover {
  color: #0e8790;
  background: #f1f5f9;
}
.loginPrimaryBtn {
  width: 100%;
  min-height: 44px;
  padding: 12px 20px;
  background: #0e8790;
  color: #ffffff;
  border: none;
  border-radius: 11px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(14, 135, 144, 0.3);
  transition: all 0.15s ease;
  margin-top: 6px;
}
.loginPrimaryBtn:hover:not(:disabled) {
  background: #0b7077;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(14, 135, 144, 0.35);
}
.loginPrimaryBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.loginSwitchMode {
  text-align: center;
  margin-top: 18px;
}
.loginSwitchBtn {
  background: none;
  border: none;
  color: #0e8790;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.15s;
}
.loginSwitchBtn:hover {
  background: #eef8f8;
  text-decoration: underline;
}
.loginAlert {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}
.loginAlert.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}
.loginAlert.success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
}

@media (max-width: 860px) {
  .loginViewport {
    padding: 12px 10px;
  }
  .loginCard {
    grid-template-columns: 1fr;
    max-width: 460px;
    min-height: auto;
    border-radius: 18px;
  }
  .loginLeft {
    padding: 28px 20px 20px;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .loginBrand {
    margin-bottom: 18px;
  }
  .loginLeftHeading {
    font-size: 22px;
    margin-bottom: 10px;
  }
  .loginLeftDesc {
    font-size: 13px;
    line-height: 1.5;
  }
  .loginComplianceBadge {
    font-size: 10px;
    padding: 4px 10px;
    margin-bottom: 14px;
  }
  .loginMetaGrid {
    display: none;
  }
  .loginCopyright {
    display: none;
  }
  .loginRight {
    padding: 28px 20px;
  }
  .loginRightHeading {
    font-size: 21px;
  }
  .loginField input, .inputWrapper input {
    font-size: 16px !important;
  }
}
`;

const CSS = `
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172a3a;background:#f6f9fb;line-height:1.45}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;-webkit-text-size-adjust:100%}
.app{min-height:100vh;min-height:100dvh;max-width:1180px;margin:auto;padding:24px 20px 64px}
.app.narrow{max-width:520px;padding-top:8vh}

.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;gap:16px}
.headerRight{display:flex;align-items:center;gap:12px}
.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800;letter-spacing:-.04em}
.accent{color:#0e8790}
.muted{color:#71808c}
.eyebrow{color:#0e8790;text-transform:uppercase;letter-spacing:.14em;font-size:11px;font-weight:800;margin:0 0 8px}
.rolePill{background:#e6f3f1;color:#0a7178;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800;text-transform:capitalize;white-space:nowrap}

.hero{display:flex;justify-content:space-between;align-items:center;background:#e5f4f1;border-radius:24px;padding:36px;margin-bottom:22px;gap:20px}
.hero h1{font-size:42px;line-height:1.05;letter-spacing:-.05em;margin:0 0 16px}
.score{width:150px;height:150px;border-radius:50%;background:white;display:grid;place-content:center;text-align:center;box-shadow:0 16px 40px #0e87901a;flex-shrink:0}
.score strong{font-size:44px;line-height:1;color:#0e8790}
.score span{font-size:12px;color:#71808c;font-weight:700}

.card{background:white;border:1px solid #e4eaee;border-radius:18px;padding:24px;box-shadow:0 10px 30px #19324708;margin-bottom:22px}
.card h1,.card h2{margin:0 0 8px;letter-spacing:-.04em}
.card h2{font-size:21px}
.grid{display:grid;gap:20px}
.grid.two{grid-template-columns:1.2fr .8fr}
.cardTitle{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}

.tabs{display:flex;gap:4px;border-bottom:1px solid #dfe7eb;margin-bottom:22px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs button{border:0;background:none;padding:12px 16px;color:#71808c;font-weight:700;font-size:14px;white-space:nowrap;cursor:pointer;min-height:44px;flex-shrink:0;transition:all .15s}
.tabs button.active{color:#0e8790;border-bottom:2px solid #0e8790}

.button{border:0;border-radius:11px;padding:11px 18px;font-weight:800;font-size:13.5px;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all .15s}
.button:disabled{opacity:.5;cursor:not-allowed}
.button.primary{background:#0e8790;color:white}
.button.primary:hover:not(:disabled){background:#0b7077}
.button.secondary,.ghostButton{background:#edf3f5;color:#28505b}
.button.secondary:hover:not(:disabled),.ghostButton:hover{background:#dfe9ec}
.ghostButton{border:0;border-radius:9px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;min-height:36px;display:inline-flex;align-items:center}
.linkButton{border:0;background:none;color:#0e8790;font-weight:800;font-size:13px;cursor:pointer;padding:6px 0;min-height:36px;display:inline-flex;align-items:center}

.stack{display:grid;gap:15px}
.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:15px}
.input{display:grid;gap:6px;color:#526572;font-size:12px;font-weight:800;text-transform:capitalize}

.consent{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #dce7ea;border-radius:12px;cursor:pointer}
.consent.disabled{background:#f5f8f9;cursor:default}
.consent input{margin-top:3px;accent-color:#0e8790;width:18px;height:18px}
.consent span{display:grid;gap:3px}
.consent small{color:#71808c;font-weight:normal}

.notice{padding:12px 14px;border-radius:10px;background:#fff1ef;color:#aa463d;margin-bottom:16px;font-size:13px}
.notice.success{background:#e8f7ef;color:#28704b}

.historyRow,.directoryRow{width:100%;display:flex;align-items:center;gap:13px;border:0;border-top:1px solid #edf1f3;background:white;text-align:left;padding:14px 4px;cursor:pointer;min-height:48px;transition:background .15s}
.historyRow:hover,.directoryRow:hover{background:#f7fbfb}
.historyIcon{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#e8f5f3;color:#0e8790;flex-shrink:0;font-size:15px}
.historyIcon.report{background:#f7efe5;color:#a86326}
.historyMain{display:grid;gap:3px;flex:1;min-width:0}
.historyMain b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.historyMain small,.deviceRow small{color:#71808c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.historyValue{text-align:right;color:#0e8790;font-weight:800;flex-shrink:0}
.historyValue small{font-weight:600;color:#71808c}

.empty{text-align:center;padding:34px 10px;color:#84939c}
.metricGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}
.metric{background:#f3f8f8;border-radius:12px;padding:14px}
.metric small{display:block;color:#71808c;font-size:11px}
.metric strong{font-size:20px;color:#172a3a}
.metric em{font-size:11px;font-style:normal;color:#71808c;margin-left:2px}

.details{display:grid;grid-template-columns:120px 1fr;gap:10px;border-top:1px solid #edf1f3;padding-top:16px;font-size:13.5px}
.details dt{color:#71808c}
.details dd{margin:0;font-weight:700}

.modalBackdrop{position:fixed;inset:0;background:#132b3b80;backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:100;box-sizing:border-box}
.modal{background:white;border-radius:20px;padding:24px;width:100%;max-width:580px;max-height:88vh;max-height:88dvh;overflow-y:auto;box-shadow:0 25px 60px rgba(0,0,0,0.25)}
.modal.wide{max-width:740px}
.close{background:#f1f5f9;border:0;font-size:26px;color:#64748b;cursor:pointer;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;transition:background .15s}
.close:hover{background:#e2e8f0;color:#0f172a}

.scanState{padding:34px;text-align:center;border-radius:14px;background:#eef6f6;margin:20px 0;color:#0e7178;font-weight:800}
.deviceRow{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #edf1f3;padding:14px 0}
.deviceRow div{display:grid;gap:3px;min-width:0}
.avatar{width:38px;height:38px;border-radius:50%;background:#dcefed;color:#0e7178;display:grid;place-items:center;font-weight:800;flex-shrink:0}
.sdkNotice{font-size:12px;color:#71808c;text-align:center;margin-top:20px}
.linkButton:focus-visible,.button:focus-visible,input:focus-visible{outline:3px solid #8ed5d2;outline-offset:2px}

@media(max-width:768px){
  .app{padding:14px 12px 48px}
  .header{flex-direction:column;align-items:flex-start;gap:12px;margin-bottom:18px}
  .headerRight{width:100%;justify-content:space-between;flex-wrap:wrap}
  .headerRight .muted{display:none}
  .hero{padding:26px 18px;flex-direction:column;text-align:center;border-radius:18px}
  .hero h1{font-size:28px}
  .hero .button{width:100%}
  .score{margin:18px auto 0;width:120px;height:120px}
  .score strong{font-size:36px}
  .grid.two,.formGrid{grid-template-columns:1fr;gap:14px}
  .metricGrid{grid-template-columns:1fr 1fr;gap:8px}
  .card{padding:18px 14px;border-radius:14px;margin-bottom:16px}
  .formGrid .consent,.formGrid .actions,.formGrid>.button{grid-column:auto}
  .formGrid .actions{display:flex;flex-direction:column;gap:10px}
  .modalBackdrop{padding:12px 8px;align-items:flex-end}
  .modal{max-height:90vh;max-height:90dvh;border-radius:20px 20px 0 0;padding:20px 14px}
  input, select, textarea{font-size:16px !important}
}
`;

createRoot(document.getElementById("root")).render(<App />);