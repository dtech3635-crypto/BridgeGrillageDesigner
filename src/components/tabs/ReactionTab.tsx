import type { ReactionResult, DesignForce } from '../../types/bridge';

const kN = (v: number) => (v / 1e3).toFixed(2);

interface Props {
  reactions: ReactionResult[];
  forces: DesignForce[];
}

function ReactionBar({ label, value, maxValue, color }: {
  label: string; value: number; maxValue: number; color: string;
}) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#64748b', width: 60, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 5, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color, width: 72, textAlign: 'right' }}>
        {kN(value)} kN
      </span>
    </div>
  );
}

export function ReactionTab({ reactions, forces }: Props) {
  if (reactions.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#475569' }}>
        解析を実行してください
      </div>
    );
  }

  const i = forces[0]?.impactFactor ?? 0;
  const maxTotal = Math.max(...reactions.map(r => r.R_left_total), ...reactions.map(r => r.R_right_total), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: '衝撃係数 i', value: `${(i * 100).toFixed(1)}%`, color: '#93c5fd' },
          { label: '最大設計反力（左）', value: `${kN(Math.max(...reactions.map(r => r.R_left_total)))} kN`, color: '#f59e0b' },
          { label: '最大設計反力（右）', value: `${kN(Math.max(...reactions.map(r => r.R_right_total)))} kN`, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 14px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Detailed table */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155', fontSize: 12, color: '#94a3b8' }}>
          各主桁 支点反力一覧（kN）
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
          <thead>
            <tr style={{ background: 'rgba(15,23,42,0.6)', color: '#64748b' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>桁</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>η (分配率)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>R_DL_左 (kN)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>R_DL_右 (kN)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>R_LL_左_max (kN)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>R_LL_右_max (kN)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>R_設計_左 (kN)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>R_設計_右 (kN)</th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r, idx) => (
              <tr key={r.girderId} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                <td style={{ padding: '7px 12px', color: '#fbbf24', fontWeight: 600 }}>G{idx + 1}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#93c5fd' }}>
                  {forces[idx]?.distributionFactor.toFixed(3) ?? '--'}
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#94a3b8' }}>{kN(r.R_DL_left)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#94a3b8' }}>{kN(r.R_DL_right)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#6ee7b7' }}>{kN(r.R_LL_left_max)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#6ee7b7' }}>{kN(r.R_LL_right_max)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{kN(r.R_left_total)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{kN(r.R_right_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar chart for design reactions */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 16 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>設計反力グラフ（DL + (1+i)×LL）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reactions.map((r, idx) => (
            <div key={r.girderId}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>G{idx + 1}</div>
              <ReactionBar label="左支点" value={r.R_left_total}  maxValue={maxTotal} color="#3b82f6" />
              <ReactionBar label="右支点" value={r.R_right_total} maxValue={maxTotal} color="#6366f1" />
            </div>
          ))}
        </div>
      </div>

      {/* Formula */}
      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 2 }}>
        <div>死荷重: R_DL = w×L/2 （等分布荷重、対称）</div>
        <div>活荷重: R_LL = Σ P_i × η_IL(x_i) × η_r × (1+i) （影響線最大値）</div>
        <div>設計: R = R_DL + R_LL (衝撃込み)</div>
        <div>i = 20/(50+L) = {(i * 100).toFixed(1)}%（JRA H29 §2.4.4、L = {forces[0] ? 'span' : '--'} m）</div>
      </div>
    </div>
  );
}
