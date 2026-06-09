// ============================================================
// サンプルデータ — 教科書§6.8 道路橋単純非合成鈑桁（40m, 3主桁）
//
// 参考: 道路橋設計計算例 §6.8
//   スパン L=40m, 桁間隔 a=2500mm, 主桁 3 本
//   G1（外桁）: hw=2000, tw=10, bf=520, tf=27/27 mm (SM490Y)
//   G2（内桁）: hw=2000, tw=10, bf=520, tf=24/24 mm (SM490Y)
//   G3（外桁）: G1 と同じ（対称橋）
//   非合成（RC床版は死荷重のみ）
// ============================================================

import type {
  AnalysisInput,
  GrillageModel,
  DeadLoadSettings,
  DiagonalMember,
  BeamElementProps,
  DiagElementProps,
  PlateGirderDims,
} from '../types/bridge';

// ---- 断面定義 -----------------------------------------------

/** G1・G3 外桁断面（中央部 B 断面） */
const PG_G1: PlateGirderDims = { hw: 2000, tw: 10, bf: 520, tf_top: 27, tf_bot: 27 };

/** G2 内桁断面（中央部 B 断面） */
const PG_G2: PlateGirderDims = { hw: 2000, tw: 10, bf: 520, tf_top: 24, tf_bot: 24 };

// ---- モデル生成 --------------------------------------------

export function createSampleModel(): GrillageModel {
  const L    = 40_000;   // スパン 40 m
  const n    = 3;         // 主桁本数
  const a    = 2_500;    // 桁間隔 2.5 m
  const divX = 5;         // 分割数（8 m × 5 パネル）
  const dx   = L / divX; // 8000 mm

  // ノード生成: j=桁番号(0〜2), i=分割点(0〜5)
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

  // 主桁（縦桁）
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < divX; i++) {
      beams.push({
        id: beams.length,
        nodeI: nodeAt(i, j), nodeJ: nodeAt(i + 1, j),
        type: 'main' as const, layer: 'BEAM_MAIN', length: dx,
      });
    }
  }

  // 横桁: 全パネル境界に配置（x = 0, 8000, 16000, 24000, 32000, 40000）
  for (let ci = 0; ci <= divX; ci++) {
    for (let j = 0; j < n - 1; j++) {
      beams.push({
        id: beams.length,
        nodeI: nodeAt(ci, j), nodeJ: nodeAt(ci, j + 1),
        type: 'cross' as const, layer: 'BEAM_CROSS', length: a,
      });
    }
  }

  // 斜材なし（非合成鈑桁橋のため省略）
  const diagonals: DiagonalMember[] = [];

  const crossBeamPositions = Array.from({ length: divX + 1 }, (_, ci) => ci * dx);

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
      // 桁番号を nodeI の y 座標から判定
      const nodeI = model.nodes[beam.nodeI];
      const gIdx  = Math.round((nodeI?.y ?? 0) / model.girderSpacing);
      const isExt = gIdx === 0 || gIdx === model.numGirders - 1;
      const pg    = isExt ? PG_G1 : PG_G2;

      props[beam.id] = {
        sectionKey:  'H-700×300×13×24', // プリセット選択時の fallback
        sectionKeyJ: 'H-700×300×13×24',
        sectionKeyI: 'H-700×300×13×24',
        steelGrade:    'SM490Y',
        isComposite:   false,           // 非合成
        slabThickness: 0,
        isStepped:     false,
        customPG:      pg,              // 鈑桁自由入力モード
      };
    } else {
      // 横桁: H-700×300×13×24（SM490Y）
      const key = 'H-700×300×13×24';
      props[beam.id] = {
        sectionKey:    key,
        sectionKeyJ:   key,
        sectionKeyI:   key,
        steelGrade:    'SM490Y',
        isComposite:   false,
        slabThickness: 0,
        isStepped:     false,
      };
    }
  }
  return props;
}

export function createDefaultDiagProps(_model: GrillageModel): Record<number, DiagElementProps> {
  // 斜材なし
  return {};
}

// ---- AnalysisInput 生成 ------------------------------------

export function createSampleInput(): AnalysisInput {
  const model     = createSampleModel();
  const beamProps = createDefaultBeamProps(model);
  const diagProps = createDefaultDiagProps(model);

  // 教科書§6.8 死荷重設定
  const deadLoad: DeadLoadSettings = {
    slabThickness:      210,    // mm — RC床版
    slabDensity:         24,    // kN/m³
    pavementThickness:   80,    // mm — アスファルト舗装
    pavementDensity:     22,    // kN/m³
    steelUnitWeight:     77,    // kN/m³
    mainGirderArea_cm2: 481,    // cm² — G1断面積（A=480.8cm²）
    diagonalArea_cm2:     0,    // 斜材なし
    diagonalRmin_mm:      0,
    guardrailLoad:       10.0,  // kN/m（両側合計：高欄＋地覆）
    otherLoad:            0.0,  // kN/m
    tributaryWidth:       2.5,  // m — 内桁（= 桁間隔）
    tributaryWidth_ext:   2.75, // m — 外桁（桁間/2 + 張出し 1.5m）
    totalWidth_m:         8.0,  // m
    numGirders_ui:          3,
  };

  return { model, beamProps, diagProps, deadLoad, liveLoadType: 'T' };
}
