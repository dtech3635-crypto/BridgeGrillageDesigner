import { useRef, useEffect, useState } from 'react';
import type { InfluenceLineResult } from '../../types/bridge';

interface ChartProps {
  il: InfluenceLineResult;
}

function ILChart({ il }: ChartProps) {
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

    const pad = { top: 36, right: 20, bottom: 36, left: 56 };
    const w = W - pad.left - pad.right;
    const h = H - pad.top - pad.bottom;

    const L = il.spanLength;
    const maxY = Math.max(
      ...il.ordinates_n135.map(Math.abs),
      ...il.ordinates_n1.map(Math.abs),
      0.001
    );

    const toX = (pos: number) => pad.left + (pos / L) * w;
    const toY = (v: number) => pad.top + h / 2 - (v / maxY) * (h * 0.46);

    // Zero line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(0));
    ctx.lineTo(pad.left + w, toY(0));
    ctx.stroke();

    const drawCurve = (
      ordinates: number[],
      positions: number[],
      color: string,
      lineWidth = 1.5,
      dashed = false
    ) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (dashed) ctx.setLineDash([4, 4]);
      else ctx.setLineDash([]);

      ordinates.forEach((v, i) => {
        const x = toX(positions[i]);
        const y = toY(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Fill for the primary curve
      if (!dashed) {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX(positions[0]), toY(0));
        ordinates.forEach((v, i) => ctx.lineTo(toX(positions[i]), toY(v)));
        ctx.lineTo(toX(positions[positions.length - 1]), toY(0));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    drawCurve(il.ordinates_n1,   il.loadPositions, '#64748b', 1, true);
    drawCurve(il.ordinates_n13,  il.loadPositions, '#6366f1', 1.2, true);
    drawCurve(il.ordinates_n135, il.loadPositions, '#3b82f6', 2.5, false);

    // Peak marker
    const peakX = toX(il.criticalLoadPos);
    const peakY = toY(il.maxOrdinate);
    ctx.beginPath();
    ctx.arc(peakX, peakY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`η_max=${(il.maxOrdinate / 1000).toFixed(3)}m`, peakX, peakY - 10);

    // X axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      const px = pad.left + t * w;
      ctx.fillText(`${(t * L / 1000).toFixed(1)}m`, px, H - 4);
    });

    // Y axis labels
    ctx.textAlign = 'right';
    [-1, 0, 1].forEach(t => {
      const v = t * maxY;
      ctx.fillText((v / 1000).toFixed(2) + 'm', pad.left - 4, toY(v) + 4);
    });

    // Section marker (midspan)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(toX(L / 2), pad.top);
    ctx.lineTo(toX(L / 2), pad.top + h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('L/2', toX(L / 2), pad.top - 4);

    // Legend
    ctx.textAlign = 'left';
    const legend = [
      { color: '#64748b', label: 'n=1 (Fourier 1項)', dash: true },
      { color: '#6366f1', label: 'n=1,3 (2項)', dash: true },
      { color: '#3b82f6', label: 'n=1,3,5 (設計用)', dash: false },
    ];
    legend.forEach(({ color, label, dash }, i) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = dash ? 1 : 2;
      ctx.setLineDash(dash ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(pad.left + 8, pad.top + 8 + i * 14);
      ctx.lineTo(pad.left + 28, pad.top + 8 + i * 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(label, pad.left + 32, pad.top + 12 + i * 14);
    });

  }, [il]);

  return <canvas ref={canvasRef} width={640} height={200} style={{ width: '100%' }} />;
}

interface Props {
  influenceLines: InfluenceLineResult[];
}

export function InfluenceLineTab({ influenceLines }: Props) {
  const [selected, setSelected] = useState(0);
  const il = influenceLines[selected];

  if (!il) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#475569' }}>
        解析を実行してください
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Girder selector */}
      <div style={{ display: 'flex', gap: 8 }}>
        {influenceLines.map((_, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
              cursor: 'pointer', border: '1px solid #334155', transition: 'all 0.15s',
              background: selected === i ? '#2563eb' : '#1e293b',
              color: selected === i ? '#fff' : '#94a3b8',
            }}
          >
            G{i + 1}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155', fontSize: 12, color: '#94a3b8' }}>
          G{selected + 1} — 支間中央 曲げモーメント影響線 η_M(x, L/2)
        </div>
        <div style={{ padding: 12 }}>
          <ILChart il={il} />
        </div>
      </div>

      {/* Numeric summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: '最大縦距 η_max', value: `${(il.maxOrdinate / 1000).toFixed(4)} m` },
          { label: '最大縦距位置', value: `x = ${(il.criticalLoadPos / 1000).toFixed(3)} m` },
          { label: '分配係数 η_r', value: il.ordinates_n135[50] !== undefined
            ? `${(il.ordinates_n135[50] / (il.spanLength / 4)).toFixed(4)}` : '--' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 14px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Formula */}
      <div style={{ background: '#0f172a', borderRadius: 10, padding: '10px 16px', fontFamily: 'monospace', fontSize: 11, color: '#475569', lineHeight: 2 }}>
        <div style={{ color: '#64748b', marginBottom: 4 }}>Fourier 級数展開式（支点 x=0,L 固定端、単純支持）:</div>
        <div>{"η_M(x, L/2) = Σ_{n=1,3,5,...} (2L / n²π²) · sin(nπ/2) · sin(nπx/L)"}</div>
        <div style={{ marginTop: 4 }}>= (2L/π²)[sin(πx/L) − sin(3πx/L)/9 + sin(5πx/L)/25 − ···]</div>
        <div style={{ marginTop: 4, color: '#334155' }}>× 横方向分配係数 η_r（Leonhardt法）</div>
      </div>
    </div>
  );
}
