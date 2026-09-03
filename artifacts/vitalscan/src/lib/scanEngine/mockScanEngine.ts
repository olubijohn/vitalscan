import type { MockScanResult, ScanEngine, ScanTick } from "./index";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export class MockScanEngine implements ScanEngine {
  private stopped = false;

  async init() {
    this.stopped = false;
  }

  async startPreview() {
    await wait(250);
  }

  async startMeasuring(onResult: (tick: ScanTick) => void): Promise<MockScanResult> {
    this.stopped = false;
    const messages = ["Finding your face", "Locking onto signal", "Smoothing readings", "Finalising wellness readout"];
    for (let index = 0; index < 4; index += 1) {
      if (this.stopped) throw new Error("Scan aborted");
      await wait(850);
      onResult({ progress: (index + 1) * 22, signalQuality: 76 + index * 5, message: messages[index] });
    }
    await wait(500);
    onResult({ progress: 100, signalQuality: 94, message: "Signal captured" });
    return {
      hr: 68, rr: 15, sbp: 118, dbp: 76, spo2: 98, stressIndex: 31, wellnessScore: 8.4,
      cardiovascularAge: 36, cvdRiskPercentage: 2.8,
      healthRadar: { health: 4.4, sleep: 4.1, metabolism: 4.2, equilibrium: 4.5, activity: 4.0, relaxation: 4.3 },
      signalQuality: { hr_hrv: 0.94, bp: 0.89, resp: 0.95, spo2: 0.92, overall: 94 },
      lowConfidenceFlags: [], isMock: true,
    };
  }

  async stopMeasuring() {
    this.stopped = true;
  }
}