export interface GapCheckContext {
  rootDir: string;
  currentPhase: number;
}

export interface CheckResult {
  category: string;
  passed: boolean;
  message: string;
  details?: string[];
}
