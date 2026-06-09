import type {
  DesignForce,
  StressCheckResult,
  SectionProperties,
  DiagonalCheck,
  CrossBeamDesignForce,
  CrossBeamCheckResult,
} from '../../types/bridge';

const kNm = (v: number) => (v / 1e6).toFixed(1);
const MPa = (v: number) => v.toFixed(1);

interface RatioBarProps { ratio: number; ok: boolean }
function RatioBar({ ratio, ok }: RatioBarProps) {
  const pct = Math.min(ratio * 100, 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, transition: 'width 0.4s',
          width: `${pct}%`,
          background: ok ? '#22c55e' : '#ef4444',
        }} />
      </div>
      <span style={{
        fontSize: 11, fontFamily: 'monospace', minWidth: 44, textAlign: 'right',
        color: ok ? '#4ade80' : '#f87171',
      }}>
        {(ratio * 100).toFixed(1)}%
      </span>
    </div>
  );
}

interface Props {
  forces: DesignForce[];
  checks: StressCheckResult[];
  girderSections: SectionProperties[];   // per-girder (index = girderId)
  onSelectGirder: (id: number) => void;
  selectedGirder: number;
  diagonalChecks?: DiagonalCheck[];
  crossBeamForces?: CrossBeamDesignForce[];
  crossBeamChecks?: CrossBeamCheckResult[];
}

export function StressCheckTab({
  forces, checks, girderSections,
  onSelectGirder, selectedGirder,
  diagonalChecks,
  crossBeamForces,
  crossBeamChecks,
}: Props) {
  const ngCount    = checks.filter(c => !c.allOK).length;
  const maxRatioB  = Math.max(...checks.map(c => c.ratio_b));
  const maxRatioS  = Math.max(...checks.map(c => c.ratio_s));

  // 代表断面（選択桁 or 最初）
  const repSec = girderSections[selectedGirder] ?? girderSections[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'NG桁数', value: `${ngCount}/${checks.length}`, color: ngCount > 0 ? '#ef4444' : '#22c55e' },
          { label: '最大曲げ比率', value: `${(maxRatioB * 100).toFixed(1)}%`, color: maxRatioB > 1 ? '#ef4444' : '#fbbf24' },
          { label: '最大せん断比率', value: `${(maxRatioS * 100).toFixed(1)}%`, color: maxRatioS > 1 ? '#ef4444' : '#fbbf24' },
          { label: '選択桁 σ_sa', value: `${checks[selectedGirder]?.sigma_sa ?? '--'} N/mm²`, color: '#93c5fd' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 14px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Section info for selected girder */}
      {repSec && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: '10px 16px', border: '1px solid #334155', fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
          <span style={{ color: '#94a3b8' }}>G{selectedGirder + 1}: {repSec.label}</span>
          {repSec.isComposite
            ? ` + RC床版 (t=${repSec.slabThickness}mm, be=${repSec.slabWidth.toFixed(0)}mm)`
            : ''}
          {' | '}Ix={(repSec.isComposite ? repSec.Ix_comp : repSec.Ix) >= 1e4
            ? `${((repSec.isComposite ? repSec.Ix_comp : repSec.Ix) / 1e4).toFixed(0)} cm⁴`
            : `${(repSec.isComposite ? repSec.Ix_comp : repSec.Ix).toFixed(0)} mm⁴`}
          {' | '}鋼材種別: <span style={{ color: '#3b82f6' }}>{checks[selectedGirder]?.steelGrade}</span>
          {repSec.isComposite ? ` | yNA=${repSec.yNA_comp.toFixed(0)}mm` : ''}
        </div>
      )}

      {/* Main results table */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ background: 'rgba(15,23,42,0.6)', color: '#64748b' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>桁</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>断面</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>η</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>M_DL (kN·m)</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>M_LL (kN·m)</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>M_設計 (kN·m)</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>σ_t (下端)</th>
              {checks.some(c => c.sigma_top !== undefined) && (
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>σ_c (上端)</th>
              )}
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>τ</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 100 }}>曲げ</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 100 }}>せん断</th>
              {checks.some(c => c.sigma_c > 0) && (
                <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 100 }}>コンクリート</th>
              )}
              {checks.some(c => c.sigma_caf !== undefined) && (
                <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 110 }}>圧縮フランジ</th>
              )}
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>判定</th>
            </tr>
          </thead>
          <tbody>
            {forces.map((f, idx) => {
              const c   = checks[idx];
              const sec = girderSections[idx];
              if (!c) return null;
              const isSelected = idx === selectedGirder;
              return (
                <tr
                  key={f.girderId}
                  onClick={() => onSelectGirder(idx)}
                  style={{
                    borderBottom: '1px solid rgba(51,65,85,0.3)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(37,99,235,0.15)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '7px 10px', color: '#fbbf24', fontWeight: 600 }}>G{idx + 1}</td>
                  <td style={{ padding: '7px 10px', color: '#475569', fontSize: 10 }}>
                    {sec ? sec.label.split('×').slice(0, 2).join('×') : '--'}
                    {sec?.isComposite ? ' +RC' : ''}
                    {' '}
                    <span style={{ color: '#334155', fontSize: 9 }}>{c.steelGrade}</span>
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#93c5fd' }}>{f.distributionFactor.toFixed(3)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e2e8f0' }}>{kNm(f.M_DL)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e2e8f0' }}>{kNm(f.M_LL)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{kNm(f.M_design)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: c.bendingOK ? '#e2e8f0' : '#f87171', fontWeight: c.bendingOK ? 400 : 700 }}>{MPa(c.sigma_b)}</td>
                  {checks.some(cc => cc.sigma_top !== undefined) && (
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#94a3b8' }}>
                      {c.sigma_top !== undefined ? MPa(c.sigma_top) : '—'}
                    </td>
                  )}
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: c.shearOK ? '#e2e8f0' : '#f87171' }}>{MPa(c.tau)}</td>
                  <td style={{ padding: '7px 10px' }}><RatioBar ratio={c.ratio_b} ok={c.bendingOK} /></td>
                  <td style={{ padding: '7px 10px' }}><RatioBar ratio={c.ratio_s} ok={c.shearOK} /></td>
                  {c.sigma_c > 0
                    ? <td style={{ padding: '7px 10px' }}><RatioBar ratio={c.ratio_c} ok={c.concreteOK} /></td>
                    : checks.some(cc => cc.sigma_c > 0) ? <td /> : null}
                  {checks.some(cc => cc.sigma_caf !== undefined) && (
                    c.sigma_caf !== undefined
                      ? <td style={{ padding: '7px 10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <RatioBar ratio={c.ratio_cf!} ok={c.cfOK!} />
                            <span style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace' }}>
                              {c.cfMode === 'loc' ? '局部' : '横倒'} b₁/t={c.b1_tf!.toFixed(1)} σca={c.sigma_caf!.toFixed(0)}
                            </span>
                          </div>
                        </td>
                      : <td />
                  )}
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: c.allOK ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: c.allOK ? '#4ade80' : '#f87171',
                    }}>
                      {c.allOK ? 'OK' : 'NG'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 2 }}>
        {checks.map((c, i) => (
          <div key={i}>G{i + 1}: σ_sa={c.sigma_sa} τ_a={c.tau_a} N/mm² ({c.steelGrade})</div>
        ))}
        <div>衝撃係数 i = {forces[0] ? (forces[0].impactFactor * 100).toFixed(1) : '--'}%  [M_設計 = M_DL + (1+i)·M_LL]</div>
        {checks.some(c => c.sigma_c > 0) && <div>σ_ca = {checks[0]?.sigma_ca} N/mm² (コンクリート f'c=30)</div>}
        {checks.some(c => c.sigma_caf !== undefined) && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #1e293b' }}>
            <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: 2 }}>圧縮フランジ座屈照査（JRA H29 §5.2.3）</div>
            <div>b₁ = (bf−tw)/2　｜　b₁/tf ≤ 10.5: 横倒れ σcag = F − 4.6×(l₀/bf − 3.5)　｜　b₁/tf &gt; 10.5: 局部 σcat = 23000×(tf/b₁)²</div>
            <div>l₀ = 横桁最大間隔（圧縮フランジ非支持長）　｜　σca = min(σcag または σcat, σta)</div>
          </div>
        )}
      </div>

      {/* ── 横桁照査 ── */}
      {crossBeamChecks && crossBeamChecks.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 8,
            paddingBottom: 4, borderBottom: '1px solid #334155',
          }}>
            横桁（BEAM_CROSS）— 応力度照査
          </div>
          <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: 'rgba(15,23,42,0.7)', color: '#64748b' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>位置</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>断面</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>負担長 (m)</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>M_DL</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>M_設計 (kN·m)</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>σ_b (N/mm²)</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>σ_sa</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', minWidth: 90 }}>曲げ比率</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>τ</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>τ_a</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', minWidth: 90 }}>せん断比率</th>
                  <th style={{ padding: '7px 10px', textAlign: 'center' }}>判定</th>
                </tr>
              </thead>
              <tbody>
                {crossBeamChecks.map((cc, idx) => {
                  const cf = crossBeamForces?.[idx];
                  return (
                    <tr key={cc.positionIdx} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                      <td style={{ padding: '6px 10px', color: '#38bdf8', fontWeight: 600 }}>
                        x={(cc.position_x / 1000).toFixed(2)}m
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569', fontSize: 10 }}>
                        {cc.section.label.split('×').slice(0, 2).join('×')}
                        {' '}<span style={{ color: '#334155', fontSize: 9 }}>{cc.steelGrade}</span>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>
                        {cf ? (cf.tributaryLength / 1000).toFixed(2) : '--'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>
                        {cf ? (cf.M_DL / 1e6).toFixed(1) : '--'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                        {(cc.M_design / 1e6).toFixed(1)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: cc.bendingOK ? '#e2e8f0' : '#f87171', fontWeight: cc.bendingOK ? 400 : 700 }}>
                        {cc.sigma_b.toFixed(1)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>{cc.sigma_sa}</td>
                      <td style={{ padding: '6px 10px' }}><RatioBar ratio={cc.ratio_b} ok={cc.bendingOK} /></td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: cc.shearOK ? '#e2e8f0' : '#f87171' }}>
                        {cc.tau.toFixed(1)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>{cc.tau_a}</td>
                      <td style={{ padding: '6px 10px' }}><RatioBar ratio={cc.ratio_s} ok={cc.shearOK} /></td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: cc.allOK ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: cc.allOK ? '#4ade80' : '#f87171',
                        }}>
                          {cc.allOK ? 'OK' : 'NG'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', marginTop: 6, lineHeight: 1.8 }}>
            <div>横桁スパン: a = 主桁間隔　｜　M_DL = w_DL·a²/8　｜　w_DL = (γ_c·t_s + γ_a·t_p) × 負担長</div>
            <div>M_LL = P_wheel × a/4（後軸片輪50kN、中央集中荷重）　｜　M_設計 = M_DL + (1+i)·M_LL</div>
          </div>
        </div>
      )}

      {/* ── 斜材照査 ── */}
      {diagonalChecks && diagonalChecks.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8,
            paddingBottom: 4, borderBottom: '1px solid #334155',
          }}>
            斜材（BEAM_DIAGONAL）— JRA H29 §5.2 座屈照査
          </div>
          <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ background: 'rgba(15,23,42,0.7)', color: '#64748b' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left' }}>No.</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>L (mm)</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>N (kN)</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>σ (N/mm²)</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>λ</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>Λ_c</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>σ_allow</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', minWidth: 90 }}>比率</th>
                  <th style={{ padding: '7px 10px', textAlign: 'center' }}>座屈</th>
                  <th style={{ padding: '7px 10px', textAlign: 'center' }}>判定</th>
                </tr>
              </thead>
              <tbody>
                {diagonalChecks.map(dc => (
                  <tr key={dc.memberId} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                    <td style={{ padding: '6px 10px', color: '#ef4444', fontWeight: 600 }}>D{dc.memberId + 1}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{dc.length.toFixed(0)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: dc.isTension ? '#34d399' : '#fb923c' }}>
                      {(dc.N_design / 1000).toFixed(1)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: dc.ok ? '#e2e8f0' : '#f87171', fontWeight: dc.ok ? 400 : 700 }}>
                      {dc.sigma_axial.toFixed(1)}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{dc.lambda.toFixed(1)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#475569' }}>{dc.Lambda_c.toFixed(1)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#93c5fd' }}>{dc.sigma_allow.toFixed(1)}</td>
                    <td style={{ padding: '6px 10px' }}><RatioBar ratio={dc.ratio} ok={dc.ok} /></td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10, color: '#64748b' }}>
                      {dc.bucklingMode === 'euler' ? 'Euler' : dc.bucklingMode === 'inelastic' ? '非弾性' : '引張'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: dc.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: dc.ok ? '#4ade80' : '#f87171',
                      }}>
                        {dc.ok ? 'OK' : 'NG'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', marginTop: 6, lineHeight: 1.8 }}>
            <div>SM400: F=235 N/mm²  ｜  Λ_c = π√(2E/F) ≒ {diagonalChecks[0]?.Lambda_c.toFixed(1)}  ｜  有効長係数 K=0.7（ガセットプレート接合）</div>
            <div>λ = K·L/r_min  ｜  λ ≤ Λ_c: σ_ca=F(1−0.5(λ/Λ_c)²)/1.5  ｜  λ&gt;Λ_c: σ_ca=π²E/(1.5λ²)</div>
          </div>
        </div>
      )}
    </div>
  );
}
