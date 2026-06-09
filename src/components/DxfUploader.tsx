import { useCallback, useState } from 'react';
import type { GrillageModel } from '../types/bridge';
import { parseDxfToModel, validateDxf } from '../lib/dxfParser';

interface Props {
  onModelLoaded: (model: GrillageModel) => void;
}

export function DxfUploader({ onModelLoaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setErrors(['DXFファイル（.dxf）を選択してください']);
      setStatus('error');
      return;
    }
    setErrors([]);
    setWarnings([]);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        // Validate first
        const validationErrors = validateDxf(content);
        if (validationErrors.some(e => !e.includes('無視'))) {
          setErrors(validationErrors);
          setStatus('error');
          return;
        }
        setWarnings(validationErrors);  // non-fatal warnings

        const model = parseDxfToModel(content);
        setStatus('ok');
        onModelLoaded(model);
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
        setStatus('error');
      }
    };
    reader.onerror = () => {
      setErrors(['ファイル読み込みに失敗しました']);
      setStatus('error');
    };
    reader.readAsText(file, 'utf-8');
  }, [onModelLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';  // allow re-upload same file
  }, [processFile]);

  return (
    <div className="space-y-2">
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all
          ${dragging ? 'border-blue-400 bg-blue-900/20' : ''}
          ${status === 'ok' ? 'border-green-600 bg-green-900/10' : ''}
          ${status === 'error' ? 'border-red-600 bg-red-900/10' : ''}
          ${status === 'idle' && !dragging ? 'border-slate-600 bg-slate-800/50 hover:border-blue-500' : ''}`}
      >
        <input type="file" accept=".dxf" className="hidden" onChange={handleChange} />
        <div className="text-2xl">
          {status === 'ok' ? '✅' : status === 'error' ? '❌' : '📐'}
        </div>
        {fileName ? (
          <p className={`text-xs mt-1 font-medium ${status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {fileName}
          </p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">DXFをドロップ or クリック</p>
        )}
      </label>

      {warnings.length > 0 && (
        <div className="text-xs text-amber-400 bg-amber-900/20 rounded p-2 space-y-0.5">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {errors.length > 0 && (
        <div className="text-xs text-red-400 bg-red-900/20 rounded p-2 space-y-0.5">
          {errors.map((e, i) => <div key={i}>✗ {e}</div>)}
        </div>
      )}

      <div className="text-xs text-slate-600 space-y-0.5">
        <div>レイヤー: BEAM_MAIN/GIRDER → 縦桁</div>
        <div>レイヤー: CROSS_BEAM/FLOOR → 横桁</div>
        <div>始点=J端, 終点=i端</div>
      </div>
    </div>
  );
}
