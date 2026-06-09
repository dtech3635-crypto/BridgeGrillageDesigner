// ============================================================
// Fourier Series Influence Line for Bending Moment
// Simply-supported beam, moment at section a, unit load at x
//
// Exact series: η_M(x,a) = Σ_{n=1,3,5,...} (2L/n²π²)·sin(nπa/L)·sin(nπx/L)
//
// Convergence: n=1 ≈ 81%, n=1+3 ≈ 90%, n=1+3+5 ≈ 93% of exact at midspan
// ============================================================

import type { InfluenceLineResult } from '../types/bridge';

/** Compute IL ordinate for moment at section `a` when load is at `x` */
function ilOrdinate(x: number, a: number, L: number, maxTermIndex: number): number {
  let sum = 0;
  const terms = [1, 3, 5, 7, 9];
  for (let k = 0; k <= maxTermIndex; k++) {
    const n = terms[k];
    sum += (2 * L / (n * n * Math.PI * Math.PI))
      * Math.sin(n * Math.PI * a / L)
      * Math.sin(n * Math.PI * x / L);
  }
  return sum;
}

export function computeInfluenceLines(
  spanLength: number,     // mm
  numGirders: number,
  distributionMatrix: number[][],  // K[s][r]
  numPoints = 101
): InfluenceLineResult[] {
  const L = spanLength;
  const a = L / 2;  // midspan section

  const loadPositions = Array.from({ length: numPoints }, (_, i) => (i / (numPoints - 1)) * L);

  return Array.from({ length: numGirders }, (_, r) => {
    // Distribution factor when load is directly over this girder
    const eta_r = distributionMatrix[r]?.[r] ?? (1 / numGirders);

    const ordinates_n1   = loadPositions.map(x => ilOrdinate(x, a, L, 0) * eta_r);
    const ordinates_n13  = loadPositions.map(x => ilOrdinate(x, a, L, 1) * eta_r);
    const ordinates_n135 = loadPositions.map(x => ilOrdinate(x, a, L, 2) * eta_r);

    const maxOrdinate = Math.max(...ordinates_n135);
    const peakIdx = ordinates_n135.indexOf(maxOrdinate);

    return {
      girderId: r,
      spanLength: L,
      sectionX: a,
      loadPositions,
      ordinates_n1,
      ordinates_n13,
      ordinates_n135,
      maxOrdinate,
      criticalLoadPos: loadPositions[peakIdx] ?? a,
    };
  });
}

// Reaction influence line: R_left when unit load at x
export function ilReactionLeft(x: number, L: number): number {
  return (L - x) / L;
}
export function ilReactionRight(x: number, L: number): number {
  return x / L;
}
