export type ScanTick = {
  progress: number;
  signalQuality: number;
  message: string;
};

export type MockScanResult = {
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
  isMock: true;
};

export interface ScanEngine {
  init(): Promise<void>;
  startPreview(): Promise<void>;
  startMeasuring(onResult: (tick: ScanTick) => void): Promise<MockScanResult>;
  stopMeasuring(): Promise<void>;
}

export { MockScanEngine } from "./mockScanEngine";