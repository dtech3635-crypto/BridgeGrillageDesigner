// ============================================================
// 斜材（トラス要素）解析モジュール
// JRA H29 §5.2 準拠：軸力・座屈照査
//
// 対象: 格子桁の水平面内斜材（横方向せん断伝達ブレース）
//       BEAM_DIAGONAL レイヤーの LINE エンティティ
// ============================================================

import type {
  DiagonalMember,
  DiagonalForce,
  DiagonalCheck,
  DistributionCoefficients,
  DeadLoadSettings,
} from '../types/bridge';
import { E_STEEL, T_LOAD, SM400 } from '../types/bridge';

// ---- JRA H29 §5.2 許容圧縮応力度 ----------------------------
/**
 * 細長比 λ に応じた許容圧縮応力度 σ_ca (N/mm²)
 *   Λ_c = π√(2E/F_y)  ≒ 129.7 for SM400
 *   λ ≤ Λ_c : 非弾性座屈  σ_ca = F_y(1 − 0.5(λ/Λ_c)²) / 1.5
 *   λ > Λ_c : Euler座屈   σ_ca = π²E / (1.5λ²)
 */
export function allowableCompressionJRA(
  lambda: number,
  F_y = SM400.F,
  E = E_STEEL
): number {
  const Lambda_c = Math.PI * Math.sqrt(2 * E / F_y);  // ≒ 129.7
  const safetyFactor = 1.5;

  if (lambda <= Lambda_c) {
    const ratio = lambda / Lambda_c;
    return F_y * (1 - 0.5 * ratio * ratio) / safetyFactor;
  } else {
    return Math.PI * Math.PI * E / (safetyFactor * lambda * lambda);
  }
}

export function limitSlenderness(F_y = SM400.F, E = E_STEEL): number {
  return Math.PI * Math.sqrt(2 * E / F_y);
}

// ---- 斜材軸力の計算 -----------------------------------------
/**
 * 横方向せん断伝達による斜材軸力の算定（簡略法）
 *
 * 考え方：
 *   1. 横方向分配係数の最大偏差 ΔηからT荷重の横方向せん断力を推定
 *   2. 斜材は横方向せん断 V_trans を軸力として伝達: N = V / sin(θ)
 *   3. X型配置では圧縮側が支配（座屈照査が critical）
 *
 * 死荷重軸力：
 *   水平面内ブレースは重力荷重を軸力として受けないため ≈ 0
 *   斜材自重による鉛直力は隣接主桁節点に分配（追加死荷重）
 */
export function computeDiagonalForces(
  diagonals: DiagonalMember[],
  distribution: DistributionCoefficients,
  _deadLoad: DeadLoadSettings,
  _spanLength_mm: number,
  impactFactor: number,
  liveLoadType: 'T' | 'B' = 'T'
): DiagonalForce[] {
  const n = distribution.girderPositions.length;

  // 横方向せん断の基本荷重
  let P_total: number;
  if (liveLoadType === 'T') {
    P_total = T_LOAD.rearAxle + T_LOAD.frontAxle;  // N
  } else {
    P_total = 200_000;  // B荷重集中力 200kN
  }

  // 横方向分配の偏差（最大分配率 − 均等値）= 横方向せん断の起因
  const maxFactor = Math.max(...distribution.maxFactors);
  const deltaEta = maxFactor - 1 / n;

  // 横方向せん断力 = 荷重 × 分配偏差 × 衝撃係数
  const V_trans = P_total * deltaEta * (1 + impactFactor);  // N

  // 斜材自重による付加軸力（近似ゼロ：水平ブレース）
  const N_DL = 0;

  return diagonals.map(diag => {
    const sinTheta = Math.abs(Math.sin(diag.angle));
    if (sinTheta < 0.05) {
      // ほぼ縦方向 → 軸力ゼロ扱い
      return { memberId: diag.id, N_total: 0, N_DL: 0, N_LL: 0, isTension: false };
    }

    // N = V_trans / sin(θ)、圧縮を支配として設定（X型の圧縮側）
    const N_LL = -Math.abs(V_trans / sinTheta);   // 圧縮（負）

    // 同じパネルのもう一方の斜材は引張だが、圧縮で座屈照査
    const N_total = N_DL + N_LL;

    return {
      memberId: diag.id,
      N_total,
      N_DL,
      N_LL,
      isTension: N_total >= 0,
    };
  });
}

// ---- 座屈照査 ------------------------------------------------

export function checkDiagonals(
  diagonals: DiagonalMember[],
  forces: DiagonalForce[],
  diagonalArea_mm2: number,
  diagonalRmin_mm: number,
  effectiveLengthFactor = 0.7  // K: ガセットプレート両端溶接/ボルト接合 = 0.7 (JRA H29 §5.2)
): DiagonalCheck[] {
  const Lambda_c = limitSlenderness();
  const sigma_ta  = SM400.sigma_ta;   // 許容引張応力度 140 N/mm²

  return diagonals.map((diag, idx) => {
    const force = forces[idx] ?? { N_total: 0, isTension: false };
    const N = force.N_total;
    const isTension = N >= 0;

    // 細長比 λ = KL / r_min
    const lambda = (effectiveLengthFactor * diag.length) / diagonalRmin_mm;

    // 軸応力度
    const sigma_axial = Math.abs(N) / diagonalArea_mm2;  // N/mm²

    // 許容応力度
    let sigma_allow: number;
    let bucklingMode: 'euler' | 'inelastic' | 'direct';

    if (isTension) {
      sigma_allow = sigma_ta;
      bucklingMode = 'direct';
    } else {
      sigma_allow = allowableCompressionJRA(lambda);
      bucklingMode = lambda > Lambda_c ? 'euler' : 'inelastic';
    }

    const ratio = sigma_allow > 0 ? sigma_axial / sigma_allow : Infinity;

    return {
      memberId: diag.id,
      length: diag.length,
      N_design: N,
      sigma_axial,
      lambda,
      Lambda_c,
      isTension,
      sigma_allow,
      ratio,
      ok: ratio <= 1.0,
      bucklingMode,
    };
  });
}

// ---- 斜材自重の主桁への付加死荷重 ---------------------------
/**
 * 斜材の自重を主桁の分布荷重に換算 (N/mm per girder)
 */
export function diagonalSelfWeightPerGirder(
  diagonals: DiagonalMember[],
  steelUnitWeight_kNm3: number,
  diagonalArea_mm2: number,
  numGirders: number,
  spanLength_mm: number
): number {
  const totalLength_mm = diagonals.reduce((s, d) => s + d.length, 0);
  const gamma = steelUnitWeight_kNm3 * 1e-6;  // kN/m³ → N/mm³  (1 kN/m³ = 1e-6 N/mm³)
  const W_total = gamma * diagonalArea_mm2 * totalLength_mm;  // N

  // 単位スパン当たり・1桁当たり
  return W_total / spanLength_mm / numGirders;  // N/mm
}
