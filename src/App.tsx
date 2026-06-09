import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AnalysisInput, AnalysisResult, GrillageModel,
  DeadLoadSettings, BeamElementProps, DiagElementProps,
} from './types/bridge';
import type { WorkerRequest, WorkerResponse } from './types/worker';
import { LoadSettings }     from './components/LoadSettings';
import { DxfUploader }      from './components/DxfUploader';
import { ThreeViewer }      from './components/ThreeViewer';
import { ElementEditor }    from './components/ElementEditor';
import { DistributionTab }  from './components/tabs/DistributionTab';
import { StressCheckTab }   from './components/tabs/StressCheckTab';
import { InfluenceLineTab } from './components/tabs/InfluenceLineTab';
import { ReactionTab }      from './components/tabs/ReactionTab';
import { PrintReport }      from './components/PrintReport';
import {
  createSampleInput,
  createDefaultBeamProps,
  createDefaultDiagProps,
} from './lib/sampleData';
import './index.css';

type RightTab = 'elements' | 'dist' | 'stress' | 'influence' | 'reaction';

const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: 'elements',  label: '要素設定' },
  { id: 'dist',      label: '分配係数' },
  { id: 'stress',    label: '応力度照査' },
  { id: 'influence', label: '影響線' },
  { id: 'reaction',  label: '支点反力' },
];

type InputMode = 'sample' | 'dxf';

export default function App() {
  const sample = createSampleInput();

  // ── State ────────────────────────────────────────────────
  const [model,       setModel]       = useState<GrillageModel>(sample.model);
  const [beamProps,   setBeamProps]   = useState<Record<number, BeamElementProps>>(sample.beamProps);
  const [diagProps,   setDiagProps]   = useState<Record<number, DiagElementProps>>(sample.diagProps);
  const [deadLoad,    setDeadLoad]    = useState<DeadLoadSettings>(sample.deadLoad);
  const [liveType,    setLiveType]    = useState<'T' | 'B'>('T');
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [computing,   setComputing]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [rightTab,    setRightTab]    = useState<RightTab>('elements');
  const [selectedGirder, setSelectedGirder] = useState(0);
  const [inputMode,   setInputMode]   = useState<InputMode>('sample');

  const workerRef = useRef<Worker | null>(null);

  // ── Worker lifecycle ─────────────────────────────────────
  useEffect(() => {
    const w = new Worker(
      new URL('./workers/calcWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = w;

    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'PROGRESS':
          setProgress(msg.percent);
          setProgressMsg(msg.message);
          break;
        case 'RESULT':
          setResult(msg.payload);
          setComputing(false);
          setProgress(100);
          break;
        case 'ERROR':
          setError(msg.message);
          setComputing(false);
          break;
      }
    };
    return () => w.terminate();
  }, []);

  // ── Run on mount ─────────────────────────────────────────
  useEffect(() => {
    runAnalysis({ model, beamProps, diagProps, deadLoad, liveLoadType: 'T' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analysis trigger ─────────────────────────────────────
  const runAnalysis = useCallback((inp: AnalysisInput) => {
    if (!workerRef.current) return;
    setComputing(true);
    setProgress(0);
    setError(null);
    const req: WorkerRequest = { type: 'ANALYZE', payload: inp };
    workerRef.current.postMessage(req);
  }, []);

  const handleRunClick = useCallback(() => {
    runAnalysis({ model, beamProps, diagProps, deadLoad, liveLoadType: liveType });
  }, [model, beamProps, diagProps, deadLoad, liveType, runAnalysis]);

  const handleDxfLoaded = useCallback((newModel: GrillageModel) => {
    const newBeamProps = createDefaultBeamProps(newModel);
    const newDiagProps = createDefaultDiagProps(newModel);
    setModel(newModel);
    setBeamProps(newBeamProps);
    setDiagProps(newDiagProps);
    setInputMode('dxf');
    setRightTab('elements');  // DXF読み込み後は要素設定タブへ
  }, []);

  // ── Styles ───────────────────────────────────────────────
  const S = {
    panel: {
      background: '#1e293b',
      borderRadius: 14,
      border: '1px solid #334155',
      padding: 16,
    } as React.CSSProperties,
    tabBtn: (active: boolean, disabled: boolean): React.CSSProperties => ({
      flex: 1, padding: '8px 4px', borderRadius: 6, fontSize: 11, fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
      transition: 'all 0.15s',
      background: active ? '#2563eb' : 'transparent',
      color: active ? '#fff' : disabled ? '#334155' : '#94a3b8',
      opacity: disabled ? 0.5 : 1,
    }),
    modeBtn: (active: boolean): React.CSSProperties => ({
      flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500, cursor: 'pointer',
      border: 'none', transition: 'all 0.15s',
      background: active ? '#2563eb' : '#0f172a',
      color: active ? '#fff' : '#64748b',
    }),
  };

  const needsResult = (tab: RightTab) => tab !== 'elements';

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 24px', flexShrink: 0 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
              BridgeGrillageDesigner
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
              道路橋示方書（H29）準拠 ｜ Leonhardt格子桁理論 ｜ UI入力方式
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {['Fourier影響線', 'T/B荷重', '合成断面', '斜材(§5.2)', '断面UIプリセット'].map(t => (
              <span key={t} style={{ background: '#0f172a', padding: '3px 8px', borderRadius: 5, fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                {t}
              </span>
            ))}
            {result && (
              <span style={{ fontSize: 11, color: '#4ade80', fontFamily: 'monospace', marginLeft: 8 }}>
                ✓ {new Date(result.computedAt).toLocaleTimeString()}
              </span>
            )}
            {result && (
              <button
                onClick={() => window.print()}
                title="計算結果を印刷（PDF保存も可）"
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid #334155',
                  background: '#1e293b', color: '#94a3b8',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#334155'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1e293b'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
              >
                🖨️ 印刷
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── 3-panel layout ── */}
      <div style={{
        flex: 1, maxWidth: 1600, margin: '0 auto', padding: 16,
        display: 'grid', gridTemplateColumns: '280px 1fr 580px', gap: 16,
        width: '100%', boxSizing: 'border-box',
      }}>

        {/* ────────────────── LEFT PANEL ────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          {/* Dead load settings */}
          <div style={{ ...S.panel, overflowY: 'auto', maxHeight: '45vh' }}>
            <LoadSettings
              value={deadLoad}
              numGirders={model.numGirders}
              totalWidth={model.totalWidth}
              onChange={setDeadLoad}
            />
          </div>

          {/* Input mode */}
          <div style={{ ...S.panel, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex' }}>
              <button style={S.modeBtn(inputMode === 'sample')} onClick={() => setInputMode('sample')}>サンプル</button>
              <button style={S.modeBtn(inputMode === 'dxf')} onClick={() => setInputMode('dxf')}>DXF読込</button>
            </div>
            <div style={{ padding: 12 }}>
              {inputMode === 'dxf' ? (
                <DxfUploader onModelLoaded={handleDxfLoaded} />
              ) : (
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.8 }}>
                  <div style={{ color: '#64748b', fontWeight: 600, marginBottom: 8 }}>サンプルデータ（H29道橋示）</div>
                  {[
                    ['支間長', `${model.spanLength / 1000} m`],
                    ['主桁数', `${model.numGirders} 本`],
                    ['主桁間隔', `${model.girderSpacing} mm`],
                    ['斜材数', (model.diagonals ?? []).length],
                    ['幅員', `${(model.totalWidth / 1000 + model.girderSpacing / 1000).toFixed(1)} m`],
                  ].map(([k, v]) => (
                    <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#475569' }}>{k}</span>
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Live load + run */}
          <div style={S.panel}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>活荷重種別</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['T', 'B'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setLiveType(t)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid #334155',
                    background: liveType === t ? '#1d4ed8' : '#0f172a',
                    color: liveType === t ? '#fff' : '#64748b',
                  }}
                >
                  {t}荷重
                </button>
              ))}
            </div>

            <button
              onClick={handleRunClick}
              disabled={computing}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: computing ? 'not-allowed' : 'pointer', border: 'none',
                background: computing ? '#1e3a5f' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                color: computing ? '#64748b' : '#fff', transition: 'all 0.2s',
              }}
            >
              {computing ? `計算中... ${progress}%` : '計算実行'}
            </button>

            {computing && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: '#0f172a', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#3b82f6', width: `${progress}%`, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>{progressMsg}</div>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', fontSize: 11, color: '#f87171' }}>
                {error}
              </div>
            )}

            {result?.warnings?.length ? (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(245,158,11,0.1)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', fontSize: 11, color: '#fbbf24' }}>
                {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            ) : null}
          </div>

          {/* Model stats */}
          <div style={{ ...S.panel, fontSize: 11, fontFamily: 'monospace' }}>
            <div style={{ color: '#64748b', fontWeight: 600, marginBottom: 8, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>モデル情報</div>
            {[
              ['節点数', model.nodes.length],
              ['梁要素', model.beams.length],
              ['　主桁', model.beams.filter(b => b.type === 'main').length],
              ['　横桁', model.beams.filter(b => b.type === 'cross').length],
              ['斜材', (model.diagonals ?? []).length],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: '#475569' }}>{k}</span>
                <span style={{ color: '#94a3b8' }}>{v}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ────────────────── CENTER PANEL ────────────────── */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* 3D Viewer */}
          <div style={{ ...S.panel, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>3Dモデルビュー (ドラッグ: 回転 / スクロール: ズーム)</span>
              <span style={{ fontSize: 10, color: '#334155' }}>
                {result?.stressChecks?.some(c => !c.allOK) ? '🔴 NG桁あり' : result ? '🟢 全OK' : ''}
              </span>
            </div>
            <ThreeViewer
              model={model}
              stressChecks={result?.stressChecks}
              selectedGirder={selectedGirder}
            />
          </div>

          {/* Girder selector */}
          {result && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#475569', alignSelf: 'center' }}>主桁選択:</span>
              {Array.from({ length: model.numGirders }, (_, i) => {
                const check = result.stressChecks[i];
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedGirder(i)}
                    style={{
                      padding: '4px 14px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                      cursor: 'pointer',
                      border: `1px solid ${check && !check.allOK ? '#ef4444' : '#334155'}`,
                      background: selectedGirder === i ? '#2563eb' : '#1e293b',
                      color: selectedGirder === i ? '#fff' : (check && !check.allOK ? '#f87171' : '#94a3b8'),
                    }}
                  >
                    G{i + 1} {check ? `${(check.ratio_b * 100).toFixed(0)}%` : ''}
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected girder summary */}
          {result && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {[
                { label: 'M_設計', value: `${(result.designForces[selectedGirder]?.M_design / 1e6).toFixed(1)} kN·m`, color: '#f59e0b' },
                { label: 'V_設計', value: `${(result.designForces[selectedGirder]?.V_design / 1e3).toFixed(1)} kN`, color: '#a78bfa' },
                { label: 'σ_b', value: `${result.stressChecks[selectedGirder]?.sigma_b.toFixed(1)} N/mm²`, color: result.stressChecks[selectedGirder]?.bendingOK ? '#4ade80' : '#f87171' },
                { label: 'τ', value: `${result.stressChecks[selectedGirder]?.tau.toFixed(1)} N/mm²`, color: result.stressChecks[selectedGirder]?.shearOK ? '#4ade80' : '#f87171' },
                { label: '判定', value: result.stressChecks[selectedGirder]?.allOK ? 'OK' : 'NG', color: result.stressChecks[selectedGirder]?.allOK ? '#4ade80' : '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#1e293b', borderRadius: 8, padding: '8px 12px', border: '1px solid #334155', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace', marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {!result && !computing && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', borderRadius: 14, border: '2px dashed #334155', minHeight: 200, color: '#475569' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏗️</div>
                <p style={{ margin: 0 }}>「計算実行」ボタンを押してください</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#334155' }}>※ 右パネル「要素設定」で断面・鋼材を確認・変更できます</p>
              </div>
            </div>
          )}
        </main>

        {/* ────────────────── RIGHT PANEL ────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Tab header */}
          <div style={{ background: '#1e293b', borderRadius: 10, padding: 4, border: '1px solid #334155', display: 'flex', gap: 2 }}>
            {RIGHT_TABS.map(t => {
              const disabled = needsResult(t.id) && !result;
              return (
                <button
                  key={t.id}
                  onClick={() => !disabled && setRightTab(t.id)}
                  style={S.tabBtn(rightTab === t.id, disabled)}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ ...S.panel, flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {rightTab === 'elements' && (
              <ElementEditor
                model={model}
                beamProps={beamProps}
                diagProps={diagProps}
                onBeamPropsChange={setBeamProps}
                onDiagPropsChange={setDiagProps}
              />
            )}

            {needsResult(rightTab) && !result ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#475569' }}>
                {computing ? progressMsg : '計算結果がここに表示されます'}
              </div>
            ) : (
              <>
                {rightTab === 'dist' && result && (
                  <DistributionTab dist={result.distribution} />
                )}
                {rightTab === 'stress' && result && (
                  <StressCheckTab
                    forces={result.designForces}
                    checks={result.stressChecks}
                    girderSections={result.girderSections}
                    onSelectGirder={setSelectedGirder}
                    selectedGirder={selectedGirder}
                    diagonalChecks={result.diagonalChecks}
                    crossBeamForces={result.crossBeamForces}
                    crossBeamChecks={result.crossBeamChecks}
                  />
                )}
                {rightTab === 'influence' && result && (
                  <InfluenceLineTab influenceLines={result.influenceLines} />
                )}
                {rightTab === 'reaction' && result && (
                  <ReactionTab reactions={result.reactions} forces={result.designForces} />
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ── 印刷レポート（@media print のみ表示） ── */}
      {result && (
        <PrintReport
          result={result}
          model={model}
          deadLoad={deadLoad}
          beamProps={beamProps}
          diagProps={diagProps}
          liveLoadType={liveType}
        />
      )}

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '10px 24px', textAlign: 'center', fontSize: 10, color: '#334155' }}>
        BridgeGrillageDesigner — 道路橋示方書（H29）準拠 ｜ UI入力方式（DXF座標 + 断面プリセット）｜ i = 20/(50+L)
      </footer>
    </div>
  );
}
