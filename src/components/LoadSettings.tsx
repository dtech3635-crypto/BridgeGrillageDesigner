import { useState, useEffect } from 'react';
import type { DeadLoadSettings } from '../types/bridge';
import { GAMMA_CONCRETE, GAMMA_ASPHALT } from '../types/bridge';

interface Props {
  value: DeadLoadSettings;
  numGirders: number;
  totalWidth?: number;
  onChange: (v: DeadLoadSettings) => void;
}

/** 桁別死荷重の計算（UI プレビュー用） */
function calcGirderDL(local: DeadLoadSettings, numGirders: number, isExt: boolean) {
  const bT = (isExt
    ? (local.tributaryWidth_ext ?? local.tributaryWidth)
    : local.tributaryWidth) * 1000;
  const w_slab  = GAMMA_CONCRETE * local.slabThickness * bT;
  const w_pave  = GAMMA_ASPHALT  * local.pavementThickness * bT;
  const numExt  = numGirders <= 2 ? numGirders : 2;
  const w_guard = isExt
    ? (local.guardrailLoad * 1000) / numExt / 1000
    : 0;
  const w_other = local.otherLoad * 1000 / 1000;
  const gamma_s = (local.steelUnitWeight ?? 77) * 1e-6;
  const A_main  = (local.mainGirderArea_cm2 ?? 215) * 100;
  const w_steel = gamma_s * A_main;
  return { w_slab, w_pave, w_guard, w_other, w_steel,
           w_total: w_slab + w_pave + w_guard + w_other + w_steel };
}

export function LoadSettings({ value, numGirders, onChange }: Props) {
  const [local, setLocal] = useState<DeadLoadSettings>(value);

  useEffect(() => { setLocal(value); }, [value]);

  const set = <K extends keyof DeadLoadSettings>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      const next = { ...local, [key]: isNaN(v) ? 0 : v };
      setLocal(next);
      onChange(next);
    };

  const extDL = calcGirderDL(local, numGirders, true);
  const intDL = calcGirderDL(local, numGirders, false);
  const hasInterior = numGirders >= 3;

  const Row = ({ label, field, unit, step = 1 }: {
    label: string; field: keyof DeadLoadSettings; unit: string; step?: number;
  }) => (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        value={local[field] as number}
        onChange={set(field)}
        className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-blue-400"
      />
      <span className="text-xs text-slate-500 w-10">{unit}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">死荷重設定</div>

      {/* RC床版 */}
      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700">
        <p className="text-xs text-slate-500 font-medium">RC床版</p>
        <Row label="スラブ厚" field="slabThickness" unit="mm" />
        <Row label="コンクリート単位重量" field="slabDensity" unit="kN/m³" step={0.1} />
      </div>

      {/* 舗装 */}
      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700">
        <p className="text-xs text-slate-500 font-medium">舗装</p>
        <Row label="舗装厚" field="pavementThickness" unit="mm" />
        <Row label="舗装単位重量" field="pavementDensity" unit="kN/m³" step={0.1} />
      </div>

      {/* 鋼材 */}
      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700">
        <p className="text-xs text-slate-500 font-medium">鋼材</p>
        <Row label="鋼材単位体積重量" field="steelUnitWeight" unit="kN/m³" step={0.5} />
        <Row label="主桁断面積" field="mainGirderArea_cm2" unit="cm²" step={1} />
        <Row label="斜材断面積" field="diagonalArea_cm2" unit="cm²" step={0.1} />
        <Row label="斜材最小断面二次半径" field="diagonalRmin_mm" unit="mm" step={0.1} />
      </div>

      {/* 幅員・桁数 */}
      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700">
        <p className="text-xs text-slate-500 font-medium">橋梁幅員・負担幅</p>
        <Row label="幅員" field="totalWidth_m" unit="m" step={0.1} />
        <Row label="主桁本数" field="numGirders_ui" unit="本" step={1} />
        <div className="mt-1 pt-1 border-t border-slate-700/60 space-y-1">
          <Row label="内桁 負担幅（桁間/2）" field="tributaryWidth" unit="m" step={0.05} />
          <Row label="外桁 負担幅（張出し含む）" field="tributaryWidth_ext" unit="m" step={0.05} />
          <p className="text-xs text-slate-600">
            外桁 = 桁間/2 + 張出し長 | 例: 2500/2 + 400 = 1650mm
          </p>
        </div>
      </div>

      {/* 付属物 */}
      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700">
        <p className="text-xs text-slate-500 font-medium">付属物</p>
        <Row label="高欄（両側合計）" field="guardrailLoad" unit="kN/m" step={0.1} />
        <p className="text-xs text-slate-600">→ 外桁 2 本に等分配</p>
        <Row label="その他" field="otherLoad" unit="kN/m" step={0.1} />
      </div>

      {/* Girder-by-girder dead load preview */}
      <div className="p-3 bg-amber-900/20 rounded-lg border border-amber-700/40 space-y-2">
        <div className="text-xs text-amber-400 font-semibold">桁別死荷重強度（リアルタイム）</div>

        {/* 外桁 */}
        <div>
          <div className="text-xs text-sky-400 font-medium mb-1">
            外桁（G1{numGirders >= 3 ? ` / G${numGirders}` : ''}）
            <span className="text-slate-500 ml-1">
              負担幅={local.tributaryWidth_ext ?? local.tributaryWidth}m
            </span>
          </div>
          {[
            ['床版', extDL.w_slab],
            ['舗装', extDL.w_pave],
            ['主桁自重', extDL.w_steel],
            ['高欄（片側）', extDL.w_guard],
            ['その他', extDL.w_other],
          ].map(([lbl, v]) => (
            <div key={lbl as string} className="flex justify-between text-xs font-mono pl-2">
              <span className="text-slate-500">{lbl as string}</span>
              <span className="text-slate-300">{(v as number).toFixed(3)} kN/m</span>
            </div>
          ))}
          <div className="border-t border-amber-700/40 pt-1 flex justify-between text-xs font-mono">
            <span className="text-amber-300 font-bold">w_DL 外桁</span>
            <span className="text-amber-300 font-bold">{extDL.w_total.toFixed(3)} kN/m</span>
          </div>
        </div>

        {/* 内桁（桁数3以上のみ） */}
        {hasInterior && (
          <div className="pt-2 border-t border-slate-700/40">
            <div className="text-xs text-green-400 font-medium mb-1">
              内桁（G2〜G{numGirders - 1}）
              <span className="text-slate-500 ml-1">
                負担幅={local.tributaryWidth}m
              </span>
            </div>
            {[
              ['床版', intDL.w_slab],
              ['舗装', intDL.w_pave],
              ['主桁自重', intDL.w_steel],
              ['高欄', 0],
              ['その他', intDL.w_other],
            ].map(([lbl, v]) => (
              <div key={lbl as string} className="flex justify-between text-xs font-mono pl-2">
                <span className="text-slate-500">{lbl as string}</span>
                <span className={v === 0 ? 'text-slate-600' : 'text-slate-300'}>
                  {(v as number).toFixed(3)} kN/m
                </span>
              </div>
            ))}
            <div className="border-t border-amber-700/40 pt-1 flex justify-between text-xs font-mono">
              <span className="text-green-300 font-bold">w_DL 内桁</span>
              <span className="text-green-300 font-bold">{intDL.w_total.toFixed(3)} kN/m</span>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-600 mt-1">※「計算実行」ボタンで解析に反映されます</p>
      </div>
    </div>
  );
}
