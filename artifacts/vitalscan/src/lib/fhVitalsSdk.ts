export type FHVitalsEvent = {
  state?: string;
  reason?: string;
  camera_rsp_second?: number;
};

export type FHVitalsMeasurement = Record<string, any> & {
  frame_id?: number;
  scanning_status?: string;
};

export type FHVitalsSdk = {
  version?: string;
  ERROR_CODE: Record<string, string>;
  init(args: {
    on_result: (result: FHVitalsMeasurement) => void;
    on_event: (event: FHVitalsEvent) => void;
    config: {
      camera_prepare_second: number;
      assets_folder_path: string;
      auth_url: string;
    };
  }): Promise<{ error?: string }>;
  resetFPS(fps: number): Promise<{ error?: string }>;
  startPreview(canvasId: string, facingMode: "user" | "environment", cameraConfiguration: { width: number; height: number; frameRate: number }): Promise<{ error?: string }>;
  stopPreview(): Promise<{ error?: string }>;
  startMeasuring(input: { height: number; weight: number; sex: number; age: number; bp_mode: "binary" | "ternary"; bp_group: "normal" | "prehypertension" | "hypertension"; virtual_id: string }): Promise<{ error?: string }>;
  stopMeasuring(): Promise<{ error?: string }>;
  getCameraStatus(): { videoWidth?: number; videoHeight?: number; currentFps?: number };
};

declare global {
  interface Window {
    FHVitalsSDK?: FHVitalsSdk;
  }
}

let sdkScriptPromise: Promise<FHVitalsSdk> | null = null;
let sdkInitialized = false;
let activeCallbacks: { onResult: (result: FHVitalsMeasurement) => void; onEvent: (event: FHVitalsEvent) => void } | null = null;

const sdkAssetPath = () => `${import.meta.env.BASE_URL}fhvitals`.replace(/\/+/g, "/");

export const getFHVitalsAuthUrl = () => String(import.meta.env.VITE_FHVITALS_AUTH_URL || "").trim();

function getGlobalSdk(): FHVitalsSdk | undefined {
  return window.FHVitalsSDK || (window as any).FHVitals || (globalThis as any).FHVitalsSDK || (globalThis as any).FHVitals;
}

export async function loadFHVitalsSdk(): Promise<FHVitalsSdk> {
  const current = getGlobalSdk();
  if (current) return current;
  if (!sdkScriptPromise) {
    sdkScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-fhvitals-sdk="true"]');
      if (existing) {
        existing.addEventListener("load", () => {
          const sdk = getGlobalSdk();
          return sdk ? resolve(sdk) : reject(new Error("The FHVitals SDK loaded without exposing FHVitalsSDK."));
        }, { once: true });
        existing.addEventListener("error", () => reject(new Error("The FHVitals SDK script could not be loaded.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = new URL(`${sdkAssetPath()}/fhvitals_sdk.js`, window.location.origin).toString();
      script.async = true;
      script.dataset.fhvitalsSdk = "true";
      script.onload = () => {
        const sdk = getGlobalSdk();
        return sdk ? resolve(sdk) : reject(new Error("The FHVitals SDK loaded without exposing FHVitalsSDK."));
      };
      script.onerror = () => reject(new Error("The FHVitals SDK script could not be loaded."));
      document.head.appendChild(script);
    });
  }
  return sdkScriptPromise;
}

export async function initializeFHVitalsSdk(callbacks: {
  onResult: (result: FHVitalsMeasurement) => void;
  onEvent: (event: FHVitalsEvent) => void;
}) {
  const sdk = await loadFHVitalsSdk();
  activeCallbacks = callbacks;
  if (!getFHVitalsAuthUrl()) {
    throw new Error("Real camera scanning is not configured yet. Add VITE_FHVITALS_AUTH_URL and authorize this host with FaceHeart.");
  }
  if (!sdkInitialized) {
    const init = await sdk.init({
      on_result: (result) => activeCallbacks?.onResult(result),
      on_event: (event) => activeCallbacks?.onEvent(event),
      config: {
        camera_prepare_second: 5,
        assets_folder_path: sdkAssetPath(),
        auth_url: getFHVitalsAuthUrl(),
      },
    });
    const alreadyInitialized = init.error === sdk.ERROR_CODE.ERROR_HAS_INITIALIZED;
    if (init.error && init.error !== sdk.ERROR_CODE.NONE && !alreadyInitialized) {
      throw new Error(`FHVitals SDK initialization failed (${init.error}). Check the authorized host, auth URL, and SDK assets.`);
    }
    sdkInitialized = true;
  }
  return sdk;
}

export const sdkAssetFolder = sdkAssetPath;