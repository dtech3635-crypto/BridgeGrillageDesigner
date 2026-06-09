import type { SectionProperties, PlateGirderDims } from '../types/bridge';
import { E_STEEL, E_CONCRETE } from '../types/bridge';

// ============================================================
// I-shape (H-shape) section property calculator
// All dimensions in mm, results in mm², mm⁴, mm³
// ============================================================

export function computeIBeam(
  label: string,
  H: number, B: number, tw: number, tf: number
): SectionProperties {
  const hw = H - 2 * tf;

  // Area
  const A = 2 * B * tf + hw * tw;

  // Moment of inertia (strong axis, exact formula for I-section)
  const Ix = (B * H ** 3 - (B - tw) * hw ** 3) / 12;

  // Elastic section modulus (extreme fiber = H/2 from centroid)
  const Zx = Ix / (H / 2);

  // St. Venant torsional constant (open section, thin-wall approx)
  const J = (1 / 3) * (2 * B * tf ** 3 + hw * tw ** 3);

  return {
    label,
    H, B, tw, tf,
    A, Ix, Zx, J,
    isComposite: false,
    slabWidth: 0,
    slabThickness: 0,
    n_ratio: E_STEEL / E_CONCRETE,
    Ix_comp: Ix,
    Zx_steel: Zx,
    Zx_conc: 0,
    yNA_comp: H / 2,
  };
}

// ============================================================
// Composite section: steel I-beam + RC slab
// Reference: JRA H29 §5.5 (transformed section method)
// Positive bending: slab in compression, steel bottom in tension
// ============================================================

export function computeComposite(
  steel: SectionProperties,
  slabWidth: number,    // effective flange width (mm)
  slabThickness: number // mm
): SectionProperties {
  const n = steel.n_ratio;   // modular ratio E_steel / E_concrete

  // Transformed slab (in steel units)
  const A_slab = (slabWidth * slabThickness) / n;

  // Centroid heights measured from bottom of steel
  const y_steel = steel.H / 2;                     // steel section centroid
  const y_slab  = steel.H + slabThickness / 2;     // slab centroid

  // Composite centroid from bottom of steel
  const A_total = steel.A + A_slab;
  const yNA = (steel.A * y_steel + A_slab * y_slab) / A_total;

  // Composite Ix (parallel axis theorem)
  const Ix_steel_shifted = steel.Ix + steel.A * (yNA - y_steel) ** 2;
  const Ix_slab_own      = (slabWidth * slabThickness ** 3) / (12 * n);
  const Ix_slab_shifted  = Ix_slab_own + A_slab * (y_slab - yNA) ** 2;
  const Ix_comp          = Ix_steel_shifted + Ix_slab_shifted;

  // Bottom steel fiber (tension side, distance = yNA from bottom)
  const Zx_steel = Ix_comp / yNA;

  // Top of slab (compression side, in concrete units)
  // σ_c = M × dist_top / (n × Ix_comp) = M / Z_conc
  // → Z_conc = n × Ix_comp / dist_top
  // 換算断面法: コンクリート応力 = 換算応力 / n
  //            換算断面係数を n 倍することで応力計算に直接使える
  const dist_top = (steel.H + slabThickness) - yNA;
  const Zx_conc  = n * (Ix_comp / dist_top);  // n を掛ける（従来の誤りを修正）

  return {
    ...steel,
    isComposite: true,
    slabWidth,
    slabThickness,
    Ix_comp,
    Zx_steel,
    Zx_conc,
    yNA_comp: yNA,
  };
}

// ============================================================
// Plate girder (鈑桁) section — free-form input
// Supports asymmetric top/bottom flanges
// Layout (from bottom):  [bot flange tf_bot] [web hw] [top flange tf_top]
// ============================================================

export function computePlateGirder(
  dims: PlateGirderDims,
  label?: string
): SectionProperties {
  const { hw, tw, bf, tf_top, tf_bot } = dims;

  // Total height
  const H = hw + tf_top + tf_bot;

  // Areas
  const A_web  = hw * tw;
  const A_top  = bf * tf_top;
  const A_bot  = bf * tf_bot;
  const A      = A_web + A_top + A_bot;

  // Centroid heights from bottom of section (bottom of bot flange)
  const y_bot  = tf_bot / 2;
  const y_web  = tf_bot + hw / 2;
  const y_top  = tf_bot + hw + tf_top / 2;

  // Neutral axis from bottom
  const yNA = (A_bot * y_bot + A_web * y_web + A_top * y_top) / A;

  // Second moment of area (own Ix + parallel axis)
  const Ix_bot  = (bf * tf_bot ** 3) / 12 + A_bot * (yNA - y_bot) ** 2;
  const Ix_web  = (tw * hw ** 3) / 12    + A_web * (yNA - y_web) ** 2;
  const Ix_top  = (bf * tf_top ** 3) / 12 + A_top * (yNA - y_top) ** 2;
  const Ix      = Ix_bot + Ix_web + Ix_top;

  // Section moduli
  const dist_bot = yNA;            // distance to bottom fiber (tension side)
  const dist_top = H - yNA;        // distance to top fiber (compression side)
  const Zx      = Ix / dist_bot;   // bottom (tension)
  const Zx_top  = Ix / dist_top;   // top (compression)

  // St. Venant torsional constant
  const J = (1 / 3) * (2 * bf * tf_bot ** 3 + 2 * bf * tf_top ** 3 + hw * tw ** 3);
  // Note: tf_bot/tf_top same B, averaged: if asymmetric use each flange separately
  // More precise:
  // J = (1/3)*(bf*tf_bot^3 + bf*tf_top^3 + hw*tw^3)  [each branch]

  const secLabel = label ?? `PG-${hw}×${tw}+${bf}×(${tf_top}/${tf_bot})`;

  return {
    label: secLabel,
    H,
    B: bf,
    tw,
    tf: Math.max(tf_top, tf_bot),   // representative tf (use max flange)
    A,
    Ix,
    Zx,
    Zx_top_fiber: Zx_top,
    J,
    isComposite: false,
    slabWidth: 0,
    slabThickness: 0,
    n_ratio: E_STEEL / E_CONCRETE,
    Ix_comp: Ix,
    Zx_steel: Zx,
    Zx_conc: 0,
    yNA_comp: dist_bot,
    pg: dims,
  };
}

// Effective flange width per JRA H29 §5.5.2
export function effectiveFlangeWidth(
  spanLength: number,        // mm
  girderSpacing: number,     // mm
  flangeWidth: number,       // mm (steel top flange)
  slabThickness = 200        // mm (JRA H29 §5.5.2)
): number {
  return Math.min(
    spanLength / 4,
    12 * slabThickness + flangeWidth,
    girderSpacing
  );
}

// ============================================================
// 圧縮フランジ座屈照査 (JRA H29 §5.2.3)
//
// 局部座屈:  b₁/tf > 10.5 → σcat = 23000×(tf/b₁)²
// 横倒れ座屈: b₁/tf ≤ 10.5 → σcag = F - 4.6×(l₀/bf - 3.5)
//
// b₁ = (bf - tw) / 2  (フランジ張出し長)
// l₀ = 圧縮フランジの非支持長（横桁間隔）
// ============================================================

export interface FlangeBucklingResult {
  bf:       number;   // フランジ幅 (mm)
  tf:       number;   // フランジ厚 (mm)
  b1:       number;   // フランジ張出し長 (mm)
  b1_tf:    number;   // スランダーネス比 b₁/tf
  sigma_caf: number;  // 圧縮フランジ許容応力度 (N/mm²)
  mode:     'lat' | 'loc';  // 横倒れ or 局部
}

export function computeFlangeBuckling(
  bf: number,       // 圧縮フランジ幅 (mm)
  tf: number,       // 圧縮フランジ厚 (mm)
  tw: number,       // 腹板厚 (mm)
  l0: number,       // 非支持長（横桁間隔 mm）
  F:  number,       // 降伏応力 (N/mm²)
  sigma_ta: number, // 基本許容曲げ応力度 (N/mm²)
): FlangeBucklingResult {
  const b1     = (bf - tw) / 2;                 // フランジ張出し長
  const b1_tf  = b1 / tf;                        // スランダーネス比

  let sigma_caf: number;
  let mode: 'lat' | 'loc';

  if (b1_tf <= 10.5) {
    // 横倒れ座屈支配: σcag = F - 4.6×(l₀/bf - 3.5)
    const lob = l0 / bf;
    const raw = F - 4.6 * Math.max(0, lob - 3.5);
    // σcag は σta を超えない、かつ 0.5×σta を下限とする
    sigma_caf = Math.min(sigma_ta, Math.max(sigma_ta * 0.5, raw));
    mode      = 'lat';
  } else {
    // 局部座屈支配: σcat = 23000×(tf/b₁)²
    sigma_caf = 23_000 * (tf / b1) ** 2;
    // 上限は σta
    sigma_caf = Math.min(sigma_caf, sigma_ta);
    mode      = 'loc';
  }

  return { bf, tf, b1, b1_tf, sigma_caf, mode };
}

// Stiffness parameters: EI (N·mm²), GJ (N·mm²)
export function computeStiffness(sec: SectionProperties): { EI: number; GJ: number } {
  const Ix = sec.isComposite ? sec.Ix_comp : sec.Ix;
  return {
    EI: 200_000 * Ix,
    GJ: 77_000 * sec.J,
  };
}
