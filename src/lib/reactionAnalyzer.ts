// ============================================================
// Reaction Force Analyzer
// ============================================================

import type { AnalysisInput, DesignForce, ReactionResult } from '../types/bridge';
import { T_LOAD, B_LOAD } from '../types/bridge';
import { ilReactionLeft, ilReactionRight } from './influenceLine';

// Max left-support reaction due to T-load moving in longitudinal direction
// Load at x=0 gives R_left = P (max); we use IL peak
function tLoadMaxReactionLeft(L: number, eta: number, i: number): number {
  const Pr = T_LOAD.rearAxle;
  const Pf = T_LOAD.frontAxle;
  const d  = T_LOAD.axleSpacing;

  // Rear axle at x=0 (just inside support), front axle at x=d
  const R_rear  = Pr * ilReactionLeft(0, L);
  const R_front = Pf * ilReactionLeft(d, L);
  return (R_rear + R_front) * eta * (1 + i);
}

function tLoadMaxReactionRight(L: number, eta: number, i: number): number {
  const Pr = T_LOAD.rearAxle;
  const Pf = T_LOAD.frontAxle;
  const d  = T_LOAD.axleSpacing;

  // Rear axle at x=L (just inside right support)
  const R_rear  = Pr * ilReactionRight(L, L);
  const R_front = Pf * ilReactionRight(L - d, L);
  return (R_rear + R_front) * eta * (1 + i);
}

function bLoadMaxReactionLeft(L: number, eta: number, i: number): number {
  const w  = B_LOAD.distributed;
  const bT = 1000;  // mm (1m tributary reference width)
  const P  = B_LOAD.concentrated;

  // Max R_left: distributed covers full span, concentrated at x=0
  const R_dist = (w * bT * L / 2);
  const R_conc = P * ilReactionLeft(0, L);
  return (R_dist + R_conc) * eta * (1 + i);
}

function bLoadMaxReactionRight(L: number, eta: number, i: number): number {
  const w  = B_LOAD.distributed;
  const bT = 1000;
  const P  = B_LOAD.concentrated;

  const R_dist = (w * bT * L / 2);
  const R_conc = P * ilReactionRight(L, L);
  return (R_dist + R_conc) * eta * (1 + i);
}

export function computeReactions(
  input: AnalysisInput,
  forces: DesignForce[],
  i: number  // impact factor
): ReactionResult[] {
  const L = input.model.spanLength;

  return forces.map(f => {
    // Dead load: symmetric for uniform load
    const R_DL_left  = f.V_DL;
    const R_DL_right = f.V_DL;

    let R_LL_left_max: number;
    let R_LL_right_max: number;

    if (input.liveLoadType === 'T') {
      R_LL_left_max  = tLoadMaxReactionLeft(L, f.distributionFactor, i);
      R_LL_right_max = tLoadMaxReactionRight(L, f.distributionFactor, i);
    } else {
      R_LL_left_max  = bLoadMaxReactionLeft(L, f.distributionFactor, i);
      R_LL_right_max = bLoadMaxReactionRight(L, f.distributionFactor, i);
    }

    return {
      girderId: f.girderId,
      R_DL_left,
      R_DL_right,
      R_LL_left_max,
      R_LL_right_max,
      impactFactor: i,
      R_left_total:  R_DL_left  + R_LL_left_max,
      R_right_total: R_DL_right + R_LL_right_max,
    };
  });
}
