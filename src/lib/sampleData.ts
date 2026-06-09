// ============================================================
// サンプルデータ + デフォルト要素プロパティ生成
// ============================================================

import type {
  AnalysisInput,
  GrillageModel,
  DeadLoadSettings,
  DiagonalMember,
  BeamElementProps,
  DiagElementProps,
} from '../types/bridge';

// ---- モデル生成 --------------------------------------------

export function createSampleModel(): GrillageModel {
  const L    = 10_000;
  const n    = 3;
  const a    = 2_500;
  const divX = 4;
  const dx   = L / divX;

  const nodes = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= divX; i++) {
      nodes.push({
        id: j * (divX + 1) + i,
        x: i * dx, y: j * a, z: 0,
        isSupport: i === 0 || i === divX,
      });
    }
  }

  const nodeAt = (i: number, j: number): number => j * (divX + 1) + i;
  const beams = [];

  // 縦桁
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < divX; i++) {
      const id: number = beams.length;
      beams.push({ id, nodeI: nodeAt(i, j), nodeJ: nodeAt(i + 1, j), type: 'main' as const, layer: 'BEAM_MAIN', length: dx });
    }
  }

  // 横桁
  const crossXDiv = [0, divX / 2, divX];
  for (const ci of crossXDiv) {
    for (let j = 0; j < n - 1; j++) {
      const id: number = beams.length;
      beams.push({ id, nodeI: nodeAt(ci, j), nodeJ: nodeAt(ci, j + 1), type: 'cross' as const, layer: 'BEAM_CROSS', length: a });
    }
  }

  // 斜材 X型
  const diagonals: DiagonalMember[] = [];
  const addDiag = (xi: number, yi: number, xj: number, yj: number) => {
    const ddx = xj - xi, ddy = yj - yi;
    const id: number = diagonals.length;
    diagonals.push({
      id,
      nodeI: nodeAt(xi / dx, yi / a),
      nodeJ: nodeAt(xj / dx, yj / a),
      length: Math.sqrt(ddx * ddx + ddy * ddy),
      angle: Math.atan2(ddy, ddx),
      layer: 'BEAM_DIAGONAL',
    });
  };

  for (const startDiv of [0, 2]) {
    const x0 = startDiv * dx, x1 = (startDiv + 2) * dx;
    addDiag(x0, 0,   x1, a);
    addDiag(x0, a,   x1, 0);
    addDiag(x0, a,   x1, 2 * a);
    addDiag(x0, 2*a, x1, a);
  }

  const crossBeamPositions = crossXDiv.map(ci => ci * dx);

  return {
    nodes, beams, diagonals,
    spanLength: L, numGirders: n, girderSpacing: a,
    crossBeamPositions, totalWidth: (n - 1) * a,
  };
}

// ---- デフォルト要素プロパティ生成 --------------------------

export function createDefaultBeamProps(model: GrillageModel): Record<number, BeamElementProps> {
  const props: Record<number, BeamElementProps> = {};
  for (const beam of model.beams) {
    if (beam.type === 'main') {
      const key = 'H-700×300×13×24';
      props[beam.id] = {
        sectionKey:    key,
        sectionKeyJ:   key,   // J端断面（明示的に設定）
        sectionKeyI:   key,   // i端断面（明示的に設定）
        steelGrade:    'SD345',
        isComposite:   true,
        slabThickness: 200,
        isStepped:     false,
      };
    } else {
      const key = 'H-300×300×10×15';
      props[beam.id] = {
        sectionKey:    key,
        sectionKeyJ:   key,
        sectionKeyI:   key,
        steelGrade:    'SM400',
        isComposite:   false,
        slabThickness: 0,
        isStepped:     false,
      };
    }
  }
  return props;
}

export function createDefaultDiagProps(model: GrillageModel): Record<number, DiagElementProps> {
  const props: Record<number, DiagElementProps> = {};
  for (const diag of (model.diagonals ?? [])) {
    props[diag.id] = {
      sectionKey: 'L-100×100×10',
      steelGrade: 'SM400',
    };
  }
  return props;
}

// ---- AnalysisInput 生成 ------------------------------------

export function createSampleInput(): AnalysisInput {
  const model    = createSampleModel();
  const beamProps = createDefaultBeamProps(model);
  const diagProps = createDefaultDiagProps(model);

  const deadLoad: DeadLoadSettings = {
    slabThickness:      200,
    slabDensity:         24,
    pavementThickness:   80,
    pavementDensity:     22,
    steelUnitWeight:     77,
    mainGirderArea_cm2: 215,
    diagonalArea_cm2:  19.2,
    diagonalRmin_mm:   19.5,
    guardrailLoad:       2.0,
    otherLoad:           0.5,
    tributaryWidth:      2.5,
    tributaryWidth_ext:  2.9,   // 外桁: 内側桁間 1/2 + 張出し 0.4m
    totalWidth_m:        7.5,
    numGirders_ui:         3,
  };

  return { model, beamProps, diagProps, deadLoad, liveLoadType: 'T' };
}
