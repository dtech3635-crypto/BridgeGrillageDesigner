// ============================================================
// 要素プロパティ編集コンポーネント（部材要素単位）
//
// 各部材のJ端・i端断面を常に独立して表示・編集可能。
// J端 = i端 → 均等断面
// J端 ≠ i端 → 変断面（自動認識）
// ============================================================

import { useState } from 'react';
import type {
  GrillageModel,
  BeamElementProps,
  DiagElementProps,
  Beam,
  SteelGradeKey,
  PlateGirderDims,
} from '../types/bridge';
import {
  H_SECTION_PRESETS,
  L_SECTION_PRESETS,
  GRADE_OPTIONS,
  STEEL_GRADES,
} from '../lib/sectionPresets';
import { computePlateGirder } from '../lib/sectionProps';

// ---- Props -------------------------------------------------

interface Props {
  model: GrillageModel;
  beamProps: Record<number, BeamElementProps>;
  diagProps: Record<number, DiagElementProps>;
  onBeamPropsChange: (p: Record<number, BeamElementProps>) => void;
  onDiagPropsChange: (p: Record<number, DiagElementProps>) => void;
}

// ---- Defaults ----------------------------------------------

export const DEFAULT_MAIN: BeamElementProps = {
  sectionKey:    'H-700×300×13×24',
  sectionKeyJ:   'H-700×300×13×24',
  sectionKeyI:   'H-700×300×13×24',
  steelGrade:    'SD345',
  isComposite:   true,
  slabThickness: 200,
  isStepped:     false,
};
export const DEFAULT_CROSS: BeamElementProps = {
  sectionKey:    'H-300×300×10×15',
  sectionKeyJ:   'H-300×300×10×15',
  sectionKeyI:   'H-300×300×10×15',
  steelGrade:    'SM400',
  isComposite:   false,
  slabThickness: 0,
  isStepped:     false,
};
export const DEFAULT_DIAG: DiagElementProps = {
  sectionKey:  'L-100×100×10',
  steelGrade:  'SM400',
};

// ---- Helpers -----------------------------------------------

function getGirderIdx(beam: Beam, model: GrillageModel): number {
  const a  = model.girderSpacing || 2500;
  const ni = model.nodes[beam.nodeI];
  return Math.round((ni?.y ?? 0) / a);
}

const fmtLen = (l: number) =>
  l >= 1000 ? `${(l / 1000).toFixed(2)} m` : `${l.toFixed(0)} mm`;

/** J端・i端の実際のキーを取得（未設定時はsectionKeyで代替） */
function resolveJI(p: BeamElementProps): { jKey: string; iKey: string } {
  return {
    jKey: p.sectionKeyJ ?? p.sectionKey,
    iKey: p.sectionKeyI ?? p.sectionKey,
  };
}

// ---- Styles ------------------------------------------------

const Sel: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', borderRadius: 5,
  color: '#e2e8f0', fontSize: 11, padding: '3px 5px', outline: 'none', cursor: 'pointer',
};
const NumInp: React.CSSProperties = {
  ...Sel, width: 56, textAlign: 'right',
};

// ---- Sub-components ----------------------------------------

function GroupHeader({
  title, count, color, expanded, onToggle,
}: {
  title: string; count: number; color: string; expanded: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#1e293b', border: 'none', cursor: 'pointer',
        padding: '7px 10px', borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color }}>
        {expanded ? '▼' : '▶'} {title}
      </span>
      <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
        {count} 要素
      </span>
    </button>
  );
}

function GirderLabel({ label }: { label: string }) {
  return (
    <div style={{
      padding: '3px 8px', marginTop: 2,
      fontSize: 11, fontWeight: 700, color: '#fbbf24',
      borderLeft: '2px solid #f59e0b', background: 'rgba(245,158,11,0.05)',
    }}>
      {label}
    </div>
  );
}

// ---- PG寸法デフォルト値 ------------------------------------
const DEFAULT_PG_DIMS: PlateGirderDims = {
  hw: 2000, tw: 10, bf: 520, tf_top: 27, tf_bot: 27,
};

// ---- PG断面サマリー（リアルタイム計算結果表示）------------
function PGSummary({ dims }: { dims: PlateGirderDims }) {
  const sec = computePlateGirder(dims);
  const Ix_cm4  = (sec.Ix / 1e4).toFixed(0);
  const Zx_cm3  = (sec.Zx / 1e3).toFixed(0);
  const ZxT_cm3 = sec.Zx_top_fiber ? (sec.Zx_top_fiber / 1e3).toFixed(0) : Zx_cm3;
  const A_cm2   = (sec.A / 100).toFixed(1);
  return (
    <div style={{
      fontSize: 9, color: '#475569', fontFamily: 'monospace',
      background: '#0a1628', borderRadius: 4, padding: '3px 6px',
      marginTop: 3, lineHeight: 1.6,
    }}>
      <span style={{ color: '#38bdf8' }}>H={sec.H}mm</span>
      {'  '}A={A_cm2}cm²
      {'  '}Ix={Ix_cm4}cm⁴
      {'  '}Zx↓={Zx_cm3}cm³  Zx↑={ZxT_cm3}cm³
    </div>
  );
}

// ---- BeamElementRow ----------------------------------------
// モード: "preset"（H形鋼プリセット）/ "pg"（鈑桁自由入力）

interface BeamRowProps {
  label: string;
  length: number;
  xRange?: string;          // "0.0→2.5m" などの位置ヒント
  props: BeamElementProps;
  showComposite?: boolean;
  onChange: (p: BeamElementProps) => void;
}

function BeamElementRow({
  label, length, xRange, props: p, showComposite = false, onChange,
}: BeamRowProps) {
  const up = (patch: Partial<BeamElementProps>) => onChange({ ...p, ...patch });
  const isPGMode = !!p.customPG;
  const { jKey, iKey } = resolveJI(p);
  const isVariable = !isPGMode && jKey !== iKey;   // 変断面はプリセットモードのみ

  // PGモード↔プリセットモード切替
  const switchToPG = () => {
    up({ customPG: DEFAULT_PG_DIMS, isStepped: false });
  };
  const switchToPreset = () => {
    const { customPG: _removed, ...rest } = p as BeamElementProps & { customPG?: unknown };
    onChange({ ...(rest as BeamElementProps), customPG: undefined, isStepped: false });
  };

  // PG寸法入力変更
  const onChangePG = (field: keyof PlateGirderDims, val: number) => {
    if (!p.customPG) return;
    up({ customPG: { ...p.customPG, [field]: val } });
  };

  // プリセット断面選択（J端・i端）
  const onChangeJ = (newKey: string) => {
    if (!isVariable) {
      up({ sectionKey: newKey, sectionKeyJ: newKey, sectionKeyI: newKey, isStepped: false });
    } else {
      up({ sectionKeyJ: newKey, isStepped: newKey !== iKey });
    }
  };
  const onChangeI = (newKey: string) => {
    const stepped = newKey !== jKey;
    up({
      sectionKeyI: newKey,
      isStepped:   stepped,
      ...(stepped ? {} : { sectionKey: newKey }),
    });
  };

  // PG寸法入力フィールド
  const PGField = ({
    label: fl, field, step = 1,
  }: { label: string; field: keyof PlateGirderDims; step?: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 60 }}>
      <span style={{ fontSize: 9, color: '#64748b' }}>{fl}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <input
          type="number"
          min={1}
          step={step}
          value={p.customPG?.[field] ?? 0}
          onChange={e => onChangePG(field, parseFloat(e.target.value) || 0)}
          style={{ ...NumInp, width: 64 }}
        />
        <span style={{ fontSize: 9, color: '#475569' }}>mm</span>
      </div>
    </div>
  );

  return (
    <div style={{
      padding: '6px 8px',
      borderBottom: '1px solid #0f172a',
      background: isPGMode
        ? 'rgba(56,189,248,0.04)'
        : isVariable ? 'rgba(245,158,11,0.04)' : 'transparent',
    }}>
      {/* ── 行1: 番号 + 鋼材 + RC合成 + モード切替 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{
          minWidth: 34, fontSize: 11, fontWeight: 700, color: '#94a3b8',
          fontFamily: 'monospace',
        }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', minWidth: 56 }}>
          {fmtLen(length)}
        </span>
        {xRange && (
          <span style={{ fontSize: 9, color: '#1e3a5f', fontFamily: 'monospace' }}>
            {xRange}
          </span>
        )}

        {/* 鋼材種別 */}
        <select
          value={p.steelGrade}
          onChange={e => up({ steelGrade: e.target.value as SteelGradeKey })}
          style={{ ...Sel, width: 76 }}
        >
          {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* F値バッジ */}
        <span style={{
          fontSize: 9, fontFamily: 'monospace', padding: '1px 5px',
          borderRadius: 4, background: '#0f172a', color: '#475569',
        }}>
          F={STEEL_GRADES[p.steelGrade].F}
        </span>

        {/* RC合成 */}
        {showComposite && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={p.isComposite}
              onChange={e => up({ isComposite: e.target.checked })}
              style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, color: '#94a3b8' }}>RC合成</span>
          </label>
        )}

        {/* モード切替ボタン */}
        <div style={{ display: 'flex', marginLeft: 'auto', borderRadius: 5, overflow: 'hidden', border: '1px solid #334155' }}>
          <button
            onClick={switchToPreset}
            style={{
              fontSize: 9, padding: '2px 7px', border: 'none', cursor: 'pointer',
              background: !isPGMode ? '#1d4ed8' : '#0f172a',
              color:      !isPGMode ? '#fff'    : '#475569',
              fontWeight: !isPGMode ? 700       : 400,
            }}
          >
            H形鋼
          </button>
          <button
            onClick={switchToPG}
            style={{
              fontSize: 9, padding: '2px 7px', border: 'none', cursor: 'pointer',
              background: isPGMode ? '#0e7490' : '#0f172a',
              color:      isPGMode ? '#fff'    : '#475569',
              fontWeight: isPGMode ? 700       : 400,
            }}
          >
            鈑桁
          </button>
        </div>

        {/* 変断面インジケーター（プリセットのみ） */}
        {isVariable && (
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
            border: '1px solid rgba(245,158,11,0.3)',
          }}>
            変断面
          </span>
        )}
      </div>

      {/* ── 鈑桁モード: 寸法入力グリッド ── */}
      {isPGMode && p.customPG && (
        <div style={{ paddingLeft: 40 }}>
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
          }}>
            <PGField label="hw（腹板高）" field="hw" step={50} />
            <PGField label="tw（腹板厚）" field="tw" step={1}  />
            <PGField label="bf（フランジ幅）" field="bf" step={10} />
            <PGField label="tf↑（上フランジ厚）" field="tf_top" step={1} />
            <PGField label="tf↓（下フランジ厚）" field="tf_bot" step={1} />
          </div>
          <PGSummary dims={p.customPG} />
        </div>
      )}

      {/* ── プリセットモード: J端・i端断面 ── */}
      {!isPGMode && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 6, paddingLeft: 40,
        }}>
          {/* J端 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>J端断面</span>
            <select
              value={jKey}
              onChange={e => onChangeJ(e.target.value)}
              style={{ ...Sel, width: '100%' }}
            >
              {H_SECTION_PRESETS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* i端 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>
              i端断面
              {!isVariable && (
                <span style={{ color: '#334155', marginLeft: 4 }}>← J端に連動</span>
              )}
            </span>
            <select
              value={iKey}
              onChange={e => onChangeI(e.target.value)}
              style={{
                ...Sel, width: '100%',
                borderColor: isVariable ? '#f59e0b' : '#334155',
              }}
            >
              {H_SECTION_PRESETS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── RC合成スラブ厚 ── */}
      {showComposite && p.isComposite && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingLeft: 40, marginTop: 5,
        }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>床版厚</span>
          <input
            type="number" step={10}
            value={p.slabThickness}
            onChange={e => up({ slabThickness: parseFloat(e.target.value) || 0 })}
            style={NumInp}
          />
          <span style={{ fontSize: 10, color: '#475569' }}>mm</span>
          <span style={{ fontSize: 9, color: '#334155' }}>
            σ_sa={STEEL_GRADES[p.steelGrade].sigma_ta} τ_a={STEEL_GRADES[p.steelGrade].tau_allow} N/mm²
          </span>
        </div>
      )}
    </div>
  );
}

// ---- DiagElementRow ----------------------------------------

interface DiagRowProps {
  label: string;
  length: number;
  angle: number;
  props: DiagElementProps;
  onChange: (p: DiagElementProps) => void;
}

function DiagElementRow({ label, length, angle, props: p, onChange }: DiagRowProps) {
  const up = (patch: Partial<DiagElementProps>) => onChange({ ...p, ...patch });
  const deg = Math.abs(angle * 180 / Math.PI).toFixed(1);
  return (
    <div style={{
      padding: '6px 8px', borderBottom: '1px solid #0f172a',
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    }}>
      <span style={{
        minWidth: 34, fontSize: 11, fontWeight: 700, color: '#ef4444',
        fontFamily: 'monospace',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', minWidth: 70 }}>
        {fmtLen(length)} / {deg}°
      </span>
      <select
        value={p.sectionKey}
        onChange={e => up({ sectionKey: e.target.value })}
        style={{ ...Sel, maxWidth: 148 }}
      >
        {L_SECTION_PRESETS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select
        value={p.steelGrade}
        onChange={e => up({ steelGrade: e.target.value as SteelGradeKey })}
        style={{ ...Sel, width: 76 }}
      >
        {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      <span style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>
        F={STEEL_GRADES[p.steelGrade].F}
      </span>
    </div>
  );
}

// ---- Bulk Apply Row ----------------------------------------

function BulkApplyRow({
  defaultProps, type, onApply,
}: {
  defaultProps: BeamElementProps | DiagElementProps;
  type: 'main' | 'cross' | 'diag';
  onApply: (p: BeamElementProps | DiagElementProps) => void;
}) {
  const [bulk, setBulk] = useState<BeamElementProps | DiagElementProps>(defaultProps);
  const up = (patch: object) => setBulk(prev => ({ ...prev, ...patch }));
  const isBeam = type !== 'diag';
  const bBeam = bulk as BeamElementProps;
  const bDiag = bulk as DiagElementProps;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '6px 8px', background: 'rgba(37,99,235,0.07)',
      borderRadius: 6, marginBottom: 2,
    }}>
      <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700, minWidth: 34 }}>一括</span>

      {isBeam ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 9, color: '#334155' }}>J端 = i端</span>
            <select
              value={bBeam.sectionKey}
              onChange={e => {
                const v = e.target.value;
                up({ sectionKey: v, sectionKeyJ: v, sectionKeyI: v });
              }}
              style={{ ...Sel, maxWidth: 160 }}
            >
              {H_SECTION_PRESETS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <select
            value={bBeam.steelGrade}
            onChange={e => up({ steelGrade: e.target.value })}
            style={{ ...Sel, width: 76 }}
          >
            {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {type === 'main' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input
                type="checkbox" checked={bBeam.isComposite}
                onChange={e => up({ isComposite: e.target.checked })}
                style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 10, color: '#94a3b8' }}>RC合成</span>
            </label>
          )}
        </>
      ) : (
        <>
          <select
            value={bDiag.sectionKey}
            onChange={e => up({ sectionKey: e.target.value })}
            style={{ ...Sel, maxWidth: 148 }}
          >
            {L_SECTION_PRESETS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select
            value={bDiag.steelGrade}
            onChange={e => up({ steelGrade: e.target.value })}
            style={{ ...Sel, width: 76 }}
          >
            {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </>
      )}

      <button
        onClick={() => onApply(bulk)}
        style={{
          padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
          cursor: 'pointer', border: '1px solid #2563eb',
          background: '#1e3a5f', color: '#93c5fd',
        }}
      >
        全要素に適用 ↓
      </button>
    </div>
  );
}

// ---- Main Component ----------------------------------------

export function ElementEditor({
  model, beamProps, diagProps,
  onBeamPropsChange, onDiagPropsChange,
}: Props) {
  const [expandMain,  setExpandMain]  = useState(true);
  const [expandCross, setExpandCross] = useState(false);
  const [expandDiag,  setExpandDiag]  = useState(false);

  const mainBeams  = model.beams.filter(b => b.type === 'main');
  const crossBeams = model.beams.filter(b => b.type === 'cross');
  const diagonals  = model.diagonals ?? [];

  // 桁ごとにグループ化（表示のみ）
  const girderGroups: { gIdx: number; label: string; beams: Beam[] }[] = [];
  for (let g = 0; g < model.numGirders; g++) {
    const beams = mainBeams
      .filter(b => getGirderIdx(b, model) === g)
      .sort((a2, b2) =>
        (model.nodes[a2.nodeI]?.x ?? 0) - (model.nodes[b2.nodeI]?.x ?? 0)
      );
    girderGroups.push({ gIdx: g, label: `G${g + 1}`, beams });
  }

  const sortedCross = [...crossBeams].sort(
    (a2, b2) => (model.nodes[a2.nodeI]?.x ?? 0) - (model.nodes[b2.nodeI]?.x ?? 0)
  );

  const updateBeam = (id: number, p: BeamElementProps) =>
    onBeamPropsChange({ ...beamProps, [id]: p });

  const applyToAll = (type: 'main' | 'cross', p: BeamElementProps | DiagElementProps) => {
    const updated = { ...beamProps };
    for (const b of model.beams) {
      if (b.type === type) updated[b.id] = p as BeamElementProps;
    }
    onBeamPropsChange(updated);
  };

  const applyToAllDiag = (p: BeamElementProps | DiagElementProps) => {
    const updated = { ...diagProps };
    for (const d of diagonals) updated[d.id] = p as DiagElementProps;
    onDiagPropsChange(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ヘッダー */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        要素プロパティ設定
      </div>

      {/* 操作説明 */}
      <div style={{
        fontSize: 10, color: '#475569', lineHeight: 1.7,
        background: '#0f172a', borderRadius: 6, padding: '6px 10px',
      }}>
        <div>● J端・i端に<b style={{ color: '#e2e8f0' }}>同じ断面</b> → 均等断面（i端は自動連動）</div>
        <div>● i端に<b style={{ color: '#f59e0b' }}>別の断面</b>を選択 → 変断面（自動認識）</div>
        <div>● J端変更時は<b style={{ color: '#e2e8f0' }}>均等断面の場合のみ</b>i端も連動</div>
      </div>

      {/* ── 主桁 ──────────────────────────────── */}
      <GroupHeader
        title={`主桁  ${model.numGirders}桁 × ${girderGroups[0]?.beams.length ?? '-'}区間`}
        count={mainBeams.length}
        color="#3b82f6"
        expanded={expandMain}
        onToggle={() => setExpandMain(v => !v)}
      />
      {expandMain && (
        <div style={{ background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
          <div style={{ padding: '4px 4px', borderBottom: '1px solid #1e293b' }}>
            <BulkApplyRow
              defaultProps={DEFAULT_MAIN}
              type="main"
              onApply={p => applyToAll('main', p)}
            />
          </div>
          {girderGroups.map(({ gIdx, label, beams }) => (
            <div key={gIdx}>
              <GirderLabel label={label} />
              {beams.map((beam, segIdx) => {
                const ni = model.nodes[beam.nodeI];
                const nj = model.nodes[beam.nodeJ];
                const x0 = ((ni?.x ?? 0) / 1000).toFixed(2);
                const x1 = ((nj?.x ?? 0) / 1000).toFixed(2);
                return (
                  <BeamElementRow
                    key={beam.id}
                    label={`${segIdx + 1}/${beams.length}`}
                    length={beam.length}
                    xRange={`${x0}→${x1}m`}
                    props={beamProps[beam.id] ?? DEFAULT_MAIN}
                    showComposite
                    onChange={p => updateBeam(beam.id, p)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── 横桁 ──────────────────────────────── */}
      <GroupHeader
        title="横桁"
        count={crossBeams.length}
        color="#64748b"
        expanded={expandCross}
        onToggle={() => setExpandCross(v => !v)}
      />
      {expandCross && (
        <div style={{ background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
          <div style={{ padding: '4px 4px', borderBottom: '1px solid #1e293b' }}>
            <BulkApplyRow
              defaultProps={DEFAULT_CROSS}
              type="cross"
              onApply={p => applyToAll('cross', p)}
            />
          </div>
          {sortedCross.map((beam, idx) => {
            const ni = model.nodes[beam.nodeI];
            const xPos = ((ni?.x ?? 0) / 1000).toFixed(2);
            return (
              <BeamElementRow
                key={beam.id}
                label={`CB${idx + 1}`}
                length={beam.length}
                xRange={`x=${xPos}m`}
                props={beamProps[beam.id] ?? DEFAULT_CROSS}
                showComposite={false}
                onChange={p => updateBeam(beam.id, p)}
              />
            );
          })}
        </div>
      )}

      {/* ── 斜材 ──────────────────────────────── */}
      {diagonals.length > 0 && (
        <>
          <GroupHeader
            title="斜材 (Diagonal)"
            count={diagonals.length}
            color="#ef4444"
            expanded={expandDiag}
            onToggle={() => setExpandDiag(v => !v)}
          />
          {expandDiag && (
            <div style={{ background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
              <div style={{ padding: '4px 4px', borderBottom: '1px solid #1e293b' }}>
                <BulkApplyRow
                  defaultProps={DEFAULT_DIAG}
                  type="diag"
                  onApply={applyToAllDiag}
                />
              </div>
              {diagonals.map(diag => (
                <DiagElementRow
                  key={diag.id}
                  label={`D${diag.id + 1}`}
                  length={diag.length}
                  angle={diag.angle}
                  props={diagProps[diag.id] ?? DEFAULT_DIAG}
                  onChange={p => onDiagPropsChange({ ...diagProps, [diag.id]: p })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
