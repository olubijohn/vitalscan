import { describe, expect, it } from "vitest";
import { mapFHVitalsResult } from "../src/components/RealCameraScan";

describe("FaceHeart result mapping", () => {
  it("maps SDK vitals, radar values, and normalized signal quality", () => {
    const result = mapFHVitalsResult({
      hr: 68,
      rr: 15,
      sbp: 118,
      dbp: 76,
      spo2: 98,
      si: 31,
      wellness_score: 8.4,
      cardiovascular_age: 36,
      cvd_risk: { percentage: 2.8 },
      activity: 82,
      equilibrium: "not-a-number",
      health: 91,
      metabolism: 79,
      relaxation: 88,
      sleep: 76,
      signal_quality: { hr_hrv: 0.94 },
      image_quality: { brightness: 80, contrast: 0.8, motion: 0.9 },
      scanning_status: "Good",
    });

    expect(result).toEqual({
      hr: 68,
      rr: 15,
      sbp: 118,
      dbp: 76,
      spo2: 98,
      stressIndex: 31,
      wellnessScore: 8.4,
      cardiovascularAge: 36,
      cvdRiskPercentage: 2.8,
      healthRadar: {
        activity: 82,
        equilibrium: null,
        health: 91,
        metabolism: 79,
        relaxation: 88,
        sleep: 76,
      },
      signalQuality: {
        overall: 86,
        hr_hrv: 94,
        brightness: 80,
        contrast: 80,
        motion: 90,
      },
      lowConfidenceFlags: ["Good"],
      isMock: false,
    });
  });

  it("rejects incomplete SDK results instead of persisting fake values", () => {
    expect(() => mapFHVitalsResult({
      hr: 68,
      rr: 15,
      sbp: 118,
      dbp: 76,
      spo2: 98,
      si: 31,
      wellness_score: 8.4,
      cardiovascular_age: 36,
      cvd_risk: {},
    })).toThrow("cardiovascular risk");
  });
});