import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpRight, Beaker, ChevronDown, CircleHelp, Clock3, Dna, Droplets, Eye, FlaskConical, Focus, Layers3, Leaf, MapPin, Microscope, Pause, Play, Plus, Radio, RotateCcw, Route, Settings2, Sparkles, Trash2, Wind, X } from 'lucide-react';
import { FlySimulation } from './simulation';
import type { ChemicalSource } from './simulation';
import { CHEMICALS, CHEMICAL_PRESETS, createSourceFromPreset, sourceLabel, sourceStrength, sourceValence } from './chemicals';
import type { ChemicalId } from './chemicals';
import BrainMap from './components/BrainMap';
import WorldCanvas from './components/WorldCanvas';

const initialSources = (): ChemicalSource[] => [
  { id: 'source-1', chemical: 'ethyl-acetate', x: 735, y: 225, amount: 72, spread: 220, enabled: true },
  { id: 'source-2', chemical: 'benzaldehyde', x: 245, y: 485, amount: 48, spread: 170, enabled: true },
];
const MAX_SOURCES = 16;
const chemicalIcons: Record<ChemicalId, typeof Leaf> = {
  'ethyl-acetate': Leaf, benzaldehyde: Beaker, co2: Wind,
  '2-phenylethanol': FlaskConical, ethanol: Beaker, 'acetic-acid': FlaskConical,
  dw: Droplets, pbs: Droplets,
};
const responseLabel = (source: ChemicalSource) => CHEMICALS[source.chemical].isControl ? '후각 입력 없는 대조군' : sourceValence(source) > 0 ? '유인 가정' : sourceValence(source) < 0 ? '회피 가정' : '방향 선호 없음';
const behaviors = {
  exploring: { title: '주변을 탐색하는 중', short: '자율 탐색', desc: '감각 신호를 비교하며 새로운 경로를 찾고 있어요.', color: '#c3b5ee' },
  tracking: { title: '유인 냄새를 추적하는 중', short: '냄새 추적', desc: '더듬이가 감지한 농도 변화에 따라 방향을 바꿉니다.', color: '#a7dfb1' },
  avoiding: { title: '불쾌한 자극을 피하는 중', short: '자극 회피', desc: '회피 신호가 이동 방향과 속도를 바꾸고 있어요.', color: '#eead78' },
  feeding: { title: '먹이 근처에 머무르는 중', short: '섭식 행동', desc: '먹이 자극이 충분해 이동을 줄이고 허기를 채웁니다.', color: '#a7dfb1' },
  resting: { title: '잠시 쉬어가는 중', short: '휴식', desc: '내부 에너지 상태에 따라 활동을 조절합니다.', color: '#90bdf1' },
};
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snapshot = (sim: FlySimulation) => ({ ...sim.state, activities: { ...sim.state.activities }, concentrations: { ...sim.state.concentrations }, trail: [...sim.state.trail] });

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.map((v, i) => `${i * 270 / Math.max(1, values.length - 1)},${48 - clamp(v, 0, 1) * 40}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 270 54" preserveAspectRatio="none" aria-label="최근 더듬이 감각 신호 변화" role="img"><path d="M0 14H270M0 34H270M0 53H270" stroke="#ffffff0a" strokeDasharray="3 5"/><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function App() {
  const engine = useRef(new FlySimulation(42));
  const [state, setState] = useState(() => snapshot(engine.current));
  const [sources, setSources] = useState<ChemicalSource[]>(initialSources);
  const [selectedId, setSelectedId] = useState('source-1');
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showField, setShowField] = useState(true);
  const [showTrail, setShowTrail] = useState(true);
  const [newPreset, setNewPreset] = useState('2-phenylethanol-0.01');
  const [history, setHistory] = useState<number[]>(Array(90).fill(0));
  const [events, setEvents] = useState([{ time: 0, behavior: 'exploring' as keyof typeof behaviors }]);
  const [toast, setToast] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const options = useRef({ sources, running, speed });
  options.current = { sources, running, speed };
  const nextId = useRef(3);
  const previousBehavior = useRef(engine.current.state.behavior);

  useEffect(() => {
    let frame = 0, last = 0, rendered = 0, sampled = 0;
    const tick = (now: number) => {
      if (last && options.current.running) {
        engine.current.step(Math.min((now - last) / 1000, 0.06) * options.current.speed, options.current.sources);
      }
      last = now;
      if (now - rendered > 1000 / 30) {
        const current = engine.current.state;
        setState(snapshot(engine.current));
        if (current.behavior !== previousBehavior.current) {
          previousBehavior.current = current.behavior;
          setEvents(prev => [{ time: current.time, behavior: current.behavior }, ...prev].slice(0, 4));
        }
        rendered = now;
      }
      if (options.current.running && now - sampled > 200) {
        setHistory(prev => [...prev.slice(-89), (engine.current.state.activities.AL_L + engine.current.state.activities.AL_R) / 2]);
        sampled = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  const selected = sources.find(s => s.id === selectedId) ?? sources[0];
  const selectedMeta = CHEMICALS[selected.chemical];
  const selectedDoses = CHEMICAL_PRESETS.filter(preset => preset.chemical === selected.chemical && preset.solutionConcentration !== undefined);
  const selectedValence = sourceValence(selected);
  const currentBehavior = behaviors[state.behavior];
  const distance = Math.hypot(selected.x - state.x, selected.y - state.y);
  const updateSource = (patch: Partial<ChemicalSource>) => setSources(prev => prev.map(s => s.id === selected.id ? { ...s, ...patch } : s));
  const moveSource = (id: string, x: number, y: number) => setSources(prev => prev.map(s => s.id === id ? { ...s, x, y } : s));
  const setDistance = (value: number) => {
    const angle = distance > 0.1 ? Math.atan2(selected.y - state.y, selected.x - state.x) : 0;
    updateSource({ x: clamp(state.x + Math.cos(angle) * value, 30, 970), y: clamp(state.y + Math.sin(angle) * value, 30, 670) });
  };
  const addSource = () => {
    if (sources.length >= MAX_SOURCES) return;
    const id = `source-${nextId.current++}`;
    setSources(prev => [...prev, createSourceFromPreset(newPreset, id, 500 + Math.cos(prev.length * 2) * 230, 350 + Math.sin(prev.length * 2) * 200)]);
    setSelectedId(id);
  };
  const removeSelected = () => {
    if (sources.length <= 1) return;
    const remaining = sources.filter(source => source.id !== selected.id);
    setSources(remaining);
    setSelectedId(remaining[0].id);
  };
  const resetFlyState = () => {
    engine.current.reset(42);
    setState(snapshot(engine.current));
    previousBehavior.current = engine.current.state.behavior;
    setHistory(Array(90).fill(0));
    setEvents([{ time: 0, behavior: 'exploring' }]);
  };
  const resetFly = () => {
    resetFlyState();
    setToast('초파리를 중앙으로 초기화했습니다. 화학물질 배치는 유지됩니다.');
  };
  const reset = () => {
    resetFlyState();
    setSources(initialSources());
    setSelectedId('source-1');
    nextId.current = 3;
    setToast('화학물질 배치와 초파리를 모두 초기화했습니다.');
  };
  const exportExperiment = () => {
    const payload = { application: 'Flywire Lab', schemaVersion: 2, exportedAt: new Date().toISOString(), seed: 42, model: 'Phenomenological autonomous behavior; not a whole-brain emulation', anatomy: 'FlyWire female FAFB v783 / annotations v2.0.0', time: state.time, sources, state, events,
      chemicalModel: { concentrationMeaning: 'Nominal solution percent; basis recorded separately. Not calibrated gas-phase concentration.', doseScaling: 'Within each organic chemical, amount/100 multiplied by nominal percent divided by reference percent. Cross-chemical sensitivity is not calibrated.', controls: 'DW and 1x PBS have zero olfactory drive; humidity, taste, pH and contact effects are not modeled.', sources: sources.map(source => ({ id: source.id, label: sourceLabel(source), concentrationBasis: source.concentrationBasis ?? 'unspecified', referenceConcentration: CHEMICALS[source.chemical].referenceConcentration ?? null, relativeStrength: sourceStrength(source), responseValence: sourceValence(source), isControl: CHEMICALS[source.chemical].isControl })) },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `flywire-experiment-${Math.floor(state.time)}s.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('현재 환경과 신경 활동 기록을 저장했습니다.');
  };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="./" aria-label="Flywire Lab 홈"><span className="brand-mark"><Dna size={24}/></span><strong>flywire<span>lab</span><i>β</i></strong></a>
      <div className="header-divider"/><span className="header-context">작은 뇌, 놀라운 세계</span>
      <nav className="header-actions" aria-label="실험 도구"><span className="local-badge"><span/>브라우저에서 실행 중</span><button className="icon-button help-button" aria-label="모델 및 데이터 안내" onClick={() => dialogRef.current?.showModal()}><CircleHelp size={18}/></button><button className="export-button" onClick={exportExperiment}><ArrowDownToLine size={15}/><span>기록 저장</span></button></nav>
    </header>

    <main>
      <section className="page-heading">
        <div><div className="eyebrow"><span/> VIRTUAL NEUROSCIENCE LAB</div><h1>초파리의 작은 세계<span className="title-period">.</span></h1><p>환경을 바꾸고, 감각이 행동으로 이어지는 순간을 관찰하세요.</p></div>
        <button className="specimen-badge" onClick={() => dialogRef.current?.showModal()}><span className="specimen-icon"><Dna size={21}/></span><span><strong>Drosophila melanogaster</strong><small>성체 암컷 <span>·</span> FlyWire v783</small></span><ArrowUpRight size={15}/></button>
      </section>

      <div className="workspace-grid">
        <aside className="environment-panel panel">
          <div className="panel-heading"><div><Settings2 size={16}/><h2>실험 환경</h2></div><span className="section-index">01</span></div>
          <div className="environment-body">
            <div className="label-row"><h3>화학물질</h3><span>{sources.length}개 배치됨</span></div>
            <div className="source-list">{sources.map((source, index) => {
              const meta = CHEMICALS[source.chemical], Icon = chemicalIcons[source.chemical];
              return <div key={source.id} className={`source-row ${source.id === selected.id ? 'is-selected' : ''} ${!source.enabled ? 'is-disabled' : ''}`} style={{ '--source-color': meta.color } as React.CSSProperties}>
                <button className="source-select" onClick={() => setSelectedId(source.id)} aria-pressed={source.id === selected.id}><span className="source-icon"><Icon size={17}/></span><span><strong>{sourceLabel(source)}</strong><small>{responseLabel(source)} <b>·</b> {String.fromCharCode(65 + index)}</small></span></button>
                <button className={`source-switch ${source.enabled ? 'on' : ''}`} role="switch" aria-checked={source.enabled} aria-label={`${String.fromCharCode(65 + index)} ${sourceLabel(source)} 활성화`} onClick={() => setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled: !s.enabled } : s))}><span/></button>
              </div>;
            })}</div>
            <div className="add-source-row"><div className="select-wrap"><select aria-label="추가할 화학물질" value={newPreset} onChange={e => setNewPreset(e.target.value)}>{Object.entries(CHEMICALS).map(([id, meta]) => <optgroup key={id} label={meta.name}>{CHEMICAL_PRESETS.filter(preset => preset.chemical === id).map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>)}</select><ChevronDown size={13}/></div><button className="add-source" onClick={addSource} disabled={sources.length >= MAX_SOURCES} aria-label="화학물질 추가" title={`최대 ${MAX_SOURCES}개까지 추가`}><Plus size={17}/></button></div>
            <p className="preset-hint">용액 농도를 선택한 뒤 +로 배치하세요. 최대 {MAX_SOURCES}개.</p>
            <div className="control-divider"/>
            <div className="selected-label"><span style={{ background: selectedMeta.color }}/><h3>{sourceLabel(selected)}</h3><span className="selected-letter">{String.fromCharCode(65 + sources.findIndex(s => s.id === selected.id))}</span><button className="remove-source icon-button" aria-label="선택한 물질 삭제" title={sources.length <= 1 ? '발생원 하나는 남겨 둡니다. 스위치로 끌 수 있어요.' : '선택한 발생원 삭제'} disabled={sources.length <= 1} onClick={removeSelected}><Trash2 size={13}/></button></div>
            {selectedDoses.length > 0 && <div className="condition-panel">
              <div className="condition-title"><FlaskConical size={13}/><span>용액 조건</span><small>모델 가정</small></div>
              <label className="condition-field" htmlFor="solution-concentration"><span>용액 농도</span><select id="solution-concentration" value={selected.solutionConcentration ?? selectedMeta.referenceConcentration} onChange={e => updateSource({ solutionConcentration: Number(e.target.value) })}>{selectedDoses.map(preset => <option key={preset.id} value={preset.solutionConcentration}>{preset.solutionConcentration}%</option>)}</select></label>
              <label className="condition-field" htmlFor="concentration-basis"><span>% 기준</span><select id="concentration-basis" value={selected.concentrationBasis ?? 'unspecified'} onChange={e => updateSource({ concentrationBasis: e.target.value as ChemicalSource['concentrationBasis'] })}><option value="unspecified">미지정</option><option value="v/v">v/v · 부피비</option><option value="w/v">w/v · 질량/부피</option></select></label>
              <div className="range-control valence-control"><div className="range-label"><label htmlFor="response-valence">가정한 반응</label><span>{selectedValence > 0 ? '유인' : selectedValence < 0 ? '회피' : '중립'} {Math.abs(selectedValence).toFixed(2)}</span></div><input id="response-valence" type="range" min="-1" max="1" step="0.05" value={selectedValence} onChange={e => updateSource({ responseValence: Number(e.target.value) })} style={{ '--range-progress': `${(selectedValence + 1) * 50}%` } as React.CSSProperties}/><div className="range-ends"><span>회피 −1</span><span>중립 0</span><span>유인 +1</span></div></div>
              <p>용액 %는 공기 중 농도가 아닙니다. 반응은 검증되지 않은 가정값이며, % 기준은 기록만 합니다.</p>
            </div>}
            {selectedMeta.isControl && <div className="control-notice"><Droplets size={15}/><p><strong>{sourceLabel(selected)} · 대조군</strong>이 모델에서는 후각 자극이 0입니다. 습도·맛·접촉·pH 효과는 계산하지 않습니다.</p></div>}
            <div className="range-control"><div className="range-label"><label htmlFor="amount">{selectedMeta.isControl ? '배치량 (후각 효과 없음)' : '방출량'}</label><span>{selected.amount}<small> a.u.</small></span></div><input id="amount" type="range" min="0" max="100" step="1" value={selected.amount} onChange={e => updateSource({ amount: Number(e.target.value) })} style={{ '--range-progress': `${selected.amount}%` } as React.CSSProperties}/><div className="range-ends"><span>없음</span><span>높음</span></div></div>
            <div className="range-control"><div className="range-label"><label htmlFor="distance">초파리와의 거리</label><span>{(distance / 10).toFixed(1)}<small> mm</small></span></div><input id="distance" type="range" min="0" max="1100" step="5" value={distance} onChange={e => setDistance(Number(e.target.value))} style={{ '--range-progress': `${distance / 11}%` } as React.CSSProperties}/><div className="range-ends"><span>가까이</span><span>멀리</span></div></div>
            <div className="range-control"><div className="range-label"><label htmlFor="spread">확산 범위</label><span>{(selected.spread / 10).toFixed(0)}<small> mm</small></span></div><input id="spread" type="range" min="60" max="350" step="10" value={selected.spread} onChange={e => updateSource({ spread: Number(e.target.value) })} style={{ '--range-progress': `${(selected.spread - 60) / 2.9}%` } as React.CSSProperties}/><div className="range-ends"><span>좁게</span><span>넓게</span></div></div>
            <div className="position-inputs"><label>X <input aria-label="화학물질 X 위치 (mm)" type="number" min="3" max="97" step="1" value={+(selected.x / 10).toFixed(1)} onChange={e => updateSource({ x: clamp(Number(e.target.value) * 10, 30, 970) })}/></label><label>Y <input aria-label="화학물질 Y 위치 (mm)" type="number" min="3" max="67" step="1" value={+(selected.y / 10).toFixed(1)} onChange={e => updateSource({ y: clamp(Number(e.target.value) * 10, 30, 670) })}/></label><span>mm</span></div>
            <div className="environment-tip"><MapPin size={15}/><p>지도에서 물질을 끌어 위치를 바꿔보세요. 빈 곳을 누르면 선택한 물질이 이동합니다.</p></div>
            <div className="control-divider"/>
            <div className="model-note"><span className="tiny-icon"><Sparkles size={14}/></span><div><strong>초파리는 스스로 움직여요</strong><p>감각, 기억과 허기에 따라<br/>매 순간 행동을 결정합니다.</p></div></div>
          </div>
        </aside>

        <section className="center-column">
          <div className="arena-panel panel">
            <div className="arena-heading"><div className="arena-title"><span className={`status-dot ${running ? 'live' : ''}`}/><h2>관찰 공간</h2><span className="live-tag">{running ? 'LIVE' : 'PAUSED'}</span></div><div className="view-actions"><button className={`icon-button ${showTrail ? 'active' : ''}`} aria-label="이동 경로 표시" aria-pressed={showTrail} onClick={() => setShowTrail(v => !v)} title="이동 경로"><Route size={16}/></button><button className={`icon-button ${showField ? 'active' : ''}`} aria-label="농도 분포 표시" aria-pressed={showField} onClick={() => setShowField(v => !v)} title="농도 분포"><Layers3 size={16}/></button></div></div>
            <div className="arena-viewport"><WorldCanvas state={state} sources={sources} selectedId={selected.id} onSelect={setSelectedId} onMove={moveSource} showField={showField} showTrail={showTrail}/><div className="arena-coordinate"><Focus size={12}/><span>100 × 70 mm</span><span className="arena-coordinate-sep">/</span><span>TOP VIEW</span></div><div className="arena-compass"><span>N</span><div>↑</div></div><div className="arena-subject"><span className="subject-id">F–01</span><span>♀ 성체 초파리</span></div>{!running && <div className="pause-overlay"><Pause size={13}/> 관찰 일시정지</div>}</div>
            <div className="arena-footer"><div className="arena-legend"><span><i className="legend-fly"/>초파리</span><span><i className="legend-field"/>화학물질 농도</span></div><span className="arena-hint">드래그하여 환경 조절</span></div>
            <div className="playback-bar"><button className={`play-button ${running ? '' : 'paused'}`} onClick={() => setRunning(v => !v)} aria-label={running ? '시뮬레이션 일시정지' : '시뮬레이션 재생'}>{running ? <Pause size={15} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}<span>{running ? '일시정지' : '실험 시작'}</span></button><span className="playback-divider"/><div className="clock"><Clock3 size={14}/><span data-testid="simulation-time">{formatTime(state.time)}</span></div><div className="speed-controls" aria-label="시뮬레이션 속도">{[0.5, 1, 2, 4].map(value => <button key={value} className={speed === value ? 'selected' : ''} onClick={() => setSpeed(value)} aria-pressed={speed === value}>{value}×</button>)}</div></div>
            <div className="reset-actions">
              <button className="fly-reset-button" onClick={resetFly} aria-label="초파리만 초기화" title="물질 배치는 유지하고 초파리 위치·기억·허기·시간·활동 기록을 초기화합니다."><Focus size={14}/><span>초파리만 초기화</span></button>
              <span className="reset-hint">화학물질 배치 유지</span>
              <button className="full-reset-button" onClick={reset} aria-label="실험 초기화" title="화학물질 배치까지 처음 상태로 되돌립니다."><RotateCcw size={13}/><span>전체 초기화</span></button>
            </div>
          </div>
          <div className="behavior-panel panel"><div className="behavior-icon" style={{ color: currentBehavior.color }}><Radio size={22}/><span/></div><div className="behavior-copy"><div className="behavior-eyebrow">현재 행동 <span>AUTONOMOUS</span></div><h3>{currentBehavior.title}</h3><p>{currentBehavior.desc}</p></div><div className="behavior-meter"><Activity size={19}/><span>감각 → 행동</span></div></div>
          <div className="experiment-footnote"><Microscope size={13}/><span>관찰해 보세요: 먹이의 방출량을 높이거나, 회피 물질을 이동 경로에 놓아보세요.</span></div>
        </section>

        <aside className="right-column">
          <section className="readout-panel panel"><div className="panel-heading"><div><Activity size={16}/><h2>실시간 관측</h2></div><span className="section-index">02</span></div><div className="readout-body"><div className="readout-grid"><div><span>이동 속도</span><strong>{(state.speed / 10).toFixed(1)}<small> mm/s</small></strong></div><div><span>내부 허기</span><strong>{Math.round(state.hunger * 100)}<small> %</small></strong><div className="hunger-bar"><i style={{ width: `${state.hunger * 100}%` }}/></div></div></div><div className="signal-heading"><span><span/>더듬이 감각 신호</span><strong>{Math.round((state.activities.AL_L + state.activities.AL_R) * 50)}<small> %</small></strong></div><Sparkline values={history} color="#baabe9"/><div className="signal-axis"><span>18초 전</span><span>현재</span></div><div className="antenna-readings"><span>L <i><b style={{ width: `${clamp(state.activities.AL_L * 100, 0, 100)}%` }}/></i></span><span>R <i><b style={{ width: `${clamp(state.activities.AL_R * 100, 0, 100)}%` }}/></i></span></div></div></section>
          <BrainMap activities={state.activities} paused={!running}/>
          <section className="event-panel panel"><div className="event-heading"><span><Clock3 size={13}/>행동 기록</span><span>{events.length} EVENTS</span></div><div className="event-list">{events.slice(0, 3).map((event, i) => <div className="event-row" key={`${event.time}-${i}`}><time>{formatTime(event.time)}</time><i style={{ background: behaviors[event.behavior].color }}/><span>{behaviors[event.behavior].short}</span>{i === 0 && <small>현재</small>}</div>)}</div></section>
        </aside>
      </div>

      <footer className="page-footer"><span><span className="footer-dot"/> 실제 해부학 데이터, 탐구를 위한 시뮬레이션</span><button onClick={() => dialogRef.current?.showModal()}>데이터와 모델 알아보기 <ArrowUpRight size={13}/></button><span className="footer-version">FLYWIRE LAB <b>/</b> EXPERIMENT 001</span></footer>
    </main>
    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    <dialog ref={dialogRef} className="info-dialog" onClick={e => { if (e.target === e.currentTarget) dialogRef.current?.close(); }}><button className="dialog-close icon-button" aria-label="안내 닫기" onClick={() => dialogRef.current?.close()}><X size={20}/></button><div className="dialog-icon"><Dna size={28}/></div><div className="eyebrow">THE SCIENCE BEHIND THE SIMULATION</div><h2>작은 뇌를 들여다보는 방법</h2><p>실제 암컷 초파리 뇌의 해부학 정보와 단순화한 감각·행동 모델을 연결한 가상 실험실입니다.</p><div className="info-section"><h3><Eye size={17}/> 실제 데이터</h3><p>FlyWire의 성체 암컷 FAFB 뇌 지도(v783)와 공개 뉴런 주석(v2.0.0)을 사용합니다. 뇌 지도의 점은 실제 뉴런 위치를 표본 추출해 투영한 것입니다. 전체 주석 데이터는 139,255개 뉴런을 포함합니다.</p></div><div className="info-section"><h3><Activity size={17}/> 모델로 계산하는 것</h3><p>양쪽 더듬이의 농도 감지 → 후각 처리 → 허기·습관화·짧은 감각 기억 → 방향 및 속도 결정이 연속적으로 일어납니다. 위치를 아는 목표 추적 명령이나 사용자 조종 없이 감각 신호로 이동합니다. 화학물질은 거리별 가우시안 농도장으로 근사하며 방출량은 상대 단위(a.u.)입니다. 공간의 mm는 가상 환산 척도입니다.</p><p>영역별 활성도와 연결선은 설명을 위한 모델 출력이며, 측정된 신경 발화나 실제 시냅스 가중치가 아닙니다. 전뇌 시뮬레이션, 의식, 실제 사고의 재현을 의미하지 않습니다. 각 물질의 유인·회피 성향도 이 모델의 가정입니다. 2-페닐에탄올·에탄올·아세트산의 반응 방향과 강도는 화면에서 바꿀 수 있습니다.</p></div><div className="info-section"><h3><Droplets size={17}/> 용액 농도와 대조군</h3><p>2-페닐에탄올 0.01·0.05·0.1%, 에탄올 1·5·10%, 아세트산 0.1·0.5·1%, DW, 1× PBS를 제공합니다. %는 명목 용액 농도입니다. 부피비(v/v)인지 질량/부피(w/v)인지는 처음에 미지정이며, 선택해 기록할 수 있지만 서로 환산하지 않습니다. 1× PBS는 완충액 배수이며 1%가 아닙니다.</p><p>용액 농도는 각 물질의 최대 기본 농도(0.1%, 10%, 1%)에 대한 상대 자극 배율로 사용합니다. 실제 휘발성·온도·용매·습도·수용체 민감도는 보정하지 않았으므로 물질 간 실제 반응 세기를 비교하는 실험 예측값이 아닙니다. DW와 PBS는 후각 입력이 없는 대조군으로 처리하고 물질 표시는 유지합니다. 세 용액에 접근해도 영양 섭취로 처리하지 않습니다.</p></div><div className="info-section"><h3><FlaskConical size={17}/> 간단한 실험</h3><ol><li>초록색 먹이 자극의 방출량을 바꾸며 추적 행동을 관찰하세요.</li><li>주황색 회피 물질을 초파리 가까이 이동해 보세요.</li><li>물질을 모두 끄면 외부 자극 없이 주변을 탐색합니다.</li></ol></div><a className="source-link" href="https://github.com/flyconnectome/flywire_annotations/tree/v2.0.0" target="_blank" rel="noreferrer">FlyWire 원본 데이터 및 출처 <ArrowUpRight size={15}/></a><a className="source-link" href="/data/flywire-brain.json" target="_blank" rel="noreferrer">이 앱의 해부학 표본 데이터 <ArrowUpRight size={15}/></a></dialog>
  </div>;
}
