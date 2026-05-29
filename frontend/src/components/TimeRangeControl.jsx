
import { useState, useRef, useId, useCallback } from 'react';

// Paradas predefinidas para el slider (1h, 3h, 6h, 12h, 24h, 2d, 7d, 30d)
const STOPS = [
  { label: '1h',  ms: 1  * 60 * 60 * 1000,      name: 'Última hora'      },
  { label: '3h',  ms: 3  * 60 * 60 * 1000,      name: 'Últimas 3 h'      },
  { label: '6h',  ms: 6  * 60 * 60 * 1000,      name: 'Últimas 6 h'      },
  { label: '12h', ms: 12 * 60 * 60 * 1000,      name: 'Últimas 12 h'     },
  { label: '24h', ms: 24 * 60 * 60 * 1000,      name: 'Último día'       },
  { label: '2d',  ms: 2  * 24 * 60 * 60 * 1000, name: 'Últimos 2 días'   },
  { label: '7d',  ms: 7  * 24 * 60 * 60 * 1000, name: 'Últimos 7 días'   },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000, name: 'Último mes'       },
];
const DEFAULT_STOP = 4; // 24h
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const toDisplayDate = d => d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function getDatesFromStop(idx) {
  const end   = new Date();
  const start = new Date(end.getTime() - STOPS[idx].ms);
  return [start, end];
}

export default function TimeRangeControl({ onFetchFiltered, loading }) {
  const sliderId    = useId();
  const debounceRef = useRef(null);
  const [stopIdx, setStopIdx] = useState(DEFAULT_STOP);
  const [pendingIdx, setPendingIdx] = useState(DEFAULT_STOP);
  const [start, end] = getDatesFromStop(pendingIdx);
  const pct = (pendingIdx / (STOPS.length - 1)) * 100;
  const sliderBg = `linear-gradient(to right, #0c8ecc ${pct}%, rgba(26,58,92,0.8) ${pct}%)`;

  const handleSliderChange = useCallback((ev) => {
    const idx = Number(ev.target.value);
    setPendingIdx(idx);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setStopIdx(idx);
      const [s, e] = getDatesFromStop(idx);
      onFetchFiltered(fmt(s), fmt(e));
    }, 400);
  }, [onFetchFiltered]);

  return (
    <div className="flex items-center gap-2">
      <input
        id={sliderId}
        type="range"
        min={0}
        max={STOPS.length - 1}
        step={1}
        value={pendingIdx}
        onChange={handleSliderChange}
        disabled={loading}
        aria-label="Rango de tiempo relativo"
        aria-valuemin={0}
        aria-valuemax={STOPS.length - 1}
        aria-valuenow={pendingIdx}
        aria-valuetext={STOPS[pendingIdx].name}
        className="w-32 h-1.5 rounded-full appearance-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
        style={{ background: sliderBg, minWidth: 80, maxWidth: 120 }}
      />
      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
        {toDisplayDate(start)} <span className="text-navy-400">→</span> ahora
      </span>
    </div>
  );
}
