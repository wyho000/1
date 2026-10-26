/**
 * Sensory-driven agent in a 2-D chemical field.
 *
 * This is a phenomenological circuit-level model, NOT a simulation of individual
 * FlyWire neurons or fitted connectomic synaptic weights. The accompanying brain
 * map uses independently attributed female FlyWire anatomical data. AL/LH/MB/CX/DN
 * activities below are model state variables, not measured neural recordings.
 * Steering sees only two antenna samples, a temporal trace, and arena walls; it
 * never reads a chemical source's direction or chooses a goal position.
 */

import { CHEMICALS, sourceStrength, sourceValence } from './chemicals.ts'
import type { ChemicalId, ChemicalSource } from './chemicals.ts'
export { CHEMICALS } from './chemicals.ts'
export type { ChemicalId, ChemicalSource } from './chemicals.ts'

export const ARENA_WIDTH = 1000
export const ARENA_HEIGHT = 700

export type Behavior = 'exploring' | 'tracking' | 'feeding' | 'avoiding' | 'resting'
export type RegionId = 'AL_L' | 'AL_R' | 'LH_L' | 'LH_R' | 'MB_L' | 'MB_R' | 'CX' | 'DN'

export const BEHAVIOR_LABELS: Record<Behavior, string> = {
  exploring: '주변 탐색', tracking: '유인 자극 추적', feeding: '먹이 섭취',
  avoiding: '위험 회피', resting: '휴식',
}

export interface FlyState {
  x: number
  y: number
  angle: number
  speed: number
  time: number
  hunger: number
  behavior: Behavior
  /** Normalized local model fields, not physical vapor percentages. */
  concentrations: Record<ChemicalId, number>
  /** Antennal valence signals, normalized to -1…1. */
  leftSignal: number
  rightSignal: number
  activities: Record<RegionId, number>
  trail: { x: number; y: number }[]
  distance: number
  exposure: number
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n))
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback
const TAU = Math.PI * 2
const FIXED_STEP = 1 / 60
const chemicalIds = Object.keys(CHEMICALS) as ChemicalId[]
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const mix = (a: number, b: number, dt: number, tau: number) => a + (b - a) * (1 - Math.exp(-dt / tau))

/** Relative local odor field; zero for disabled/empty emitters and control liquids. */
export function concentrationAt(source: ChemicalSource, x: number, y: number): number {
  const strength = sourceStrength(source)
  if (strength === 0) return 0
  const sigma = clamp(finite(source.spread, 140), 20, 500)
  const dx = finite(x) - finite(source.x, 500)
  const dy = finite(y) - finite(source.y, 350)
  return strength * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
}

function emptyConcentrations(): Record<ChemicalId, number> {
  return Object.fromEntries(chemicalIds.map((id) => [id, 0])) as Record<ChemicalId, number>
}

export function concentrationsAt(sources: ChemicalSource[], x: number, y: number): Record<ChemicalId, number> {
  const result = emptyConcentrations()
  for (const source of sources) {
    if (CHEMICALS[source.chemical]) result[source.chemical] += concentrationAt(source, x, y)
  }
  for (const id of chemicalIds) result[id] = clamp(result[id], 0, 2)
  return result
}

interface OdorSample {
  concentrations: Record<ChemicalId, number>
  attraction: number
  aversion: number
  aversiveSignal: number
  sensory: number
}

/** Resolve each source's assumed valence before combining same-chemical sources. */
function odorSampleAt(sources: ChemicalSource[], x: number, y: number): OdorSample {
  const sample: OdorSample = {
    concentrations: emptyConcentrations(), attraction: 0, aversion: 0, aversiveSignal: 0, sensory: 0,
  }
  for (const source of sources) {
    const field = concentrationAt(source, x, y)
    if (field === 0) continue
    const assumedValence = sourceValence(source)
    sample.concentrations[source.chemical] += field
    sample.attraction += field * Math.max(0, assumedValence)
    sample.aversion += field * Math.max(0, -assumedValence)
    // Retain the legacy CO2 response gain; new settings are explicitly model assumptions.
    const avoidanceGain = source.chemical === 'co2' ? 1.15 / 0.85 : 1.4
    sample.aversiveSignal += field * Math.max(0, -assumedValence) * avoidanceGain
    sample.sensory += field
  }
  for (const id of chemicalIds) sample.concentrations[id] = clamp(sample.concentrations[id], 0, 2)
  sample.attraction = clamp(sample.attraction, 0, 2)
  sample.aversion = clamp(sample.aversion, 0, 2)
  sample.sensory = clamp(sample.sensory)
  return sample
}

function initialState(): FlyState {
  return {
    x: 500, y: 350, angle: -0.65, speed: 30, time: 0, hunger: 0.72,
    behavior: 'exploring',
    concentrations: emptyConcentrations(),
    leftSignal: 0, rightSignal: 0,
    activities: { AL_L: 0.02, AL_R: 0.02, LH_L: 0.01, LH_R: 0.01, MB_L: 0.02, MB_R: 0.02, CX: 0.1, DN: 0.15 },
    trail: [{ x: 500, y: 350 }], distance: 0, exposure: 0,
  }
}

export class FlySimulation {
  public state: FlyState = initialState()
  private seed: number
  private rng: number
  private accumulator = 0
  private wander = 0
  private memory = 0
  private previousValence = 0
  private cxSteering = 0
  private turnBias = 1
  private trailClock = 0

  constructor(seed = 42) {
    this.seed = seed >>> 0
    this.rng = this.seed
  }

  reset(seed = this.seed): void {
    this.seed = seed >>> 0
    this.rng = this.seed
    this.state = initialState()
    this.accumulator = 0
    this.wander = 0
    this.memory = 0
    this.previousValence = 0
    this.cxSteering = 0
    this.turnBias = 1
    this.trailClock = 0
  }

  private random(): number {
    this.rng += 0x6D2B79F5
    let t = this.rng
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Use seconds. A fixed internal step makes results independent of render FPS. */
  step(dt: number, sources: ChemicalSource[]): void {
    if (!Number.isFinite(dt) || dt <= 0) return
    // Clamp background-tab gaps to avoid teleportation on resume.
    this.accumulator += Math.min(dt, 0.25)
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.integrate(FIXED_STEP, sources)
      this.accumulator -= FIXED_STEP
    }
  }

  private integrate(dt: number, sources: ChemicalSource[]): void {
    const s = this.state
    const forwardX = Math.cos(s.angle)
    const forwardY = Math.sin(s.angle)
    const antennaX = s.x + forwardX * 14
    const antennaY = s.y + forwardY * 14
    const left = odorSampleAt(sources, antennaX + forwardY * 10, antennaY - forwardX * 10)
    const right = odorSampleAt(sources, antennaX - forwardY * 10, antennaY + forwardX * 10)
    const body = odorSampleAt(sources, s.x, s.y)
    s.concentrations = body.concentrations
    // Only the original food proxy replenishes energy. Being attracted to an
    // uncalibrated experimental odor does not mean that it is a food source.
    const food = s.concentrations['ethyl-acetate']
    const aversion = body.aversion
    const foodDrive = 0.35 + s.hunger * 0.9
    // Smooth saturation preserves a bilateral gradient in strong odors; a hard
    // clip would blind both antennae at high concentration and defeat avoidance.
    const valence = (sample: OdorSample) => Math.tanh(sample.attraction * foodDrive - sample.aversiveSignal)
    const leftValue = valence(left)
    const rightValue = valence(right)
    s.leftSignal = mix(s.leftSignal, leftValue, dt, 0.1)
    s.rightSignal = mix(s.rightSignal, rightValue, dt, 0.1)

    const meanValence = (s.leftSignal + s.rightSignal) / 2
    const temporalChange = (meanValence - this.previousValence) / dt
    this.previousValence = meanValence
    this.memory = mix(this.memory, meanValence, dt, 5)
    const novelty = Math.abs(meanValence - this.memory)
    const risk = clamp(aversion * 1.6)
    const a = s.activities

    // Antennal lobes: local sensory drive. LH: innate odor relevance. MB:
    // short-lived familiarity/novelty trace (not associative conditioning).
    a.AL_L = mix(a.AL_L, left.sensory, dt, 0.12)
    a.AL_R = mix(a.AL_R, right.sensory, dt, 0.12)
    a.LH_L = mix(a.LH_L, clamp(Math.abs(s.leftSignal) * 1.05 + risk * 0.25), dt, 0.2)
    a.LH_R = mix(a.LH_R, clamp(Math.abs(s.rightSignal) * 1.05 + risk * 0.25), dt, 0.2)
    a.MB_L = mix(a.MB_L, clamp(novelty * 1.5 + a.AL_L * 0.18), dt, 0.7)
    a.MB_R = mix(a.MB_R, clamp(novelty * 1.5 + a.AL_R * 0.18), dt, 0.7)

    if (risk > 0.19) s.behavior = 'avoiding'
    else if (food > 0.68 && s.hunger > 0.13) s.behavior = 'feeding'
    else if (s.hunger < 0.14 && food > 0.4) s.behavior = 'resting'
    else if (body.attraction * foodDrive > 0.075) s.behavior = 'tracking'
    else s.behavior = 'exploring'

    s.hunger = clamp(s.hunger + (s.behavior === 'feeding' ? -0.027 * food : 0.0015) * dt)

    // Correlated exploratory noise gives spontaneous runs and turns. A local
    // temporal decline increases turning; no emitter coordinate is consulted.
    this.wander += -this.wander * 1.3 * dt + (this.random() - 0.5) * Math.sqrt(dt) * 1.8
    if (this.random() < dt * 0.3) this.turnBias = this.random() < 0.5 ? -1 : 1
    const bilateral = (s.rightSignal - s.leftSignal) * 24
    const worsening = clamp(-temporalChange * 6, 0, 1)
    const noiseGain = s.behavior === 'exploring' ? 1.5 : s.behavior === 'feeding' ? 0.22 : 0.45
    // MB novelty increases active sampling of unfamiliar sensory conditions.
    // A remembered, stable appetitive cue mildly habituates orientation gain.
    // These are phenomenological short-term adaptation terms, not learned
    // synaptic plasticity, and aversive orientation is not habituated away.
    const mbNovelty = (a.MB_L + a.MB_R) / 2
    const familiarity = meanValence > 0 ? clamp(this.memory - novelty) : 0
    const adaptedBilateral = bilateral * (1 - familiarity * 0.22)
    const turnDirection = Math.abs(bilateral) > 0.015 ? Math.sign(bilateral) : this.turnBias
    const sensoryTurn = adaptedBilateral
      + this.wander * noiseGain * (0.7 + mbNovelty * 1.5)
      + turnDirection * worsening * (1.2 + mbNovelty * 0.7)

    // Visual/tactile arena-wall response, independent from chemosensation.
    const margin = 100
    const wallX = clamp((margin - s.x) / margin) - clamp((s.x - (ARENA_WIDTH - margin)) / margin)
    const wallY = clamp((margin - s.y) / margin) - clamp((s.y - (ARENA_HEIGHT - margin)) / margin)
    const wallMagnitude = Math.hypot(wallX, wallY)
    const wallTurn = wallMagnitude > 0 ? wrap(Math.atan2(wallY, wallX) - s.angle) * wallMagnitude * 6 : 0
    const turn = clamp(sensoryTurn + wallTurn, -3.6, 3.6)
    // Signed central-complex steering is the causal intermediate between
    // sensory/MB processing and the heading command. The map shows its size.
    this.cxSteering = mix(this.cxSteering, turn, dt, 0.14)
    a.CX = clamp(0.08 + Math.abs(this.cxSteering) / 3.9)

    const targetSpeed: Record<Behavior, number> = {
      exploring: 31, tracking: 40 + s.hunger * 5,
      feeding: 3.5, avoiding: 58 + risk * 12, resting: 1.8,
    }
    a.DN = mix(a.DN, clamp(targetSpeed[s.behavior] / 75), dt, 0.18)
    // Descending motor drive directly determines speed; CX/sensory turn
    // contributes to heading. Displayed activities are the same model state.
    s.speed = mix(s.speed, a.DN * 75, dt, 0.16)
    s.angle = wrap(s.angle + this.cxSteering * dt)
    const oldX = s.x
    const oldY = s.y
    s.x += Math.cos(s.angle) * s.speed * dt
    s.y += Math.sin(s.angle) * s.speed * dt
    // Emergency collision resolution keeps the rendered body within the arena.
    if (s.x < 18 || s.x > ARENA_WIDTH - 18) {
      s.x = clamp(s.x, 18, ARENA_WIDTH - 18)
      s.angle = wrap(Math.PI - s.angle)
    }
    if (s.y < 18 || s.y > ARENA_HEIGHT - 18) {
      s.y = clamp(s.y, 18, ARENA_HEIGHT - 18)
      s.angle = wrap(-s.angle)
    }
    s.distance += Math.hypot(s.x - oldX, s.y - oldY)
    s.exposure += Object.values(s.concentrations).reduce((sum, value) => sum + value, 0) * dt
    s.time += dt
    this.trailClock += dt
    if (this.trailClock >= 0.12) {
      s.trail.push({ x: s.x, y: s.y })
      if (s.trail.length > 550) s.trail.shift()
      this.trailClock = 0
    }
    // Keep heading bounded even over long unattended sessions.
    if (Math.abs(s.angle) > TAU) s.angle = wrap(s.angle)
  }
}
