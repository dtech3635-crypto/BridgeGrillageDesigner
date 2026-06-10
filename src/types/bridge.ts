// ============================================================
// BridgeGrillageDesigner — Core type definitions
// Units: mm (geometry), N/mm² (stress), N (force), N·mm (moment)
// ============================================================

export interface Node {
  id: number;
  x: number;
  y: number;
  z: number;
  isSupport: boolean;
}

export interface Beam {
  id: number;
  nodeI: number;
  nodeJ: number;
  type: 'main' | 'cross' | 'stringer';
  layer: string;
  length: number;
}

// ---- 斜材 --------------------------------------------------

export interface DiagonalMember {
  id: number;
  nodeI: number;
  nodeJ: number;
  length: number;
  angle: number;
  layer: string;
}

export interface DiagonalSection {
  label: string;
  A: number;
  Imin: number;
  rmin: number;
}

export interface DiagonalForce {
  memberId: number;
  N_total: number;
  N_DL: number;
  N_LL: number;
  isTension: boolean;
}

export interface DiagonalCheck {
  memberId: number;
  length: number;
  N_design: number;
  sigma_axial: number;
  lambda: number;
  Lambda_c: number;
  isTension: boolean;
  sigma_allow: number;
  ratio: number;
  ok: boolean;
  bucklingMode: 'euler' | 'inelastic' | 'direct';
}

// ---- GrillageModel -----------------------------------------

export interface GrillageModel {
  nodes: Node[];
  beams: Beam[];
  diagonals: DiagonalMember[];
  spanLength: number;
  numGirders: number;
  girderSpacing: number;
  crossBeamPositions: number[];
  totalWidth: number;
}

export interface SectionProperties {
  label: string;
  H: number;
  B: number;
  tw: number;
  tf: number;
  A: number;
  Ix: number;
  Zx: number;              // 下端断面係数 (mm³)
  Zx_top_fiber?: number;   // 上端断面係数 (mm³) — 非対称断面時に設定
  J: number;
  isComposite: boolean;
  slabWidth: number;
  slabThickness: number;
  n_ratio: number;
  Ix_comp: number;
  Zx_steel: number;
  Zx_conc: number;
  yNA_comp: number;
  // 鈑桁断面寸法（自由入力時に保持）
  pg?: PlateGirderDims;
}

// ---- DeadLoadSettings --------------------------------------

export interface DeadLoadSettings {
  slabThickness: number;
  slabDensity: number;
  pavementThickness: number;
  pavementDensity: number;
  steelUnitWeight: number;
  mainGirderArea_cm2: number;
  diagonalArea_cm2: number;
  diagonalRmin_mm: number;
  guardrailLoad: number;         // 高欄（両側合計）kN/m — 外桁2本に等分配
  otherLoad: number;
  tributaryWidth: number;        // 内桁負担幅 (m)
  tributaryWidth_ext: number;    // 外桁負担幅 (m) — 張出し含む
  totalWidth_m: number;
  numGirders_ui: number;
}

// ---- 要素プロパティ（UI入力方式） -------------------------

/** 鋼材種別 */
export type SteelGradeKey =
  | 'SS400' | 'SM400' | 'SM490' | 'SM490Y' | 'SM520'
  | 'SD295' | 'SD345' | 'SD390';

/** 鈑桁カスタム断面寸法（自由入力モード） */
export interface PlateGirderDims {
  hw: number;      // 腹板高 (mm)
  tw: number;      // 腹板厚 (mm)
  bf: number;      // フランジ幅 (mm) — 上下同幅
  tf_top: number;  // 上フランジ厚 (mm)
  tf_bot: number;  // 下フランジ厚 (mm)
}

/** 梁要素プロパティ（主桁・横桁） */
export interface BeamElementProps {
  sectionKey: string;
  steelGrade: SteelGradeKey;
  isComposite: boolean;
  slabThickness: number;    // mm
  isStepped: boolean;       // 段違い桁
  sectionKeyJ?: string;     // J端断面（段違い時）
  sectionKeyI?: string;     // i端断面（段違い時）
  customPG?: PlateGirderDims; // 鈑桁自由入力（設定時はプリセット無視）
}

/** 斜材プロパティ */
export interface DiagElementProps {
  sectionKey: string;
  steelGrade: SteelGradeKey;
}

// ---- AnalysisInput -----------------------------------------

export type LiveLoadType = 'T' | 'B';

export interface AnalysisInput {
  model: GrillageModel;
  beamProps: Record<number, BeamElementProps>;  // beamId → props
  diagProps: Record<number, DiagElementProps>;  // diagId → props
  deadLoad: DeadLoadSettings;
  liveLoadType: LiveLoadType;
}

// ---- Results -----------------------------------------------

export interface DistributionCoefficients {
  alpha: number;
  matrix: number[][];
  girderPositions: number[];
  maxFactors: number[];
}

export interface InfluenceLineResult {
  girderId: number;
  spanLength: number;
  sectionX: number;
  loadPositions: number[];
  ordinates_n1: number[];
  ordinates_n13: number[];
  ordinates_n135: number[];
  maxOrdinate: number;
  criticalLoadPos: number;
}

export interface DesignForce {
  girderId: number;
  distributionFactor: number;
  w_DL: number;
  M_DL: number;
  V_DL: number;
  M_LL: number;
  V_LL: number;
  impactFactor: number;
  M_design: number;
  V_design: number;
}

export interface StressCheckResult {
  girderId: number;
  sigma_b: number;          // 下端（引張）応力度 (N/mm²) — 主桁鋼材
  sigma_sa: number;         // 鋼材許容曲げ応力度
  ratio_b: number;
  bendingOK: boolean;
  tau: number;
  tau_a: number;
  ratio_s: number;
  shearOK: boolean;
  sigma_c: number;          // コンクリート圧縮応力度（合成桁時）
  sigma_ca: number;
  ratio_c: number;
  concreteOK: boolean;
  /** 上端鋼材圧縮応力度（非合成鈑桁で非対称断面時）*/
  sigma_top?: number;
  // ---- 圧縮フランジ座屈照査 (Phase 3) -------------------------
  /** 圧縮フランジ許容応力度 σca (N/mm²) */
  sigma_caf?: number;
  /** b₁/tf スランダーネス比 (b₁ = (bf-tw)/2) */
  b1_tf?: number;
  /** 照査モード: 'lat'=横倒れ座屈, 'loc'=局部座屈 */
  cfMode?: 'lat' | 'loc';
  /** σ_top / σ_caf */
  ratio_cf?: number;
  cfOK?: boolean;
  // ---- 腹板合成応力度照査 (Phase 4) -------------------------
  /** 腹板上端（上フランジ下端）の曲げ応力度 (N/mm²) */
  sigma_w?: number;
  /** (σ_w/σa)² + (τ/τa)²  ≤ 1.2 */
  ratio_combined?: number;
  combinedOK?: boolean;
  allOK: boolean;
  steelGrade: SteelGradeKey;
}

export interface ReactionResult {
  girderId: number;
  R_DL_left: number;
  R_DL_right: number;
  R_LL_left_max: number;
  R_LL_right_max: number;
  impactFactor: number;
  R_left_total: number;
  R_right_total: number;
}

// ---- 横桁照査 ----------------------------------------------

export interface CrossBeamDesignForce {
  positionIdx: number;
  position_x: number;      // mm (支点からの距離)
  tributaryLength: number; // mm (負担スパン方向長さ)
  w_DL: number;            // N/mm (横桁 1mm 当り死荷重)
  M_DL: number;            // N·mm
  V_DL: number;            // N
  M_LL: number;            // N·mm (衝撃前)
  V_LL: number;            // N   (衝撃前)
  impactFactor: number;
  M_design: number;        // N·mm
  V_design: number;        // N
}

export interface CrossBeamCheckResult {
  positionIdx: number;
  position_x: number;
  section: SectionProperties;
  steelGrade: SteelGradeKey;
  M_design: number;
  V_design: number;
  sigma_b: number;
  sigma_sa: number;
  ratio_b: number;
  bendingOK: boolean;
  tau: number;
  tau_a: number;
  ratio_s: number;
  shearOK: boolean;
  allOK: boolean;
}

export interface AnalysisResult {
  distribution: DistributionCoefficients;
  influenceLines: InfluenceLineResult[];
  designForces: DesignForce[];
  stressChecks: StressCheckResult[];
  girderSections: SectionProperties[];
  reactions: ReactionResult[];
  diagonalForces: DiagonalForce[];
  diagonalChecks: DiagonalCheck[];
  crossBeamForces: CrossBeamDesignForce[];
  crossBeamChecks: CrossBeamCheckResult[];
  warnings: string[];
  computedAt: number;
}

// ---- Material constants ------------------------------------

export const E_STEEL    = 200_000;
export const G_STEEL    =  77_000;
export const E_CONCRETE =  28_000;
export const GAMMA_CONCRETE = 24e-6;
export const GAMMA_ASPHALT  = 22e-6;

export const T_LOAD = {
  rearAxle:    100_000,
  frontAxle:    25_000,
  axleSpacing:   4_000,
  wheelSpacing:  1_800,
} as const;

export const B_LOAD = {
  distributed:      35e-3,
  concentrated:  200_000,
  concentratedAlt: 100_000,
} as const;

export const SM400 = {
  F:         235,
  sigma_ta:  140,
  tau_allow:  80,
} as const;
