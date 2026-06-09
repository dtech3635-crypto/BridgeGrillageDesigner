// ============================================================
// Grillage Analysis Engine — Leonhardt Method (UI入力方式対応)
// ============================================================

import type {
  AnalysisInput,
  AnalysisResult,
  DistributionCoefficients,
  DesignForce,
  StressCheckResult,
  SectionProperties,
  BeamElementProps,
  SteelGradeKey,
  CrossBeamDesignForce,
  CrossBeamCheckResult,
} from '../types/bridge';
import { T_LOAD, B_LOAD, GAMMA_CONCRETE, GAMMA_ASPHALT } from '../types/bridge';
import { computeIBeam, computeComposite, computePlateGirder, computeFlangeBuckling, effectiveFlangeWidth, computeStiffness } from './sectionProps';
import { computeInfluenceLines } from './influenceLine';
import { computeReactions } from './reactionAnalyzer';
import {
  computeDiagonalForces,
  checkDiagonals,
  diagonalSelfWeightPerGirder,
} from './diagonalAnalyzer';
import {
  getSectionPreset,
  STEEL_GRADES,
  getLSectionArea,
  getLSectionRmin,
} from './sectionPresets';

// ---- Section resolver --------------------------------------

/** BeamElementProps → SectionProperties に変換 */
function resolveBeamSection(
  props: BeamElementProps | undefined,
  L: number,
  girderSpacing: number,
): SectionProperties {
  const fallback = computeIBeam('H-700×300×13×24', 700, 300, 13, 24);
  if (!props) return fallback;

  // ---- 鈑桁自由入力モード ----
  if (props.customPG) {
    const raw = computePlateGirder(props.customPG);
    if (props.isComposite && props.slabThickness > 0) {
      const bEff = effectiveFlangeWidth(L, girderSpacing, props.customPG.bf, props.slabThickness);
      const comp = computeComposite(raw, bEff, props.slabThickness);
      comp.isComposite = true;
      // pg情報を引き継ぐ
      comp.pg = props.customPG;
      return comp;
    }
    raw.isComposite = false;
    return raw;
  }

  // ---- プリセット H形鋼モード ----
  // 段違い時は i端断面（スパン中央側）を代表断面として使用
  const key = props.isStepped && props.sectionKeyI ? props.sectionKeyI : props.sectionKey;
  const preset = getSectionPreset(key);
  if (!preset || preset.type !== 'H') return fallback;

  const raw = computeIBeam(
    preset.key,
    preset.H!,
    preset.B!,
    preset.tw!,
    preset.tf!,
  );

  if (props.isComposite && props.slabThickness > 0) {
    const bEff = effectiveFlangeWidth(L, girderSpacing, preset.B!, props.slabThickness);
    const comp = computeComposite(raw, bEff, props.slabThickness);
    comp.isComposite = true;
    return comp;
  }

  raw.isComposite = false;
  return raw;
}

/** 桁ごとの代表断面を解決（スパン中央要素を使用）
 *
 * 各部材は CAD の節点間 1 要素であり、独自の断面を持つ。
 * Leonhardt 応力照査では最大モーメント点（スパン中央）の断面を代表値とする。
 */
function resolveGirderSections(input: AnalysisInput): SectionProperties[] {
  const { model, beamProps } = input;
  const { numGirders, girderSpacing, spanLength: L } = model;
  const midX = L / 2;

  return Array.from({ length: numGirders }, (_, g) => {
    // この桁の全主桁要素
    const girderBeams = model.beams.filter(b => {
      if (b.type !== 'main') return false;
      const ni = model.nodes[b.nodeI];
      return Math.round((ni?.y ?? 0) / girderSpacing) === g;
    });

    if (girderBeams.length === 0) return resolveBeamSection(undefined, L, girderSpacing);

    // スパン中央に最も近い要素（各要素の中点x座標で判定）
    const midspanBeam = girderBeams.reduce((best, b) => {
      const ni = model.nodes[b.nodeI], nj = model.nodes[b.nodeJ];
      const mx = ((ni?.x ?? 0) + (nj?.x ?? 0)) / 2;
      const bestNi = model.nodes[best.nodeI], bestNj = model.nodes[best.nodeJ];
      const bestMx = ((bestNi?.x ?? 0) + (bestNj?.x ?? 0)) / 2;
      return Math.abs(mx - midX) < Math.abs(bestMx - midX) ? b : best;
    });

    // 変断面要素の代表断面: i端断面（スパン中央側）を優先
    const props = beamProps[midspanBeam.id];
    return resolveBeamSection(props, L, girderSpacing);
  });
}

/** 桁ごとの鋼材種別を取得 */
function getGirderGrade(gIdx: number, input: AnalysisInput): SteelGradeKey {
  const { model, beamProps } = input;
  const a = model.girderSpacing;
  const firstBeam = model.beams.find(b => {
    if (b.type !== 'main') return false;
    const ni = model.nodes[b.nodeI];
    return Math.round((ni?.y ?? 0) / a) === gIdx;
  });
  return (firstBeam ? beamProps[firstBeam.id]?.steelGrade : undefined) ?? 'SD345';
}

// ---- Leonhardt Distribution --------------------------------

function buildDistributionMatrix(n: number, alpha: number): number[][] {
  if (n === 1) return [[1]];
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let s = 0; s < n; s++) {
    const xi_s = s / (n - 1);
    for (let r = 0; r < n; r++) {
      const xi_r = r / (n - 1);
      let eta = 1 / n;
      for (let m = 1; m < n; m++) {
        const Phi_m = 1 + (m / (n - 1)) ** 2 * Math.PI ** 2 * alpha;
        eta += (2 / n) * Math.cos(m * Math.PI * xi_r) * Math.cos(m * Math.PI * xi_s) / Phi_m;
      }
      K[s][r] = Math.max(0, eta);
    }
    const sum = K[s].reduce((a, v) => a + v, 0);
    if (sum > 0) K[s] = K[s].map(v => v / sum);
  }
  return K;
}

export function computeDistribution(input: AnalysisInput): DistributionCoefficients {
  const { model, beamProps } = input;

  // 主桁 EI: 全主桁要素の平均（部材ごとに断面が異なる場合に対応）
  const mainBeams  = model.beams.filter(b => b.type === 'main');
  const crossBeams = model.beams.filter(b => b.type === 'cross');

  const avgEI = (beams: typeof mainBeams) => {
    if (beams.length === 0) return computeStiffness(resolveBeamSection(undefined, model.spanLength, model.girderSpacing)).EI;
    return beams.reduce((sum, b) => {
      const sec = resolveBeamSection(beamProps[b.id], model.spanLength, model.girderSpacing);
      return sum + computeStiffness(sec).EI;
    }, 0) / beams.length;
  };

  const EI_main  = avgEI(mainBeams);
  const EI_cross = avgEI(crossBeams);

  const L = model.spanLength;
  const b = model.crossBeamPositions.length > 1
    ? model.crossBeamPositions[1] - model.crossBeamPositions[0]
    : L / 2;

  const alpha = (EI_cross * L) / (EI_main * b);
  const matrix = buildDistributionMatrix(model.numGirders, alpha);

  const maxFactors = Array.from({ length: model.numGirders }, (_, r) =>
    Math.max(...matrix.map(row => row[r]))
  );
  const girderPositions = Array.from(
    { length: model.numGirders },
    (_, i) => i * model.girderSpacing
  );

  return { alpha, matrix, girderPositions, maxFactors };
}

// ---- Dead Load ---------------------------------------------

/**
 * 桁別死荷重強度 (N/mm) の計算
 *
 * 外桁（G1, Gn）と内桁で負担幅・高欄荷重が異なる:
 *   外桁: 負担幅 = tributaryWidth_ext（張出し込み）  + 高欄荷重 1/2
 *   内桁: 負担幅 = tributaryWidth                   + 高欄なし
 *
 * 桁数が 1〜2 の場合はすべて外桁扱い。
 */
function computeDeadLoadsPerGirder(input: AnalysisInput): number[] {
  const { deadLoad, model } = input;
  const n = model.numGirders;

  const bT_ext = (deadLoad.tributaryWidth_ext ?? deadLoad.tributaryWidth) * 1000; // mm
  const bT_int = deadLoad.tributaryWidth * 1000;                                  // mm

  const gamma_s = (deadLoad.steelUnitWeight ?? 77) * 1e-6;   // N/mm³
  const A_main  = (deadLoad.mainGirderArea_cm2 ?? 215) * 100; // mm²
  const w_steel = gamma_s * A_main;
  const w_other = (deadLoad.otherLoad * 1000) / 1000;         // kN/m → N/mm

  // 高欄: 両側合計を外桁2本（または桁数が2未満なら全桁）に等分
  const numExt = n <= 2 ? n : 2;
  const w_guard_per_ext =
    deadLoad.guardrailLoad > 0
      ? (deadLoad.guardrailLoad * 1000) / numExt / 1000   // N/mm
      : 0;

  return Array.from({ length: n }, (_, i) => {
    const isExt = n <= 2 || i === 0 || i === n - 1;
    const bT    = isExt ? bT_ext : bT_int;
    const w_guard = isExt ? w_guard_per_ext : 0;

    const w_slab = GAMMA_CONCRETE * deadLoad.slabThickness * bT;
    const w_pave = GAMMA_ASPHALT  * deadLoad.pavementThickness * bT;

    return w_slab + w_pave + w_guard + w_other + w_steel;
  });
}

// ---- Impact Factor -----------------------------------------

export function impactFactor(spanLength_mm: number): number {
  const L = spanLength_mm / 1000;
  return Math.min(0.4, Math.max(0.1, 20 / (50 + L)));
}

// ---- Live Load Forces --------------------------------------

function tLoadMoment(L: number, eta: number, i: number): number {
  const Pr = T_LOAD.rearAxle, Pf = T_LOAD.frontAxle, d = T_LOAD.axleSpacing;
  const eta_rear  = L / 4;
  const x_front   = L / 2 + d;
  const eta_front = x_front < L ? (L / 2) * (L - x_front) / L : 0;
  return (Pr * eta_rear + Pf * eta_front) * eta * (1 + i);
}

function tLoadShear(L: number, eta: number, i: number): number {
  const Pr = T_LOAD.rearAxle, Pf = T_LOAD.frontAxle, d = T_LOAD.axleSpacing;
  return (Pr * (L - 0) / L + Pf * (L - d) / L) * eta * (1 + i);
}

function bLoadMoment(L: number, eta: number, i: number): number {
  const w = B_LOAD.distributed, bT = 1000, P = B_LOAD.concentrated;
  return ((w * bT * L ** 2 / 8) + P * L / 4) * eta * (1 + i);
}

function bLoadShear(L: number, eta: number, i: number): number {
  const w = B_LOAD.distributed, bT = 1000, P = B_LOAD.concentrated;
  return ((w * bT * L / 2) + P) * eta * (1 + i);
}

// ---- Stress Check ------------------------------------------

/**
 * 主桁応力度照査（曲げ・せん断・合成コンクリート・圧縮フランジ座屈）
 *
 * @param l0_max  圧縮フランジ非支持長（最大横桁間隔 mm）
 */
function runStressCheck(
  forces: DesignForce[],
  girderSections: SectionProperties[],
  input: AnalysisInput,
  l0_max: number,
): StressCheckResult[] {
  const CONC_ALLOW = 10;  // f'c=30: σ_ca = 10 N/mm²

  return forces.map((f, idx) => {
    const sec   = girderSections[idx] ?? girderSections[0];
    const grade = getGirderGrade(idx, input);
    const gp    = STEEL_GRADES[grade];
    const sigma_sa   = gp.sigma_ta;
    const tau_allow  = gp.tau_allow;

    const M = f.M_design, V = f.V_design;
    const Zx_s = sec.isComposite ? sec.Zx_steel : sec.Zx;
    const sigma_b = M / Zx_s;  // 下端（引張）応力度

    // 上端応力度（非合成鈑桁で非対称断面の場合）
    const sigma_top: number | undefined =
      !sec.isComposite && sec.Zx_top_fiber
        ? M / sec.Zx_top_fiber
        : undefined;

    // 有効腹板高: 鈑桁(pg)の場合は hw を直接使用
    const hw = sec.pg ? sec.pg.hw : sec.H - 2 * sec.tf;
    const Aw = hw * sec.tw;
    const tau = V / Aw;

    const sigma_c = sec.isComposite && sec.Zx_conc > 0 ? M / sec.Zx_conc : 0;
    const ratio_b = sigma_b / sigma_sa;
    const ratio_s = tau    / tau_allow;
    const ratio_c = sec.isComposite ? sigma_c / CONC_ALLOW : 0;

    // ---- 圧縮フランジ座屈照査 (Phase 3) ----
    // 非合成鈑桁のみ対象（合成桁は床版が上フランジを拘束するため適用外）
    // 対象フランジ: 上フランジ（正曲げ時の圧縮側）
    let sigma_caf: number | undefined;
    let b1_tf:     number | undefined;
    let cfMode:    'lat' | 'loc' | undefined;
    let ratio_cf:  number | undefined;
    let cfOK:      boolean | undefined;

    if (!sec.isComposite && sec.pg) {
      const pg = sec.pg;
      // 上フランジ（圧縮側）で照査
      const fb = computeFlangeBuckling(pg.bf, pg.tf_top, pg.tw, l0_max, gp.F, gp.sigma_ta);
      sigma_caf = fb.sigma_caf;
      b1_tf     = fb.b1_tf;
      cfMode    = fb.mode;
      // 上端応力度（対称の場合は sigma_b と同値）
      const sigma_c_steel = sigma_top ?? sigma_b;
      ratio_cf  = sigma_c_steel / sigma_caf;
      cfOK      = ratio_cf <= 1.0;
    }

    const cfFails = cfOK === false;
    return {
      girderId: f.girderId,
      sigma_b, sigma_sa, ratio_b, bendingOK: ratio_b <= 1.0,
      tau, tau_a: tau_allow, ratio_s, shearOK: ratio_s <= 1.0,
      sigma_c, sigma_ca: CONC_ALLOW, ratio_c, concreteOK: ratio_c <= 1.0,
      sigma_top,
      sigma_caf, b1_tf, cfMode, ratio_cf, cfOK,
      allOK: ratio_b <= 1.0 && ratio_s <= 1.0 && ratio_c <= 1.0 && !cfFails,
      steelGrade: grade,
    };
  });
}

// ---- Cross Beam Analysis -----------------------------------

/**
 * 横桁設計断面力の算定
 *
 * 荷重モデル:
 *   死荷重: 床版＋舗装の分布荷重 w_DL (N/mm) — 横桁の負担スパン長に比例
 *   活荷重: T荷重後軸の片輪 P=50kN を中央に置いた集中荷重（簡略包絡法）
 *           M_LL = P × a/4  (単純梁中央集中荷重)
 *           V_LL = P/2
 *
 * 横桁スパン: a = girderSpacing (主桁間隔)
 * 負担長   : 前後横桁の中間距離（端横桁は片側のみ）
 */
function computeCrossBeamForces(input: AnalysisInput): CrossBeamDesignForce[] {
  const { model, deadLoad } = input;
  const a = model.girderSpacing;   // 横桁スパン (mm)
  const L = model.spanLength;
  const i = impactFactor(L);
  const positions = model.crossBeamPositions;  // mm[]

  // 負担スパン方向長さ（各横桁位置）
  const tribLengths = positions.map((x, idx) => {
    const prev = idx > 0 ? positions[idx - 1] : x;
    const next = idx < positions.length - 1 ? positions[idx + 1] : x;
    return (x - prev) / 2 + (next - x) / 2;
  });

  // 床版＋舗装の面荷重 (N/mm²)
  const q_slab = GAMMA_CONCRETE * deadLoad.slabThickness;
  const q_pave = GAMMA_ASPHALT  * deadLoad.pavementThickness;
  const q_total = q_slab + q_pave;  // N/mm²

  // 活荷重輪荷重: 後軸片輪
  const P_wheel = T_LOAD.rearAxle / 2;  // 50,000 N

  return positions.map((x, idx) => {
    const bTrib = tribLengths[idx];         // mm
    const w_DL  = q_total * bTrib;          // N/mm (横桁スパン方向の分布荷重)

    // 死荷重断面力（単純梁）
    const M_DL = w_DL * a * a / 8;
    const V_DL = w_DL * a / 2;

    // 活荷重断面力（後軸片輪を中央集中荷重として包絡）
    const M_LL = P_wheel * a / 4;
    const V_LL = P_wheel / 2;

    return {
      positionIdx: idx,
      position_x: x,
      tributaryLength: bTrib,
      w_DL, M_DL, V_DL,
      M_LL, V_LL,
      impactFactor: i,
      M_design: M_DL + M_LL * (1 + i),
      V_design: V_DL + V_LL * (1 + i),
    };
  });
}

/**
 * 横桁応力度照査
 * 各横桁位置の代表断面（その位置にある横桁要素の中から最初の要素を使用）
 */
function runCrossBeamCheck(
  forces: CrossBeamDesignForce[],
  input: AnalysisInput,
): CrossBeamCheckResult[] {
  const { model, beamProps } = input;
  const L = model.spanLength;
  const a = model.girderSpacing;

  return forces.map(f => {
    // この x 位置の横桁要素を取得
    const crossAtPos = model.beams.find(b => {
      if (b.type !== 'cross') return false;
      const ni = model.nodes[b.nodeI];
      return Math.abs((ni?.x ?? -1) - f.position_x) < 1;
    });

    const props = crossAtPos ? beamProps[crossAtPos.id] : undefined;
    const sec   = resolveBeamSection(props, L, a);
    const grade = props?.steelGrade ?? 'SM400';
    const gp    = STEEL_GRADES[grade];

    const sigma_b = f.M_design / sec.Zx;
    const hw = sec.H - 2 * sec.tf;
    const Aw = hw * sec.tw;
    const tau = f.V_design / Aw;

    const ratio_b = sigma_b / gp.sigma_ta;
    const ratio_s = tau    / gp.tau_allow;

    return {
      positionIdx: f.positionIdx,
      position_x:  f.position_x,
      section: sec,
      steelGrade: grade,
      M_design: f.M_design,
      V_design: f.V_design,
      sigma_b, sigma_sa: gp.sigma_ta, ratio_b, bendingOK: ratio_b <= 1.0,
      tau,     tau_a: gp.tau_allow,   ratio_s, shearOK:   ratio_s <= 1.0,
      allOK: ratio_b <= 1.0 && ratio_s <= 1.0,
    };
  });
}

// ---- Main Entry Point --------------------------------------

export function runAnalysis(input: AnalysisInput): AnalysisResult {
  const warnings: string[] = [];
  const { model, deadLoad, diagProps } = input;
  const L = model.spanLength;
  const n = model.numGirders;
  const i = impactFactor(L);

  // 1. Distribution
  const distribution = computeDistribution(input);

  // 2. Influence lines
  const influenceLines = computeInfluenceLines(L, n, distribution.matrix);

  // 3. Dead load（桁別）
  const diagonals = model.diagonals ?? [];
  const diag_sw = diagonals.length > 0
    ? diagonalSelfWeightPerGirder(
        diagonals,
        deadLoad.steelUnitWeight ?? 77,
        (deadLoad.diagonalArea_cm2 ?? 19.2) * 100,
        n, L
      )
    : 0;
  const w_DLs = computeDeadLoadsPerGirder(input);   // 桁別死荷重 (N/mm)

  // 4. Design forces（桁別 w_DL を使用）
  const designForces: DesignForce[] = Array.from({ length: n }, (_, r) => {
    const w_DL = w_DLs[r] + diag_sw;
    const M_DL = w_DL * L * L / 8;
    const V_DL = w_DL * L / 2;
    const eta = distribution.maxFactors[r];
    let M_LL: number, V_LL: number;
    if (input.liveLoadType === 'T') {
      M_LL = tLoadMoment(L, eta, 0);
      V_LL = tLoadShear(L, eta, 0);
    } else {
      M_LL = bLoadMoment(L, eta, 0);
      V_LL = bLoadShear(L, eta, 0);
    }
    return {
      girderId: r,
      distributionFactor: eta,
      w_DL, M_DL, V_DL,
      M_LL, V_LL,
      impactFactor: i,
      M_design: M_DL + M_LL * (1 + i),
      V_design: V_DL + V_LL * (1 + i),
    };
  });

  // 5. Girder sections + stress checks
  const girderSections = resolveGirderSections(input);

  // 圧縮フランジ非支持長 l₀ = 最大横桁間隔（最も不利なパネル）
  const cbPos  = [0, ...model.crossBeamPositions.filter(x => x > 0 && x < L), L];
  const l0_max = cbPos.slice(1).reduce(
    (mx, x, i) => Math.max(mx, x - cbPos[i]), 0
  );

  const stressChecks = runStressCheck(designForces, girderSections, input, l0_max);
  if (stressChecks.some(c => !c.allOK)) {
    warnings.push('一部の主桁で許容応力度超過があります');
  }

  // 5b. Cross beam forces + checks
  const crossBeamForces  = computeCrossBeamForces(input);
  const crossBeamChecks  = runCrossBeamCheck(crossBeamForces, input);
  if (crossBeamChecks.some(c => !c.allOK)) {
    warnings.push('一部の横桁で許容応力度超過があります');
  }

  // 6. Reactions
  const reactions = computeReactions(input, designForces, i);

  // 7. Diagonal forces & buckling
  const diagonalForces = diagonals.length > 0
    ? computeDiagonalForces(diagonals, distribution, deadLoad, L, i, input.liveLoadType)
    : [];

  const diagonalChecks = diagonals.length > 0
    ? (() => {
        // 各斜材のプロパティを取得（未設定時は最初のdiagPropsを使用）
        return diagonals.map(diag => {
          const dp = diagProps[diag.id];
          const areaKey = dp?.sectionKey ?? 'L-100×100×10';
          const a_mm2   = getLSectionArea(areaKey);
          const rmin    = getLSectionRmin(areaKey);
          const force   = diagonalForces.find(f => f.memberId === diag.id);
          return checkDiagonals([diag], force ? [force] : [], a_mm2, rmin)[0];
        });
      })()
    : [];

  if (diagonalChecks.some(c => c && !c.ok)) {
    warnings.push('一部の斜材で許容応力度（座屈）超過があります');
  }

  // Validation
  if (n < 2) warnings.push('主桁本数が1本です。格子桁理論の適用条件を確認してください。');
  if (distribution.alpha < 0.05) warnings.push('α値が小さく、横桁の剛性が極端に低い可能性があります。');
  if (distribution.alpha > 20) warnings.push('α値が大きく、剛床条件に近づいています。');

  return {
    distribution,
    influenceLines,
    designForces,
    stressChecks,
    girderSections,
    reactions,
    diagonalForces,
    diagonalChecks: diagonalChecks.filter(Boolean) as typeof diagonalChecks,
    crossBeamForces,
    crossBeamChecks,
    warnings,
    computedAt: Date.now(),
  };
}
