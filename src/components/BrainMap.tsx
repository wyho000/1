import { useEffect, useId, useMemo, useState } from 'react';
import './BrainMap.css';

type BrainMapProps = {
  activities: Record<string, number>;
  paused?: boolean;
};

type BrainData = {
  groups: { id: string; count: number; label: string }[];
  points: [number, number, number, number, number][];
  projection: { units: string; axes: string[]; bounds: [number, number][] };
};

type Region = {
  id: string;
  short: string;
  name: string;
  role: string;
  x: number;
  y: number;
  radius: number;
  color: string;
};

const regions: Region[] = [
  { id: 'AL_L', short: 'AL', name: '왼쪽 더듬이엽', role: '왼쪽 더듬이의 화학 신호를 처리합니다.', x: 120, y: 144, radius: 14, color: '#5be6b5' },
  { id: 'AL_R', short: 'AL', name: '오른쪽 더듬이엽', role: '오른쪽 더듬이의 화학 신호를 처리합니다.', x: 200, y: 144, radius: 14, color: '#5be6b5' },
  { id: 'LH_L', short: 'LH', name: '왼쪽 측각', role: '냄새의 유인·회피 반응을 형성합니다.', x: 93, y: 87, radius: 10, color: '#f1bd72' },
  { id: 'LH_R', short: 'LH', name: '오른쪽 측각', role: '냄새의 유인·회피 반응을 형성합니다.', x: 227, y: 87, radius: 10, color: '#f1bd72' },
  { id: 'MB_L', short: 'MB', name: '왼쪽 버섯체', role: '최근 냄새 경험과 감각 적응을 반영합니다.', x: 131, y: 81, radius: 12, color: '#ae94f5' },
  { id: 'MB_R', short: 'MB', name: '오른쪽 버섯체', role: '최근 냄새 경험과 감각 적응을 반영합니다.', x: 189, y: 81, radius: 12, color: '#ae94f5' },
  { id: 'CX', short: 'CX', name: '중앙복합체', role: '감각과 내부 상태를 통합해 방향을 결정합니다.', x: 160, y: 117, radius: 10, color: '#7dc9f3' },
  { id: 'DN', short: 'DN', name: '하행 신경 경로', role: '행동 결정을 회전과 이동으로 전달합니다.', x: 160, y: 173, radius: 9, color: '#ed9aab' },
];

const pathways = [
  ['AL_L', 'LH_L'], ['AL_R', 'LH_R'], ['AL_L', 'MB_L'], ['AL_R', 'MB_R'],
  ['MB_L', 'CX'], ['MB_R', 'CX'], ['LH_L', 'CX'], ['LH_R', 'CX'], ['CX', 'DN'],
];

function activity(value: number | undefined) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value! : 0));
}

export default function BrainMap({ activities, paused = false }: BrainMapProps) {
  const uniqueId = useId().replace(/:/g, '');
  const [selected, setSelected] = useState('CX');
  const [hovered, setHovered] = useState<string | null>(null);
  const [data, setData] = useState<BrainData | null>(null);
  const [dataError, setDataError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(new URL('data/flywire-brain.json', document.baseURI), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Brain map unavailable'); return response.json() as Promise<BrainData>; })
      .then(setData)
      .catch((error: Error) => { if (error.name !== 'AbortError') setDataError(true); });
    return () => controller.abort();
  }, []);
  const cloud = useMemo(() => {
    if (!data) return null;
    const [xb, yb] = data.projection.bounds;
    const width = xb[1] - xb[0];
    const height = yb[1] - yb[0];
    const scale = Math.min(270 / width, 164 / height);
    const paths: Record<string, { d: string; color: string; totalX: number; totalY: number; count: number }> = {};
    for (const [x, y, , groupIndex, side] of data.points) {
      const group = data.groups[groupIndex].id;
      const id = ['AL', 'LH', 'MB'].includes(group) ? `${group}_${side === 0 ? 'L' : side === 1 ? 'R' : 'C'}` : group;
      const px = 160 + (x - (xb[0] + xb[1]) / 2) * scale;
      const py = 108 + (y - (yb[0] + yb[1]) / 2) * scale;
      const region = regions.find((item) => item.id === id);
      const points = paths[id] ?? { d: '', color: region?.color ?? '#6a9c96', totalX: 0, totalY: 0, count: 0 };
      points.d += `M${px.toFixed(1)} ${py.toFixed(1)}h.01`;
      points.totalX += px;
      points.totalY += py;
      points.count += 1;
      paths[id] = points;
    }
    return paths;
  }, [data]);
  const mapRegions = useMemo(() => regions.map((region) => {
    const group = cloud?.[region.id];
    return group?.count ? { ...region, x: group.totalX / group.count, y: group.totalY / group.count, radius: 8 } : region;
  }), [cloud]);
  const activeRegion = regions.find((region) => region.id === (hovered ?? selected)) ?? regions[6];
  const selectedActivity = activity(activities[activeRegion.id]);
  const maximum = regions.reduce((best, region) => activity(activities[region.id]) > activity(activities[best.id]) ? region : best, regions[0]);
  const groups = [
    { label: '감각', color: '#5be6b5', value: (activity(activities.AL_L) + activity(activities.AL_R)) / 2 },
    { label: '기억', color: '#ae94f5', value: (activity(activities.MB_L) + activity(activities.MB_R)) / 2 },
    { label: '방향', color: '#7dc9f3', value: activity(activities.CX) },
    { label: '운동', color: '#ed9aab', value: activity(activities.DN) },
  ];

  return (
    <section className={`brain-panel${paused ? ' brain-paused' : ''}`} aria-label="초파리 뇌 영역별 모의 활성 지도">
      <div className="brain-header">
        <div>
          <div className="brain-eyebrow">NEURAL ACTIVITY</div>
          <h2>암컷 초파리 뇌 지도 <span className="brain-help" title="공개 FlyWire v783 암컷 뇌 데이터의 실제 뉴런 위치를 투영했습니다. 영역 표시는 해당 뉴런군의 중심점이며 연결선과 활성도는 단순화한 회로 모델의 출력입니다.">i</span></h2>
        </div>
        <span className={`brain-live${paused ? ' brain-live-paused' : ''}`}><i />{paused ? 'PAUSED' : 'LIVE'}</span>
      </div>

      <div className="brain-map-wrap">
        <div className="brain-map-caption"><span>♀ FLYWIRE · v783</span><span>{data ? `${data.points.length.toLocaleString()}개 표본 뉴런` : dataError ? '지도 데이터 로드 실패' : '지도 데이터 불러오는 중'}</span></div>
        <svg className="brain-map" viewBox="0 0 320 214" aria-label="양측 더듬이엽, 측각, 버섯체, 중앙복합체와 하행 신경 경로 지도">
          <defs>
            <filter id={`${uniqueId}-glow`} x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="4"/></filter>
          </defs>

          <path d="M160 26V200M17 113H303" stroke="#adcfd2" strokeOpacity=".055" strokeDasharray="2 5" />
          <path d="M13 28H23M18 23V33M297 28H307M302 23V33M13 189H23M18 184V194M297 189H307M302 184V194" stroke="#527077" strokeWidth=".7" />
          <text x="22" y="115" className="brain-direction">L</text><text x="294" y="115" className="brain-direction">R</text>

          {cloud && Object.entries(cloud).map(([id, group]) => <path key={id} d={group.d} stroke={group.color} strokeWidth={id === 'OTHER' ? .8 : 1.15} strokeLinecap="round" fill="none" opacity={id === 'OTHER' ? .32 : .35 + activity(activities[id]) * .55} />)}
          {!data && <text x="160" y="110" textAnchor="middle" fill="#71868c" fontSize="10">{dataError ? '실제 위치 데이터를 불러올 수 없습니다' : 'FlyWire 뉴런 위치 불러오는 중…'}</text>}

          {data && pathways.map(([from, to]) => {
            const start = mapRegions.find((region) => region.id === from)!;
            const end = mapRegions.find((region) => region.id === to)!;
            const strength = (activity(activities[from]) + activity(activities[to])) / 2;
            const curveX = (start.x + end.x) / 2 + (start.x < 160 ? -12 : 12);
            const d = `M${start.x} ${start.y}Q${curveX} ${(start.y + end.y) / 2} ${end.x} ${end.y}`;
            return <g key={`${from}-${to}`}><path d={d} stroke={start.color} strokeOpacity={.09 + strength * .26} strokeWidth="1.1" fill="none" /><path className="brain-signal-path" d={d} stroke={start.color} strokeOpacity={strength * .75} strokeWidth="1.5" strokeDasharray="2 15" fill="none" style={{ animationDuration: `${2.6 - strength * 1.5}s` }} /></g>;
          })}

          {data && mapRegions.map((region) => {
            const level = activity(activities[region.id]);
            const focused = activeRegion.id === region.id;
            return (
              <g key={region.id} className="brain-region" role="button" tabIndex={0} aria-label={`${region.name}: ${Math.round(level * 100)}퍼센트`} aria-pressed={selected === region.id} onMouseEnter={() => setHovered(region.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(region.id)} onBlur={() => setHovered(null)} onClick={() => setSelected(region.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(region.id); } }}>
                <circle cx={region.x} cy={region.y} r={region.radius + 7} fill={region.color} opacity={.03 + level * .34} filter={`url(#${uniqueId}-glow)`} />
                <circle cx={region.x} cy={region.y} r={region.radius + 5} fill="transparent" stroke={focused ? region.color : 'transparent'} strokeOpacity=".5" strokeDasharray="2 3" />
                <ellipse cx={region.x} cy={region.y} rx={region.radius} ry={region.radius * .75} fill={region.color} fillOpacity={.08 + level * .48} stroke={region.color} strokeOpacity={.22 + level * .7} strokeWidth=".9" />
                <circle cx={region.x - 2} cy={region.y - 1} r={1.3 + level * 1.5} fill={region.color} opacity={.35 + level * .65} />
                <text x={region.x} y={region.y + (region.id.startsWith('MB') || region.id.startsWith('LH') ? -17 : region.id === 'DN' ? 20 : 25)} className="brain-region-label" fill={focused ? region.color : '#82989e'}>{region.short}</text>
                <circle cx={region.x} cy={region.y} r={region.radius + 8} fill="transparent" />
              </g>
            );
          })}
        </svg>
        <div className="brain-map-scale"><span>낮음</span><span className="brain-scale-track" /><span>높음</span><span className="brain-scale-unit">상대 활성도</span></div>
      </div>

      <div className="brain-selected" style={{ borderLeftColor: activeRegion.color }}>
        <div className="brain-selected-top"><span>{activeRegion.name}<small>{activeRegion.short}</small></span><strong style={{ color: activeRegion.color }}>{Math.round(selectedActivity * 100)}<small>%</small></strong></div>
        <p>{activeRegion.role}</p>
      </div>
      <div className="brain-meters">
        {groups.map((group) => <div className="brain-meter" key={group.label}><div><span>{group.label}</span><span>{Math.round(group.value * 100)}</span></div><span className="brain-meter-track"><span style={{ width: `${group.value * 100}%`, background: group.color }} /></span></div>)}
      </div>
      <div className="brain-footnote"><span className="brain-most-active-dot" style={{ background: maximum.color }} /><span>실제 뉴런 좌표 · 활성도는 모델값</span><strong>{maximum.short}{maximum.id.endsWith('_L') ? ' · L' : maximum.id.endsWith('_R') ? ' · R' : ''}</strong></div>
    </section>
  );
}
