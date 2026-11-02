/** Cores e fontes do kit. Cada jogo pode sobrescrever com setTheme(). */
export interface Theme {
  background: number;
  panel: number;
  panelBorder: number;
  text: number;
  textDim: number;
  accent: number;
  good: number;
  warning: number;
  bad: number;
  nodeHidden: number;
  nodeLocked: number;
  nodeAvailable: number;
  nodeAffordable: number;
  nodeMaxed: number;
  edge: number;
  edgeActive: number;
  fontFamily: string;
  monoFamily: string;
}

export const theme: Theme = {
  background: 0x0b0e14,
  panel: 0x141a24,
  panelBorder: 0x2a3446,
  text: 0xe8edf5,
  textDim: 0x8a96a8,
  accent: 0x4cc9f0,
  good: 0x5ce08a,
  warning: 0xf5c249,
  bad: 0xf25f5c,
  nodeHidden: 0x1a2030,
  nodeLocked: 0x3a4252,
  nodeAvailable: 0x6a7890,
  nodeAffordable: 0x4cc9f0,
  nodeMaxed: 0xf5c249,
  edge: 0x2a3446,
  edgeActive: 0x4cc9f0,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  monoFamily: 'ui-monospace, Menlo, Consolas, monospace',
};

export function setTheme(partial: Partial<Theme>): void {
  Object.assign(theme, partial);
}
