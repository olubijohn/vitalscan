import { beforeEach, describe, expect, it, vi } from "vitest";

const makeSdk = () => ({
  ERROR_CODE: { NONE: "NONE", ERROR_HAS_INITIALIZED: "ERROR_HAS_INITIALIZED" },
  init: vi.fn(async () => ({ error: "NONE" })),
  resetFPS: vi.fn(async () => ({ error: "NONE" })),
  startPreview: vi.fn(async () => ({ error: "NONE" })),
  stopPreview: vi.fn(async () => ({ error: "NONE" })),
  startMeasuring: vi.fn(async () => ({ error: "NONE" })),
  stopMeasuring: vi.fn(async () => ({ error: "NONE" })),
  getCameraStatus: vi.fn(() => ({ currentFps: 30 })),
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_FHVITALS_AUTH_URL", "https://faceheart.test/auth");
  delete window.FHVitalsSDK;
});

describe("FaceHeart SDK adapter", () => {
  it("reuses the official SDK instance and wires result and event callbacks", async () => {
    const sdk = makeSdk();
    window.FHVitalsSDK = sdk;
    const onResult = vi.fn();
    const onEvent = vi.fn();
    const { initializeFHVitalsSdk } = await import("../src/lib/fhVitalsSdk");

    const initialized = await initializeFHVitalsSdk({ onResult, onEvent });
    expect(initialized).toBe(sdk);
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({
      on_result: expect.any(Function),
      on_event: expect.any(Function),
      config: expect.objectContaining({
        camera_prepare_second: 5,
        auth_url: "https://faceheart.test/auth",
      }),
    }));

    const measurement = { frame_id: 3, hr: 68 };
    const event = { state: "_camera_ready_" };
    sdk.init.mock.calls[0][0].on_result(measurement);
    sdk.init.mock.calls[0][0].on_event(event);
    expect(onResult).toHaveBeenCalledWith(measurement);
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it("initializes the SDK only once across repeated scan sessions", async () => {
    const sdk = makeSdk();
    window.FHVitalsSDK = sdk;
    const { initializeFHVitalsSdk } = await import("../src/lib/fhVitalsSdk");

    await initializeFHVitalsSdk({ onResult: vi.fn(), onEvent: vi.fn() });
    await initializeFHVitalsSdk({ onResult: vi.fn(), onEvent: vi.fn() });

    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("accepts the SDK's already-initialized lifecycle response", async () => {
    const sdk = makeSdk();
    sdk.init.mockResolvedValue({ error: "ERROR_HAS_INITIALIZED" });
    window.FHVitalsSDK = sdk;
    const { initializeFHVitalsSdk } = await import("../src/lib/fhVitalsSdk");

    await expect(initializeFHVitalsSdk({ onResult: vi.fn(), onEvent: vi.fn() })).resolves.toBe(sdk);
  });

  it("fails clearly when FaceHeart authorization is not configured", async () => {
    vi.stubEnv("VITE_FHVITALS_AUTH_URL", "");
    const sdk = makeSdk();
    window.FHVitalsSDK = sdk;
    const { initializeFHVitalsSdk } = await import("../src/lib/fhVitalsSdk");

    await expect(initializeFHVitalsSdk({ onResult: vi.fn(), onEvent: vi.fn() }))
      .rejects.toThrow("Real camera scanning is not configured yet");
    expect(sdk.init).not.toHaveBeenCalled();
  });
});