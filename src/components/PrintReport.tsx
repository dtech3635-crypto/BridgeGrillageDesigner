// ============================================================
// 印刷用レポートコンポーネント
// createPortal で document.body 直下に配置し、
// @media print で表示・#root を非表示にして単独印刷する
// ============================================================

import { createPortal } from 'react-dom';
import type {
  AnalysisResult,
  GrillageModel,
  DeadLoadSettings,
  BeamElementProps,
  DiagElementProps,
} from '../types/bridge';

interface Props {
  result: AnalysisResult;
  model: GrillageModel;
  deadLoad: DeadLoadSettings;
  beamProps: Record<number, BeamElementProps>;
  diagProps: Record<number, DiagElementProps>;
  liveLoadType: 'T' | 'B';
}

// ── ヘルパー ─────────────────────────────────────────────────
const fmt1 = (v: number) => v.toFixed(1);
const fmt3 = (v: number) => v.toFixed(3);
const kNm  = (v: number) => (v / 1e6).toFixed(2);
const kN   = (v: number) => (v / 1e3).toFixed(2);
const pct  = (v: number) => (v * 100).toFixed(1) + '%';

function OkBadge({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px', borderRadius: 3,
      border: `1px solid ${ok ? '#155724' : '#721c24'}`,
      background: ok ? '#d4edda' : '#f8d7da',
      color: ok ? '#155724' : '#721c24',
      fontWeight: 700, fontSize: 10,
    }}>
      {ok ? 'OK' : 'NG'}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20, pageBreakInside: 'avoid' }}>
      <div style={{
        fontSize: 12, fontWeight: 700, borderBottom: '2px solid #1a365d',
        paddingBottom: 3, marginBottom: 8, color: '#1a365d',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{
    padding: '4px 8px', background: '#1a365d', color: '#fff',
    fontWeight: 600, fontSize: 9, textAlign: right ? 'right' : 'left',
    border: '1px solid #2d6a9f', whiteSpace: 'nowrap',
  }}>
    {children}
  </th>
);
const TD = ({ children, right, bold, ng }: { children: React.ReactNode; right?: boolean; bold?: boolean; ng?: boolean }) => (
  <td style={{
    padding: '3px 8px', fontSize: 10, textAlign: right ? 'right' : 'left',
    border: '1px solid #ccc', fontWeight: bold ? 700 : 400,
    color: ng ? '#c0392b' : 'inherit',
    fontFamily: 'monospace',
  }}>
    {children}
  </td>
);

// ── メインコンポーネント ─────────────────────────────────────

export function PrintReport({ result, model, deadLoad, beamProps: _beamProps, liveLoadType }: Props) {
  const { distribution, designForces, stressChecks, girderSections, reactions, diagonalChecks } = result;
  const printDate = new Date(result.computedAt).toLocaleString('ja-JP');
  const ngCount = stressChecks.filter(c => !c.allOK).length;
  const diagNgCount = diagonalChecks.filter(c => !c.ok).length;

  // 代表断面ラベル（各桁の midspan 断面）
  const secLabel = (i: number) => {
    const s = girderSections[i];
    if (!s) return '--';
    return s.label + (s.isComposite ? `+RC${s.slabThickness}` : '');
  };

  // 主桁の代表鋼材種別
  const girderGrade = (i: number) => stressChecks[i]?.steelGrade ?? '--';

  const content = (
    <div id="print-report" style={{ display: 'none' }}>
      <div style={{ fontFamily: 'sans-serif', color: '#000', fontSize: 10, lineHeight: 1.5 }}>

        {/* ── 表紙ヘッダー ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #1a365d', paddingBottom: 6 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1a365d' }}>
                格子桁橋 設計計算書
              </div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                BridgeGrillageDesigner ｜ 道路橋示方書（H29）準拠 ｜ Leonhardt格子桁理論
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: '#555' }}>
              <div>計算日時: {printDate}</div>
              <div>活荷重: {liveLoadType}荷重</div>
              <div style={{ fontWeight: 700, color: ngCount > 0 ? '#c0392b' : '#155724' }}>
                総合判定: {ngCount > 0 ? `NG（${ngCount}桁超過）` : '全桁OK'}
                {diagNgCount > 0 ? ` / 斜材NG(${diagNgCount})` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* ── 1. 橋梁諸元 ── */}
        <Section title="1. 橋梁諸元">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 20px', fontSize: 10 }}>
            {[
              ['支間長', `${(model.spanLength / 1000).toFixed(2)} m`],
              ['主桁本数', `${model.numGirders} 本`],
              ['主桁間隔', `${model.girderSpacing} mm`],
              ['全幅員', `${((model.totalWidth + model.girderSpacing) / 1000).toFixed(2)} m`],
              ['横桁位置数', `${model.crossBeamPositions.length} 箇所`],
              ['斜材本数', `${(model.diagonals ?? []).length} 本`],
              ['分配係数 α', fmt3(distribution.alpha)],
              ['衝撃係数 i', fmt3(designForces[0]?.impactFactor ?? 0)],
              ['節点数 / 梁要素数', `${model.nodes.length} / ${model.beams.length}`],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', gap: 8, borderBottom: '1px dotted #ccc', padding: '2px 0' }}>
                <span style={{ color: '#555', minWidth: 100 }}>{k}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* 各桁の断面 */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: '#1a365d' }}>■ 各桁 代表断面（スパン中央部）</div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <TH>桁</TH>
                  <TH>断面</TH>
                  <TH>鋼材種別</TH>
                  <TH right>H (mm)</TH>
                  <TH right>B (mm)</TH>
                  <TH right>tw (mm)</TH>
                  <TH right>tf (mm)</TH>
                  <TH right>A (cm²)</TH>
                  <TH right>Ix (cm⁴)</TH>
                  <TH>合成</TH>
                </tr>
              </thead>
              <tbody>
                {girderSections.map((s, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#f5f5f5' : '#fff' }}>
                    <TD>G{i + 1}</TD>
                    <TD>{s.label}</TD>
                    <TD>{girderGrade(i)}</TD>
                    <TD right>{s.H}</TD>
                    <TD right>{s.B}</TD>
                    <TD right>{s.tw}</TD>
                    <TD right>{s.tf}</TD>
                    <TD right>{(s.A / 100).toFixed(1)}</TD>
                    <TD right>{((s.isComposite ? s.Ix_comp : s.Ix) / 1e4).toFixed(0)}</TD>
                    <TD>{s.isComposite ? `○ RC${s.slabThickness}mm` : '×'}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 2. 死荷重設定 ── */}
        <Section title="2. 死荷重設定">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 20px', fontSize: 10 }}>
            {[
              ['床版厚', `${deadLoad.slabThickness} mm`],
              ['床版単位重量', `${deadLoad.slabDensity} kN/m³`],
              ['舗装厚', `${deadLoad.pavementThickness} mm`],
              ['舗装単位重量', `${deadLoad.pavementDensity} kN/m³`],
              ['鋼材単位重量', `${deadLoad.steelUnitWeight} kN/m³`],
              ['主桁断面積', `${deadLoad.mainGirderArea_cm2} cm²`],
              ['地覆荷重', `${deadLoad.guardrailLoad} kN/m`],
              ['その他荷重', `${deadLoad.otherLoad} kN/m`],
              ['負担幅員', `${deadLoad.tributaryWidth} m`],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', gap: 8, borderBottom: '1px dotted #ccc', padding: '2px 0' }}>
                <span style={{ color: '#555', minWidth: 120 }}>{k}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: '#555' }}>
            死荷重強度（桁1本当り）: w_DL = {fmt1(designForces[0]?.w_DL ?? 0)} N/mm
            ｜ M_DL = {kNm(designForces[0]?.M_DL ?? 0)} kN·m
          </div>
        </Section>

        {/* ── 3. 分配係数 ── */}
        <Section title="3. 格子桁分配係数（Leonhardt法）">
          <div style={{ fontSize: 10, marginBottom: 6, color: '#555' }}>
            α = E_cross·I_cross·L / (E_main·I_main·b) = {fmt3(distribution.alpha)}
            &emsp;（横桁剛比パラメータ）
          </div>
          <table style={{ borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr>
                <TH>荷重桁 ↓ \ 着目桁 →</TH>
                {distribution.girderPositions.map((_, j) => <TH key={j} right>G{j + 1}</TH>)}
              </tr>
            </thead>
            <tbody>
              {distribution.matrix.map((row, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f5f5f5' : '#fff' }}>
                  <TD>G{i + 1} に荷重</TD>
                  {row.map((v, j) => <TD key={j} right>{fmt3(v)}</TD>)}
                </tr>
              ))}
              <tr style={{ background: '#e8f0f8', fontWeight: 700 }}>
                <TD bold>最大分配係数</TD>
                {distribution.maxFactors.map((v, j) => <TD key={j} right bold>{fmt3(v)}</TD>)}
              </tr>
            </tbody>
          </table>
        </Section>

        {/* ── 4. 設計断面力 ── */}
        <Section title="4. 設計断面力">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <TH>桁</TH>
                <TH right>η_max</TH>
                <TH right>w_DL (N/mm)</TH>
                <TH right>M_DL (kN·m)</TH>
                <TH right>M_LL (kN·m)</TH>
                <TH right>M_設計 (kN·m)</TH>
                <TH right>V_DL (kN)</TH>
                <TH right>V_LL (kN)</TH>
                <TH right>V_設計 (kN)</TH>
                <TH right>i (%)</TH>
              </tr>
            </thead>
            <tbody>
              {designForces.map((f, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f5f5f5' : '#fff' }}>
                  <TD>G{i + 1}</TD>
                  <TD right>{fmt3(f.distributionFactor)}</TD>
                  <TD right>{fmt1(f.w_DL)}</TD>
                  <TD right>{kNm(f.M_DL)}</TD>
                  <TD right>{kNm(f.M_LL)}</TD>
                  <TD right bold>{kNm(f.M_design)}</TD>
                  <TD right>{kN(f.V_DL)}</TD>
                  <TD right>{kN(f.V_LL)}</TD>
                  <TD right bold>{kN(f.V_design)}</TD>
                  <TD right>{fmt1(f.impactFactor * 100)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
            M_設計 = M_DL + (1+i)·M_LL　｜　V_設計 = V_DL + (1+i)·V_LL　｜　i = 20/(50+L[m])
          </div>
        </Section>

        {/* ── 5. 応力度照査 ── */}
        <Section title="5. 主桁 応力度照査（JRA H29 §5）">
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <TH>桁</TH>
                <TH>断面</TH>
                <TH>鋼材</TH>
                <TH right>σ_b (N/mm²)</TH>
                <TH right>σ_sa (N/mm²)</TH>
                <TH right>比率</TH>
                <TH>曲げ</TH>
                <TH right>τ (N/mm²)</TH>
                <TH right>τ_a (N/mm²)</TH>
                <TH right>比率</TH>
                <TH>せん断</TH>
                {stressChecks.some(c => c.sigma_c > 0) && <>
                  <TH right>σ_c (N/mm²)</TH>
                  <TH right>σ_ca</TH>
                  <TH right>比率</TH>
                  <TH>コンクリート</TH>
                </>}
                <TH>総合</TH>
              </tr>
            </thead>
            <tbody>
              {stressChecks.map((c, i) => {
                return (
                  <tr key={i} style={{ background: !c.allOK ? '#fff0f0' : i % 2 ? '#f5f5f5' : '#fff' }}>
                    <TD bold={!c.allOK}>G{i + 1}</TD>
                    <TD>{secLabel(i)}</TD>
                    <TD>{c.steelGrade}</TD>
                    <TD right ng={!c.bendingOK}>{fmt1(c.sigma_b)}</TD>
                    <TD right>{c.sigma_sa}</TD>
                    <TD right ng={!c.bendingOK}>{pct(c.ratio_b)}</TD>
                    <TD><OkBadge ok={c.bendingOK} /></TD>
                    <TD right ng={!c.shearOK}>{fmt1(c.tau)}</TD>
                    <TD right>{c.tau_a}</TD>
                    <TD right ng={!c.shearOK}>{pct(c.ratio_s)}</TD>
                    <TD><OkBadge ok={c.shearOK} /></TD>
                    {stressChecks.some(cc => cc.sigma_c > 0) && <>
                      <TD right ng={c.sigma_c > 0 && !c.concreteOK}>{c.sigma_c > 0 ? fmt1(c.sigma_c) : '--'}</TD>
                      <TD right>{c.sigma_c > 0 ? c.sigma_ca : '--'}</TD>
                      <TD right ng={c.sigma_c > 0 && !c.concreteOK}>{c.sigma_c > 0 ? pct(c.ratio_c) : '--'}</TD>
                      <TD>{c.sigma_c > 0 ? <OkBadge ok={c.concreteOK} /> : '--'}</TD>
                    </>}
                    <TD><OkBadge ok={c.allOK} /></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {stressChecks.some(c => c.sigma_c > 0) && (
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              合成桁コンクリート: σ_c = M·y_top/(n·I_comp)、σ_ca = 10 N/mm²（f'c=30）
            </div>
          )}
        </Section>

        {/* ── 6. 横桁照査 ── */}
        {result.crossBeamChecks && result.crossBeamChecks.length > 0 && (
          <Section title="6. 横桁 応力度照査">
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <TH>位置 x</TH>
                  <TH>断面</TH>
                  <TH>鋼材</TH>
                  <TH right>負担長 (m)</TH>
                  <TH right>M_DL (kN·m)</TH>
                  <TH right>M_設計 (kN·m)</TH>
                  <TH right>σ_b (N/mm²)</TH>
                  <TH right>σ_sa</TH>
                  <TH right>比率</TH>
                  <TH>曲げ</TH>
                  <TH right>τ (N/mm²)</TH>
                  <TH right>τ_a</TH>
                  <TH right>比率</TH>
                  <TH>せん断</TH>
                  <TH>総合</TH>
                </tr>
              </thead>
              <tbody>
                {result.crossBeamChecks.map((cc, idx) => {
                  const cf = result.crossBeamForces[idx];
                  return (
                    <tr key={cc.positionIdx} style={{ background: !cc.allOK ? '#fff0f0' : idx % 2 ? '#f5f5f5' : '#fff' }}>
                      <TD>{(cc.position_x / 1000).toFixed(2)} m</TD>
                      <TD>{cc.section.label.split('×').slice(0, 2).join('×')}</TD>
                      <TD>{cc.steelGrade}</TD>
                      <TD right>{cf ? (cf.tributaryLength / 1000).toFixed(2) : '--'}</TD>
                      <TD right>{cf ? kNm(cf.M_DL) : '--'}</TD>
                      <TD right bold>{kNm(cc.M_design)}</TD>
                      <TD right ng={!cc.bendingOK}>{fmt1(cc.sigma_b)}</TD>
                      <TD right>{cc.sigma_sa}</TD>
                      <TD right ng={!cc.bendingOK}>{pct(cc.ratio_b)}</TD>
                      <TD><OkBadge ok={cc.bendingOK} /></TD>
                      <TD right ng={!cc.shearOK}>{fmt1(cc.tau)}</TD>
                      <TD right>{cc.tau_a}</TD>
                      <TD right ng={!cc.shearOK}>{pct(cc.ratio_s)}</TD>
                      <TD><OkBadge ok={cc.shearOK} /></TD>
                      <TD><OkBadge ok={cc.allOK} /></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              M_DL = w_DL·a²/8　｜　w_DL = (γ_c·t_s + γ_a·t_p)×負担長　｜　M_LL = P_wheel×a/4（後軸片輪 50kN）　｜　M_設計 = M_DL+(1+i)·M_LL
            </div>
          </Section>
        )}

        {/* ── 7. 斜材照査 ── */}
        {diagonalChecks && diagonalChecks.length > 0 && (
          <Section title="7. 斜材 座屈照査（JRA H29 §5.2、有効長係数 K=0.7）">
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <TH>No.</TH>
                  <TH right>長さ (mm)</TH>
                  <TH right>N (kN)</TH>
                  <TH right>σ (N/mm²)</TH>
                  <TH right>λ = KL/r</TH>
                  <TH right>Λ_c</TH>
                  <TH right>σ_allow</TH>
                  <TH right>比率</TH>
                  <TH>座屈域</TH>
                  <TH>判定</TH>
                </tr>
              </thead>
              <tbody>
                {diagonalChecks.map((dc, i) => (
                  <tr key={i} style={{ background: !dc.ok ? '#fff0f0' : i % 2 ? '#f5f5f5' : '#fff' }}>
                    <TD>D{dc.memberId + 1}</TD>
                    <TD right>{dc.length.toFixed(0)}</TD>
                    <TD right>{(dc.N_design / 1000).toFixed(2)}</TD>
                    <TD right ng={!dc.ok}>{fmt1(dc.sigma_axial)}</TD>
                    <TD right>{fmt1(dc.lambda)}</TD>
                    <TD right>{fmt1(dc.Lambda_c)}</TD>
                    <TD right>{fmt1(dc.sigma_allow)}</TD>
                    <TD right ng={!dc.ok}>{pct(dc.ratio)}</TD>
                    <TD>{dc.bucklingMode === 'euler' ? 'Euler' : dc.bucklingMode === 'inelastic' ? '非弾性' : '引張'}</TD>
                    <TD><OkBadge ok={dc.ok} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              λ ≤ Λ_c: σ_ca = F(1−0.5(λ/Λ_c)²)/1.5　｜　λ &gt; Λ_c: σ_ca = π²E/(1.5λ²)　｜　SM400: F=235、Λ_c≒{diagonalChecks[0]?.Lambda_c.toFixed(1)}
            </div>
          </Section>
        )}

        {/* ── 支点反力 ── */}
        <Section title={`${
          (result.crossBeamChecks?.length > 0 ? 1 : 0) +
          (diagonalChecks?.length > 0 ? 1 : 0) + 6
        }. 支点反力`}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <TH>桁</TH>
                <TH right>R_DL 左 (kN)</TH>
                <TH right>R_DL 右 (kN)</TH>
                <TH right>R_LL 左 (kN)</TH>
                <TH right>R_LL 右 (kN)</TH>
                <TH right>R_合計 左 (kN)</TH>
                <TH right>R_合計 右 (kN)</TH>
              </tr>
            </thead>
            <tbody>
              {reactions.map((r, i) => (
                <tr key={i} style={{ background: i % 2 ? '#f5f5f5' : '#fff' }}>
                  <TD>G{i + 1}</TD>
                  <TD right>{kN(r.R_DL_left)}</TD>
                  <TD right>{kN(r.R_DL_right)}</TD>
                  <TD right>{kN(r.R_LL_left_max)}</TD>
                  <TD right>{kN(r.R_LL_right_max)}</TD>
                  <TD right bold>{kN(r.R_left_total)}</TD>
                  <TD right bold>{kN(r.R_right_total)}</TD>
                </tr>
              ))}
              <tr style={{ background: '#e8f0f8' }}>
                <TD bold>合計</TD>
                <TD right bold>{kN(reactions.reduce((s, r) => s + r.R_DL_left, 0))}</TD>
                <TD right bold>{kN(reactions.reduce((s, r) => s + r.R_DL_right, 0))}</TD>
                <TD right bold>{kN(reactions.reduce((s, r) => s + r.R_LL_left_max, 0))}</TD>
                <TD right bold>{kN(reactions.reduce((s, r) => s + r.R_LL_right_max, 0))}</TD>
                <TD right bold>{kN(reactions.reduce((s, r) => s + r.R_left_total, 0))}</TD>
                <TD right bold>{kN(reactions.reduce((s, r) => s + r.R_right_total, 0))}</TD>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
            R_合計 = R_DL + (1+i)·R_LL
          </div>
        </Section>

        {/* ── 警告 ── */}
        {result.warnings.length > 0 && (
          <Section title="注意・警告">
            {result.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 10, color: '#c0392b', marginBottom: 2 }}>⚠ {w}</div>
            ))}
          </Section>
        )}

        {/* ── フッター ── */}
        <div style={{ borderTop: '1px solid #ccc', paddingTop: 6, marginTop: 20, fontSize: 9, color: '#999', display: 'flex', justifyContent: 'space-between' }}>
          <span>BridgeGrillageDesigner — 道路橋示方書（H29）準拠 ｜ Leonhardt格子桁理論 ｜ UI入力方式</span>
          <span>{printDate}</span>
        </div>
      </div>
    </div>
  );

  // createPortal で document.body 直下に配置
  // → #root を @media print で非表示にしても本コンポーネントは残る
  return createPortal(content, document.body);
}
