import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ChemicalSource } from '../simulation';
import { CHEMICALS, sourceLabel, sourceStrength } from '../chemicals';

export interface WorldState {
  x: number;
  y: number;
  angle: number;
  time: number;
  trail: Array<{ x: number; y: number }>;
  behavior: string;
  leftSignal: number;
  rightSignal: number;
}

interface WorldCanvasProps {
  state: WorldState;
  sources: ChemicalSource[];
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  showField: boolean;
  showTrail: boolean;
}

const WIDTH = 1000;
const HEIGHT = 700;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function sourceColor(source: ChemicalSource) {
  const hex = CHEMICALS[source.chemical].color;
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(', ');
  return { hex, rgb };
}

function frame(width: number, height: number) {
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  return { scale, x: (width - WIDTH * scale) / 2, y: (height - HEIGHT * scale) / 2 };
}

function drawField(ctx: CanvasRenderingContext2D, source: ChemicalSource) {
  // Use the engine's dimensionless source amplitude. Nominal solution percent
  // is not a measured vapor concentration; DW/PBS have zero olfactory input.
  const strength = sourceStrength(source);
  if (strength <= 0) return;
  const color = sourceColor(source);
  const radius = Math.max(25, source.spread) * 2.4;
  const gradient = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, radius);
  gradient.addColorStop(0, `rgba(${color.rgb}, ${0.20 * strength})`);
  gradient.addColorStop(0.23, `rgba(${color.rgb}, ${0.13 * strength})`);
  gradient.addColorStop(0.5, `rgba(${color.rgb}, ${0.055 * strength})`);
  gradient.addColorStop(0.77, `rgba(${color.rgb}, ${0.015 * strength})`);
  gradient.addColorStop(1, `rgba(${color.rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(source.x - radius, source.y - radius, radius * 2, radius * 2);

  ctx.save();
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 8]);
  for (let ring = 1; ring <= 3; ring += 1) {
    ctx.strokeStyle = `rgba(${color.rgb}, ${(0.14 - ring * 0.025) * strength})`;
    ctx.beginPath();
    ctx.arc(source.x, source.y, Math.max(24, source.spread) * ring * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSource(ctx: CanvasRenderingContext2D, source: ChemicalSource, index: number, selected: boolean, time: number) {
  const color = sourceColor(source);
  const strength = sourceStrength(source);
  const isControl = CHEMICALS[source.chemical].isControl;
  const pulse = 0.5 + Math.sin(time * 1.7 + index) * 0.5;
  ctx.save();
  ctx.translate(source.x, source.y);
  ctx.globalAlpha = source.enabled ? 1 : 0.38;

  if (strength > 0) {
    const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, 44);
    halo.addColorStop(0, `rgba(${color.rgb}, ${0.18 * strength})`);
    halo.addColorStop(1, `rgba(${color.rgb}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${color.rgb}, ${(0.08 + (1 - pulse) * 0.12) * strength})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + pulse * 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#142027';
  ctx.strokeStyle = `rgba(${color.rgb}, ${selected ? 0.85 : 0.48})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(${color.rgb}, 0.12)`;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();

  // A small vial identifies a manipulable chemical emitter.
  ctx.strokeStyle = color.hex;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.lineTo(4, -8);
  ctx.moveTo(-2.5, -8);
  ctx.lineTo(-2.5, -2);
  ctx.lineTo(-7, 6);
  ctx.quadraticCurveTo(-8, 9, -4, 9);
  ctx.lineTo(4, 9);
  ctx.quadraticCurveTo(8, 9, 7, 6);
  ctx.lineTo(2.5, -2);
  ctx.lineTo(2.5, -8);
  ctx.moveTo(-5, 3);
  ctx.lineTo(5, 3);
  ctx.stroke();

  if (selected) {
    ctx.strokeStyle = color.hex;
    ctx.lineWidth = 1.2;
    const gap = 23;
    for (let corner = 0; corner < 4; corner += 1) {
      ctx.save();
      ctx.rotate((Math.PI / 2) * corner);
      ctx.beginPath();
      ctx.moveTo(gap - 6, -gap);
      ctx.lineTo(gap, -gap);
      ctx.lineTo(gap, -gap + 6);
      ctx.stroke();
      ctx.restore();
    }
  }

  const label = `${String.fromCharCode(65 + index)}  ${sourceLabel(source)}${isControl ? ' · 대조군' : ''}`;
  ctx.font = '500 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelWidth = ctx.measureText(label).width + 22;
  const labelX = clamp(source.x, labelWidth / 2 + 25, WIDTH - labelWidth / 2 - 25) - source.x;
  const labelY = source.y > HEIGHT - 100 ? -62 : 35;
  ctx.fillStyle = 'rgba(15, 22, 26, 0.86)';
  ctx.beginPath();
  ctx.roundRect(labelX - labelWidth / 2, labelY, labelWidth, 27, 6);
  ctx.fill();
  ctx.fillStyle = color.hex;
  ctx.fillText(label, labelX, labelY + 14);
  ctx.restore();
}

function drawFly(ctx: CanvasRenderingContext2D, state: WorldState) {
  ctx.save();
  ctx.translate(state.x, state.y);

  // Sensory range hint, independent of body orientation.
  ctx.strokeStyle = 'rgba(207, 191, 255, 0.16)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(state.angle);

  const walking = state.behavior !== 'feeding' && state.behavior !== 'resting';
  const stride = walking ? Math.sin(state.time * 25) * 3.2 : Math.sin(state.time * 2) * 0.5;
  const wingBeat = walking ? Math.sin(state.time * 30) * 0.05 : 0;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.beginPath();
  ctx.ellipse(-3, 3, 26, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Six articulated legs.
  ctx.strokeStyle = '#a49c8c';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let leg = 0; leg < 3; leg += 1) {
      const attachX = 7 - leg * 7;
      const phase = stride * (leg === 1 ? -1 : 1) * side;
      ctx.beginPath();
      ctx.moveTo(attachX, side * 3);
      ctx.lineTo(attachX + 1 + phase, side * (12 + leg));
      ctx.lineTo(attachX + (leg === 0 ? 8 : -8) + phase, side * (20 - leg));
      ctx.stroke();
    }
  }

  // Translucent paired wings, with fine veins.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(1, side * 3);
    ctx.rotate(side * (0.35 + wingBeat));
    const wing = ctx.createLinearGradient(-32, 0, 5, 0);
    wing.addColorStop(0, 'rgba(201, 216, 218, 0.16)');
    wing.addColorStop(0.5, 'rgba(218, 230, 231, 0.47)');
    wing.addColorStop(1, 'rgba(202, 216, 221, 0.67)');
    ctx.fillStyle = wing;
    ctx.strokeStyle = 'rgba(220, 231, 230, 0.64)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.ellipse(-15, side * 6, 21, 8, side * -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(159, 185, 189, 0.60)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(-15, side * 3, -34, side * 8);
    ctx.moveTo(-6, side * 2);
    ctx.lineTo(-23, side * 12);
    ctx.moveTo(-15, side * 5);
    ctx.lineTo(-28, side * 1);
    ctx.stroke();
    ctx.restore();
  }

  // Banded abdomen, thorax and the red eyes of D. melanogaster.
  const body = ctx.createLinearGradient(0, -7, 0, 7);
  body.addColorStop(0, '#beac86');
  body.addColorStop(0.5, '#9b8863');
  body.addColorStop(1, '#5b5544');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-12, 0, 14, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#4e493d';
  ctx.lineWidth = 2.2;
  for (let band = -22; band < -3; band += 5.5) {
    ctx.beginPath();
    ctx.moveTo(band, -8);
    ctx.quadraticCurveTo(band + 4, 0, band, 8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#96886c';
  ctx.beginPath();
  ctx.ellipse(2, 0, 9.2, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b6a587';
  ctx.beginPath();
  ctx.ellipse(11.5, 0, 5.7, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#bc766b';
    ctx.beginPath();
    ctx.ellipse(12, side * 4.4, 3.5, 2.7, side * -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c7bb9f';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(15.5, side * 2);
    ctx.lineTo(23, side * 5);
    ctx.lineTo(26, side * 8);
    ctx.stroke();
    const signal = side < 0 ? state.leftSignal : state.rightSignal;
    ctx.fillStyle = `rgba(205, 187, 255, ${0.3 + clamp(Math.abs(signal), 0, 1) * 0.7})`;
    ctx.beginPath();
    ctx.arc(27, side * 8, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.font = '500 10px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(207, 197, 229, 0.75)';
  ctx.fillText('D. MELANOGASTER ♀', state.x, state.y - 49);
  ctx.restore();
}

function drawArena(ctx: CanvasRenderingContext2D, width: number, height: number, props: WorldCanvasProps) {
  const bounds = frame(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#11181c';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(bounds.x, bounds.y);
  ctx.scale(bounds.scale, bounds.scale);
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, HEIGHT);
  ctx.clip();

  const ambient = ctx.createRadialGradient(480, 300, 50, 500, 350, 650);
  ambient.addColorStop(0, '#172126');
  ambient.addColorStop(1, '#10171b');
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(145, 170, 179, 0.065)';
  ctx.beginPath();
  for (let x = 0; x <= WIDTH; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); }
  for (let y = 0; y <= HEIGHT; y += 50) { ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(145, 170, 179, 0.14)';
  for (let x = 50; x < WIDTH; x += 100) {
    for (let y = 50; y < HEIGHT; y += 100) ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
  }

  if (props.showField) props.sources.forEach((source) => drawField(ctx, source));

  // Arena edges and scale markings quietly establish the physical space.
  ctx.strokeStyle = 'rgba(144, 169, 177, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);
  ctx.strokeStyle = 'rgba(144, 169, 177, 0.2)';
  ctx.beginPath();
  for (let x = 50; x < WIDTH; x += 50) {
    const length = x % 100 === 0 ? 6 : 3;
    ctx.moveTo(x, 20); ctx.lineTo(x, 20 + length);
    ctx.moveTo(x, HEIGHT - 20); ctx.lineTo(x, HEIGHT - 20 - length);
  }
  for (let y = 50; y < HEIGHT; y += 50) {
    const length = y % 100 === 0 ? 6 : 3;
    ctx.moveTo(20, y); ctx.lineTo(20 + length, y);
    ctx.moveTo(WIDTH - 20, y); ctx.lineTo(WIDTH - 20 - length, y);
  }
  ctx.stroke();

  if (props.showTrail && props.state.trail.length > 1) {
    const trail = props.state.trail;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i += 1) {
      ctx.strokeStyle = `rgba(195, 178, 239, ${0.04 + (i / trail.length) * 0.34})`;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    for (let i = 0; i < trail.length; i += 12) {
      ctx.fillStyle = `rgba(206, 190, 246, ${0.12 + (i / trail.length) * 0.32})`;
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  props.sources.forEach((source, index) => drawSource(ctx, source, index, source.id === props.selectedId, props.state.time));
  drawFly(ctx, props.state);

  ctx.fillStyle = 'rgba(166, 184, 190, 0.65)';
  ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('10 mm', WIDTH - 100, HEIGHT - 52);
  ctx.beginPath();
  ctx.moveTo(WIDTH - 150, HEIGHT - 45);
  ctx.lineTo(WIDTH - 150, HEIGHT - 38);
  ctx.lineTo(WIDTH - 50, HEIGHT - 38);
  ctx.lineTo(WIDTH - 50, HEIGHT - 45);
  ctx.strokeStyle = 'rgba(166, 184, 190, 0.5)';
  ctx.stroke();
  ctx.restore();
}

export default function WorldCanvas(props: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeSource = useRef<string | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(size.width * ratio);
    const targetHeight = Math.round(size.height * ratio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawArena(context, size.width, size.height, props);
  }, [props, size]);

  function worldPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const bounds = frame(rect.width, rect.height);
    return {
      x: (event.clientX - rect.left - bounds.x) / bounds.scale,
      y: (event.clientY - rect.top - bounds.y) / bounds.scale,
    };
  }

  function move(id: string, point: { x: number; y: number }) {
    props.onMove(id, clamp(point.x, 30, WIDTH - 30), clamp(point.y, 30, HEIGHT - 30));
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const point = worldPoint(event);
    if (point.x < 0 || point.x > WIDTH || point.y < 0 || point.y > HEIGHT) return;
    const source = [...props.sources].reverse().find((item) => Math.hypot(item.x - point.x, item.y - point.y) < 37);
    const id = source?.id ?? props.selectedId;
    if (!id || !props.sources.some((item) => item.id === id)) return;
    activeSource.current = id;
    props.onSelect(id);
    if (!source) move(id, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activeSource.current) move(activeSource.current, worldPoint(event));
  }

  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    activeSource.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="자율 행동 초파리 실험장. 화학물질 원을 드래그하거나 빈 곳을 눌러 선택한 물질의 위치를 변경할 수 있습니다. 키보드로는 왼쪽 물질 설정의 거리와 위치 조절을 사용하세요."
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onLostPointerCapture={() => { activeSource.current = null; }}
      style={{ display: 'block', width: '100%', height: '100%', aspectRatio: '10 / 7', touchAction: 'none', cursor: 'crosshair' }}
    >
      초파리는 감각과 내부 상태에 따라 스스로 움직입니다. 물질 설정에서 화학물질 양과 위치를 조절하세요.
    </canvas>
  );
}
