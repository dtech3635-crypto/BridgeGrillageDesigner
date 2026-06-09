// ============================================================
// 断面プリセット & 鋼材強度データベース
// JRA H29 §5 準拠
// ============================================================

import type { SteelGradeKey } from '../types/bridge';

// ---- 鋼材強度 -----------------------------------------------

export interface SteelGradeProps {
  label: string;
  F: number;          // N/mm² 降伏応力
  sigma_ta: number;   // N/mm² 許容引張/曲げ応力度
  tau_allow: number;  // N/mm² 許容せん断応力度
}

export const STEEL_GRADES: Record<SteelGradeKey, SteelGradeProps> = {
  SS400:  { label: 'SS400',  F: 235, sigma_ta: 140, tau_allow:  80 },
  SM400:  { label: 'SM400',  F: 235, sigma_ta: 140, tau_allow:  80 },
  SM490:  { label: 'SM490',  F: 315, sigma_ta: 185, tau_allow: 105 },
  SM490Y: { label: 'SM490Y', F: 355, sigma_ta: 210, tau_allow: 120 },
  SM520:  { label: 'SM520',  F: 355, sigma_ta: 210, tau_allow: 120 },
  SD295:  { label: 'SD295',  F: 295, sigma_ta: 175, tau_allow: 100 },
  SD345:  { label: 'SD345',  F: 345, sigma_ta: 200, tau_allow: 115 },
  SD390:  { label: 'SD390',  F: 390, sigma_ta: 230, tau_allow: 130 },
};

export const GRADE_OPTIONS = Object.keys(STEEL_GRADES) as SteelGradeKey[];

// ---- 断面プリセット -----------------------------------------

export interface SectionPreset {
  key: string;
  label: string;
  type: 'H' | 'L';
  // H形鋼寸法
  H?: number;
  B?: number;
  tw?: number;
  tf?: number;
  // 山形鋼 (直接入力値)
  A_mm2?: number;
  rmin_mm?: number;
}

/** 主桁・横桁用 H形鋼プリセット */
export const H_SECTION_PRESETS: SectionPreset[] = [
  { key: 'H-300×150×6.5×9',   label: 'H-300×150×6.5×9',   type: 'H', H:  300, B: 150, tw:  6.5, tf:  9 },
  { key: 'H-300×300×10×15',   label: 'H-300×300×10×15',   type: 'H', H:  300, B: 300, tw: 10,   tf: 15 },
  { key: 'H-400×200×8×13',    label: 'H-400×200×8×13',    type: 'H', H:  400, B: 200, tw:  8,   tf: 13 },
  { key: 'H-500×200×10×16',   label: 'H-500×200×10×16',   type: 'H', H:  500, B: 200, tw: 10,   tf: 16 },
  { key: 'H-600×200×11×17',   label: 'H-600×200×11×17',   type: 'H', H:  600, B: 200, tw: 11,   tf: 17 },
  { key: 'H-700×300×13×24',   label: 'H-700×300×13×24',   type: 'H', H:  700, B: 300, tw: 13,   tf: 24 },
  { key: 'H-800×300×14×26',   label: 'H-800×300×14×26',   type: 'H', H:  800, B: 300, tw: 14,   tf: 26 },
  { key: 'H-900×300×16×28',   label: 'H-900×300×16×28',   type: 'H', H:  900, B: 300, tw: 16,   tf: 28 },
  { key: 'H-1000×350×16×32',  label: 'H-1000×350×16×32',  type: 'H', H: 1000, B: 350, tw: 16,   tf: 32 },
  { key: 'H-1200×400×19×40',  label: 'H-1200×400×19×40',  type: 'H', H: 1200, B: 400, tw: 19,   tf: 40 },
];

/** 斜材・ブレース用 等辺山形鋼プリセット */
export const L_SECTION_PRESETS: SectionPreset[] = [
  { key: 'L-65×65×6',    label: 'L-65×65×6',    type: 'L', A_mm2:  742, rmin_mm: 12.7 },
  { key: 'L-75×75×6',    label: 'L-75×75×6',    type: 'L', A_mm2:  878, rmin_mm: 14.9 },
  { key: 'L-90×90×7',    label: 'L-90×90×7',    type: 'L', A_mm2: 1230, rmin_mm: 17.8 },
  { key: 'L-100×100×10', label: 'L-100×100×10', type: 'L', A_mm2: 1920, rmin_mm: 19.5 },
  { key: 'L-120×120×12', label: 'L-120×120×12', type: 'L', A_mm2: 2750, rmin_mm: 23.4 },
  { key: 'L-150×150×15', label: 'L-150×150×15', type: 'L', A_mm2: 4320, rmin_mm: 29.3 },
];

export const ALL_PRESETS: SectionPreset[] = [
  ...H_SECTION_PRESETS,
  ...L_SECTION_PRESETS,
];

// ---- Lookup helpers -----------------------------------------

export function getSectionPreset(key: string): SectionPreset | undefined {
  return ALL_PRESETS.find(p => p.key === key);
}

/** 山形鋼の断面積 (mm²) を返す */
export function getLSectionArea(key: string): number {
  return getSectionPreset(key)?.A_mm2 ?? 1920;
}

/** 山形鋼の最小断面二次半径 (mm) を返す */
export function getLSectionRmin(key: string): number {
  return getSectionPreset(key)?.rmin_mm ?? 19.5;
}
