export interface DocTokenSnapshot {
  readonly tone: (name: "success" | "danger" | "warning" | "info" | "neutral" | "accent" | "muted" | "text" | "border") => string;
  readonly css: (name: string, fallback?: string) => string;
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly grid: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly series: readonly string[];
}

export interface DocTokensApi {
  readonly read: (element?: Element) => DocTokenSnapshot;
  readonly seriesNames: readonly string[];
}

