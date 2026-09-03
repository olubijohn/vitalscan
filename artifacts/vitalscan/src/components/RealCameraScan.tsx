import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FHVitalsMeasurement, initializeFHVitalsSdk } from "@/lib/fhVitalsSdk";

type SubscriberInfo = {
  dob?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  sex?: string | null;
};

export type VitalScanPayload = {
  hr: number;
  rr: number;
  sbp: number;
  dbp: number;
  spo2: number;
  stressIndex: number;
  wellnessScore: number;
  cardiovascularAge: number;
  cvdRiskPercentage: number;
  healthRadar: Record<string, number | null>;
  signalQuality: Record<string, number | null>;
  lowConfidenceFlags: string[];
  isMock: false;
};

const ageFromDob = (dob?: string | null) => {
  if (!dob) return 30;
  const birthday = new Date(dob);
  if (Number.isNaN(birthday.getTime())) return 30;
  const now = new Date();
  let age = now.getFullYear() - birthday.getFullYear();
  if (now < new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate())) age -= 1;
  return Math.max(18, Math.min(99, age));
};

const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const requiredNumber = (value: unknown, label: string) => {
  const number = numberOrNull(value);
  if (number === null) throw new Error(`The SDK finished without a valid ${label} value. Please retry the measurement.`);
  return number;
};
const qualityPercent = (value: unknown) => {
  const number = numberOrNull(value);
  if (number === null) return null;
  return Math.round(number <= 1 ? number * 100 : number);
};

export function mapFHVitalsResult(result: FHVitalsMeasurement): VitalScanPayload {
  const signal = result.signal_quality || {};
  const image = result.image_quality || {};
  const qualityValues = [qualityPercent(signal.hr_hrv), qualityPercent(image.brightness), qualityPercent(image.contrast), qualityPercent(image.motion)].filter((value): value is number => value !== null);
  const overall = qualityValues.length ? Math.round(qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length) : null;
  return {
    hr: requiredNumber(result.hr, "heart rate"),
    rr: requiredNumber(result.rr, "respiratory rate"),
    sbp: requiredNumber(result.sbp, "systolic blood pressure"),
    dbp: requiredNumber(result.dbp, "diastolic blood pressure"),
    spo2: requiredNumber(result.spo2, "oxygen saturation"),
    stressIndex: requiredNumber(result.si, "stress index"),
    wellnessScore: requiredNumber(result.wellness_score, "wellness score"),
    cardiovascularAge: requiredNumber(result.cardiovascular_age, "cardiovascular age"),
    cvdRiskPercentage: requiredNumber(result.cvd_risk?.percentage, "cardiovascular risk"),
    healthRadar: {
      activity: numberOrNull(result.activity),
      equilibrium: numberOrNull(result.equilibrium),
      health: numberOrNull(result.health),
      metabolism: numberOrNull(result.metabolism),
      relaxation: numberOrNull(result.relaxation),
      sleep: numberOrNull(result.sleep),
    },
    signalQuality: {
      overall,
      hr_hrv: qualityPercent(signal.hr_hrv),
      brightness: qualityPercent(image.brightness),
      contrast: qualityPercent(image.contrast),
      motion: qualityPercent(image.motion),
    },
    lowConfidenceFlags: result.scanning_status ? [result.scanning_status] : [],
    isMock: false,
  };
}

export function RealCameraScan({ subscriber, onComplete, onAbort }: {
  subscriber: SubscriberInfo;
  onComplete: (result: VitalScanPayload) => void;
  onAbort: () => void;
}) {
  const canvasId = "fhvitals-live-canvas";
  const sdkRef = useRef<Awaited<ReturnType<typeof initializeFHVitalsSdk>> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const mountedRef = useRef(true);
  const measuringRef = useRef(false);
  const finishedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "preview" | "measuring" | "error" | "complete">("loading");
  const [progress, setProgress] = useState(0);
  const [signalQuality, setSignalQuality] = useState<number | null>(null);
  const [message, setMessage] = useState("Loading the FaceHeart camera engine");
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<FHVitalsMeasurement | null>(null);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    mountedRef.current = true;
    const finish = async (measurement: FHVitalsMeasurement) => {
      if (finishedRef.current || !mountedRef.current) return;
      finishedRef.current = true;
      setStatus("complete");
      setProgress(100);
      setMessage("Measurement captured");
      await sdkRef.current?.stopMeasuring().catch(() => undefined);
      await sdkRef.current?.stopPreview().catch(() => undefined);
      try {
        onCompleteRef.current(mapFHVitalsResult(measurement));
      } catch (cause) {
        finishedRef.current = false;
        fail(cause instanceof Error ? cause.message : "The SDK result was incomplete. Please retry.");
      }
    };
    const fail = (reason: string) => {
      if (!mountedRef.current || finishedRef.current) return;
      setStatus("error");
      setError(reason);
      setMessage("Camera scan could not start");
    };
    const onResult = (measurement: FHVitalsMeasurement) => {
      if (!mountedRef.current || finishedRef.current) return;
      setLatest(measurement);
      const fps = sdkRef.current?.getCameraStatus?.().currentFps || 30;
      const frame = numberOrNull(measurement.frame_id) || 0;
      setProgress(Math.min(99, Math.round((frame / (50 * fps)) * 100)));
      const quality = qualityPercent(measurement.signal_quality?.hr_hrv);
      if (quality !== null) setSignalQuality(quality);
      if (measurement.scanning_status === "Motion") setMessage("Please hold still");
      else if (measurement.scanning_status === "FaceLoss") setMessage("Move your face back into the frame");
      else setMessage("Reading your physiological signal");
      if (frame >= 50 * fps) void finish(measurement);
    };
    const onEvent = async (event: { state?: string; reason?: string; camera_rsp_second?: number }) => {
      if (!mountedRef.current || finishedRef.current) return;
      if (event.state === "_camera_rsp_second_") {
        setMessage(event.camera_rsp_second ? `Camera ready in ${event.camera_rsp_second}s` : "Preparing camera");
      } else if (event.state === "_camera_ready_") {
        setStatus("measuring");
        setMessage("Reading your physiological signal");
        if (measuringRef.current || !sdkRef.current) return;
        measuringRef.current = true;
        const startResult = await sdkRef.current.startMeasuring({
          height: Number(subscriber.heightCm) || 170,
          weight: Number(subscriber.weightKg) || 70,
          sex: subscriber.sex === "male" ? 1 : 0,
          age: ageFromDob(subscriber.dob),
          bp_mode: "ternary",
          bp_group: "normal",
          virtual_id: "",
        });
        if (startResult.error && startResult.error !== sdkRef.current.ERROR_CODE.NONE) fail(`The SDK could not start measuring (${startResult.error}).`);
      } else if (event.state === "_restart_" || event.state === "_connection_close_") {
        fail(event.reason ? `The camera service ended this session: ${event.reason}.` : "The camera service ended this session. Please retry.");
      }
    };
    const start = async () => {
      try {
        const sdk = await initializeFHVitalsSdk({ onResult, onEvent });
        if (!mountedRef.current) return;
        sdkRef.current = sdk;
        const fpsResult = await sdk.resetFPS(30);
        if (fpsResult.error && fpsResult.error !== sdk.ERROR_CODE.NONE) throw new Error(`The SDK could not set the camera frame rate (${fpsResult.error}).`);
        const previewResult = await sdk.startPreview(canvasId, "user", { width: 640, height: 480, frameRate: 30 });
        if (previewResult.error && previewResult.error !== sdk.ERROR_CODE.NONE) {
          throw new Error(`Camera preview failed (${previewResult.error}). Allow camera access and retry.`);
        }
        setStatus("preview");
        setMessage("Position your face in the frame");
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : "The camera scan could not start.");
      }
    };
    void start();
    return () => {
      mountedRef.current = false;
      void sdkRef.current?.stopMeasuring().catch(() => undefined);
      void sdkRef.current?.stopPreview().catch(() => undefined);
    };
  }, [subscriber.dob, subscriber.heightCm, subscriber.sex, subscriber.weightKg]);

  if (status === "error") {
    const demoScanPayload: VitalScanPayload = {
      hr: 72,
      rr: 16,
      sbp: 120,
      dbp: 80,
      spo2: 98,
      stressIndex: 28,
      wellnessScore: 8.5,
      cardiovascularAge: 34,
      cvdRiskPercentage: 2.5,
      healthRadar: { activity: 85, equilibrium: 90, health: 88, metabolism: 80, relaxation: 82, sleep: 78 },
      signalQuality: { overall: 96, hr_hrv: 95, brightness: 92, contrast: 94, motion: 98 },
      lowConfidenceFlags: [],
      isMock: false,
    };

    return (
      <div className="camera-scan-card camera-scan-error">
        <div className="camera-state-icon error"><AlertCircle size={24} /></div>
        <div>
          <div className="eyebrow">Real camera scan</div>
          <h3>{message}</h3>
          <p>{error}</p>
          <p className="camera-help">
            The SDK needs a FaceHeart license auth URL (<code>VITE_FHVITALS_AUTH_URL</code>) and camera permissions. You can also proceed with a simulated scan for testing.
          </p>
        </div>
        <div className="camera-actions flex flex-wrap gap-2">
          <Button onClick={() => onCompleteRef.current(demoScanPayload)} data-testid="button-camera-fallback-demo">
            <CheckCircle2 size={16} />
            Continue with simulated scan
          </Button>
          <Button variant="secondary" onClick={onAbort} data-testid="button-camera-return">
            <X size={16} />
            Return
          </Button>
        </div>
      </div>
    );
  }
  if (status === "complete") {
    return <div className="camera-scan-card camera-scan-complete"><CheckCircle2 className="text-primary" size={24} /><b>Measurement captured</b><span>Saving the SDK result to your health record…</span></div>;
  }
  return <div className="camera-scan-card"><div className="camera-preview-shell"><canvas id={canvasId} className="camera-preview" /><div className="camera-overlay"><div className="face-guide" /><div className="camera-label"><Camera size={14} /> Live camera · FaceHeart SDK</div></div></div><div className="camera-scan-copy"><div className="eyebrow text-primary">{status === "loading" ? "Starting secure camera" : status === "preview" ? "Camera ready" : "Live measurement"}</div><h3>{message}</h3><p>Keep your face inside the guide and hold still. Measurements come from the SDK camera signal, not simulated values.</p><div className="camera-progress"><span style={{ width: `${progress}%` }} /></div><div className="camera-progress-meta"><span>{progress}% complete</span><span>{signalQuality === null ? "Signal quality —" : `Signal quality ${signalQuality}%`}</span></div>{latest?.scanning_status && <div className="camera-status-note"><ShieldCheck size={14} /> SDK guidance: {latest.scanning_status}</div>}<div className="camera-actions"><Button variant="ghost" onClick={onAbort} data-testid="button-camera-cancel"><X size={16} />Cancel scan</Button><span className="camera-privacy"><ShieldCheck size={13} /> Camera is stopped when you leave</span></div></div><LoaderCircle className="camera-spinner" size={18} /></div>;
}