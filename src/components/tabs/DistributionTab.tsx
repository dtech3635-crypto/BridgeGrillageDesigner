import { useRef, useEffect } from 'react';
import type { DistributionCoefficients } from '../../types/bridge';

interface Props {
  dist: DistributionCoefficients;
}

function KMatrixTable({ dist }: Props) {
  const n = dist.girderPositions.length;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace', width: '100%' }}>
        <thead>
          <tr style={{ background: 'rgba(30,41,59,0.8)' }}>
            <th style={{ padding: '6px 10px', color: '#64748b', textAlign: 'left' }}>K[s→r]</th>
            {Array.from({ length: n }, (_, r) => (
              <th key={r} style={{ padding: '6px 10px', color: '#93c5fd', textAlign: 'right' }}>
                G{r + 1} (受)
              </th>
            ))}
            <th style={{ padding: '6px 10px', color: '#64748b', textAlign: 'right' }}>合計</th>
          </tr>
        </thead>
        <tbody>
          {dist.matrix.map((row, s) => {
            const sum = row.reduce((a, v) => a + v, 0);
            return (
              <tr key={s} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                <td style={{ padding: '6px 10px', color: '#fbbf24' }}>G{s + 1} (載)</td>
                {row.map((v, r) => (
                  <td key={r} style={{
                    padding: '6px 10px', textAlign: 'right',
                    color: s === r ? '#4ade80' : '#e2e8f0',
                    fontWeight: s === r ? 700 : 400,
                  }}>
                    {v.toFixed(4)}
                  </td>
                ))}
                <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>
                  {sum.toFixed(4)}
                </td>
              </tr>
            );
          })}
          {/* Max row */}
          <tr style={{ background: 'rgba(30,41,59,0.5)', borderTop: '2px solid #334155' }}>
            <td style={{ padding: '6px 10px', color: '#f97316', fontSize: 11 }}>最大分配率</td>
            {dist.maxFactors.map((v, r) => (
              <td key={r} style={{ padding: '6px 10px', textAlign: 'right', color: '#f97316', fontWeight: 700 }}>
                {(v * 100).toFixed(1)}%
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BarChart({ dist }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    const n = dist.girderPositions.length;
    const pad = { left: 40, right: 20, top: 30, bottom: 30 };
    const bw = (W - pad.left - pad.right) / n;
    const maxV = Math.max(...dist.maxFactors, 0.01);

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('最大分配係数（各桁の最悪ケース）', pad.left, 18);

    for (let r = 0; r < n; r++) {
      const v = dist.maxFactors[r];
      const barH = ((H - pad.top - pad.bottom) * v) / maxV;
      const x = pad.left + r * bw + bw * 0.15;
      const y = H - pad.bottom - barH;
      const w = bw * 0.7;

      // Color gradient
      const t = v / maxV;
      const R = Math.round(255 * Math.min(1, t * 2));
      const G = Math.round(255 * Math.min(1, 2 - t * 2));
      ctx.fillStyle = `rgb(${R},${G},50)`;
      ctx.fillRect(x, y, w, barH);

      // Value
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${(v * 100).toFixed(1)}%`, x + w / 2, y - 4);

      // Label
      ctx.fillStyle = '#64748b';
      ctx.fillText(`G${r + 1}`, x + w / 2, H - pad.bottom + 14);
    }

    // Baseline
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, H - pad.bottom);
    ctx.lineTo(W - pad.right, H - pad.bottom);
    ctx.stroke();
  }, [dist]);

  return <canvas ref={canvasRef} width={500} height={180} style={{ width: '100%' }} />;
}

export function DistributionTab({ dist }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* α Parameter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Leonhardt α', value: dist.alpha.toFixed(4), sub: 'EI_cross×L / (EI_main×b)' },
          { label: '主桁本数 n', value: dist.girderPositions.length.toString(), sub: '格子桁スパン本数' },
          { label: '最大分配率', value: `${(Math.max(...dist.maxFactors) * 100).toFixed(1)}%`, sub: '最大集中率（設計用）' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: 10, padding: '12px 16px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>{value}</div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* K Matrix */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155', fontSize: 12, color: '#94a3b8' }}>
          K行列（横方向分配係数）— K[s][r]: s桁位置に載荷 → r桁への分配率
        </div>
        <KMatrixTable dist={dist} />
      </div>

      {/* Bar chart */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155', fontSize: 12, color: '#94a3b8' }}>
          各桁の最大分配係数グラフ
        </div>
        <div style={{ padding: 12 }}>
          <BarChart dist={dist} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 1.8 }}>
        <div>α大 (剛横桁) → 均等分配 ≈ 1/n</div>
        <div>α小 (柔横桁) → 載荷桁に集中</div>
        <div>設計用分配係数: 各桁の最大値（最悪載荷位置）を採用</div>
      </div>
    </div>
  );
}
