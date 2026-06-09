// ============================================================
// DXF ASCII Parser — J端→i端 認識 + BEAM_DIAGONAL 対応
//
// レイヤー規約:
//   BEAM_MAIN / GIRDER  → 主桁（縦桁）梁要素
//   BEAM_CROSS / FLOOR  → 横桁 梁要素
//   BEAM_DIAGONAL       → 斜材 トラス要素（軸力のみ）
//   NODE_SUPPORT        → 支承位置（境界条件）
//
// DXF LINE の向き:
//   Group 10,20 = J端（DXF始点 = 構造J端）
//   Group 11,21 = i端（DXF終点 = 構造i端）
// ============================================================

import type { GrillageModel, Node, Beam, DiagonalMember } from '../types/bridge';

interface RawLine {
  xJ: number; yJ: number;
  xi: number; yi: number;
  layer: string;
}

function extractLines(dxf: string): RawLine[] {
  const lines: RawLine[] = [];
  const tokens = dxf.split('\n').map(l => l.trim());
  let i = 0;

  while (i < tokens.length - 1) {
    if (tokens[i] === '0' && tokens[i + 1] === 'LINE') {
      i += 2;
      let layer = '0', xJ = 0, yJ = 0, xi = 0, yi = 0;
      while (i < tokens.length - 1) {
        const c = tokens[i], v = tokens[i + 1] ?? '';
        if (c === '0') break;
        switch (c) {
          case '8':  layer = v; break;
          case '10': xJ = parseFloat(v); break;
          case '20': yJ = parseFloat(v); break;
          case '11': xi = parseFloat(v); break;
          case '21': yi = parseFloat(v); break;
        }
        i += 2;
      }
      lines.push({ xJ, yJ, xi, yi, layer });
    } else {
      i += 2;
    }
  }
  return lines;
}

function snap(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function classifyLayer(layer: string): 'main' | 'cross' | 'diagonal' | 'unknown' {
  const u = layer.toUpperCase();
  if (/BEAM_DIAGONAL|DIAGONAL|BRACE/.test(u)) return 'diagonal';
  if (/BEAM_MAIN|MAIN|GIRDER|STRINGER|LONG/.test(u)) return 'main';
  if (/BEAM_CROSS|CROSS|FLOOR|DIAPHRAGM|TRANS/.test(u)) return 'cross';
  return 'unknown';
}

export function parseDxfToModel(content: string): GrillageModel {
  const rawLines = extractLines(content);
  if (rawLines.length === 0) {
    throw new Error('DXFにLINEエンティティが見つかりません。ASCII DXF形式を確認してください。');
  }

  // Node registry
  const nodeMap = new Map<string, number>();
  const nodes: Node[] = [];

  function getNode(x: number, y: number): number {
    const key = `${snap(x)},${snap(y)}`;
    if (!nodeMap.has(key)) {
      const id = nodes.length;
      nodeMap.set(key, id);
      nodes.push({ id, x: snap(x), y: snap(y), z: 0, isSupport: false });
    }
    return nodeMap.get(key)!;
  }

  const beams: Beam[] = [];
  const diagonals: DiagonalMember[] = [];

  for (const raw of rawLines) {
    const idJ = getNode(raw.xJ, raw.yJ);
    const idI = getNode(raw.xi, raw.yi);
    if (idI === idJ) continue;

    const ni = nodes[idI];
    const nj = nodes[idJ];
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const cls = classifyLayer(raw.layer);

    if (cls === 'diagonal') {
      // トラス要素：斜材
      diagonals.push({
        id: diagonals.length,
        nodeI: idI,
        nodeJ: idJ,
        length: len,
        angle,
        layer: raw.layer,
      });
    } else {
      // 梁要素（main / cross）
      let type: 'main' | 'cross' | 'stringer';
      if (cls === 'main') {
        type = 'main';
      } else if (cls === 'cross') {
        type = 'cross';
      } else {
        // レイヤー不明：幾何学から判断
        type = Math.abs(dx) >= Math.abs(dy) ? 'main' : 'cross';
      }
      beams.push({ id: beams.length, nodeI: idI, nodeJ: idJ, type, layer: raw.layer, length: len });
    }
  }

  if (beams.length === 0) {
    throw new Error('有効な梁要素を構築できませんでした。レイヤー名（BEAM_MAIN / BEAM_CROSS / BEAM_DIAGONAL）を確認してください。');
  }

  // 支承節点：x最小・最大のノード
  const xs = nodes.map(n => n.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  for (const node of nodes) {
    if (Math.abs(node.x - minX) < 1 || Math.abs(node.x - maxX) < 1) {
      node.isSupport = true;
    }
  }

  // モデルパラメータ推定
  const ys = [...new Set(nodes.map(n => snap(n.y)))].sort((a, b) => a - b);
  const spanLength = maxX - minX;
  const numGirders = ys.length;
  const girderSpacing = numGirders > 1 ? ys[1] - ys[0] : 2500;
  const totalWidth = (numGirders - 1) * girderSpacing;

  const crossXSet = new Set<number>();
  for (const b of beams) {
    if (b.type === 'cross') {
      const ni = nodes[b.nodeI];
      if (ni) crossXSet.add(snap(ni.x));
    }
  }
  const crossBeamPositions = [...crossXSet].sort((a, b) => a - b);
  if (crossBeamPositions.length === 0) {
    crossBeamPositions.push(0, spanLength / 2, spanLength);
  }

  return {
    nodes, beams, diagonals,
    spanLength, numGirders, girderSpacing,
    crossBeamPositions, totalWidth,
  };
}

export function validateDxf(content: string): string[] {
  const errors: string[] = [];
  if (!content.includes('LINE')) {
    errors.push('LINEエンティティが存在しません');
    return errors;
  }

  const raw = extractLines(content);
  const mainCount  = raw.filter(l => /BEAM_MAIN|GIRDER/i.test(l.layer)).length;
  const crossCount = raw.filter(l => /BEAM_CROSS|FLOOR|DIAPHRAGM/i.test(l.layer)).length;
  const diagCount  = raw.filter(l => /BEAM_DIAGONAL|DIAGONAL|BRACE/i.test(l.layer)).length;

  if (mainCount === 0) errors.push('BEAM_MAIN / GIRDER レイヤーのLINEが見つかりません');
  if (crossCount === 0) errors.push('BEAM_CROSS / FLOOR レイヤーのLINEが見つかりません（横桁なし）');
  if (diagCount > 0) errors.push(`BEAM_DIAGONAL: ${diagCount}本の斜材を認識しました（情報）`);
  if (content.includes('SPLINE') || content.includes('ARC')) {
    errors.push('スプライン・円弧は無視されます（LINEのみ対応）');
  }
  return errors;
}
