import assert from 'node:assert/strict'
import test from 'node:test'
import { ARENA_HEIGHT, ARENA_WIDTH, concentrationAt, FlySimulation, type ChemicalSource } from '../src/simulation.ts'

const food: ChemicalSource = {
  id: 'food', chemical: 'ethyl-acetate', x: 720, y: 250, amount: 85, spread: 160, enabled: true,
}
const advance = (sim: FlySimulation, seconds: number, sources: ChemicalSource[], fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) sim.step(1 / fps, sources)
}

test('chemical amount and distance determine local concentration; disabled emitters contribute zero', () => {
  assert.equal(concentrationAt({ ...food, amount: 100 }, food.x, food.y), 1)
  assert.equal(concentrationAt({ ...food, amount: 50 }, food.x, food.y), 0.5)
  assert.ok(concentrationAt(food, 650, 250) > concentrationAt(food, 450, 250))
  assert.equal(concentrationAt({ ...food, enabled: false }, food.x, food.y), 0)
  assert.equal(concentrationAt({ ...food, amount: 0 }, food.x, food.y), 0)
})

test('seeded behavior is reproducible and independent of rendering frame rate', () => {
  const a = new FlySimulation(24)
  const b = new FlySimulation(24)
  advance(a, 30, [food], 60)
  advance(b, 30, [food], 30)
  assert.deepEqual(a.state, b.state)
  b.reset(24)
  advance(b, 30, [food], 60)
  assert.deepEqual(a.state, b.state)
})

test('pause and nonpositive/nonfinite deltas do not change state', () => {
  const sim = new FlySimulation()
  const before = structuredClone(sim.state)
  for (const dt of [0, -1, Number.NaN, Infinity]) sim.step(dt, [food])
  assert.deepEqual(sim.state, before)
})

test('sensory input affects movement and displayed neural state', () => {
  const blank = new FlySimulation(8)
  const odor = new FlySimulation(8)
  advance(blank, 8, [])
  advance(odor, 8, [food])
  assert.ok(Math.hypot(blank.state.x - odor.state.x, blank.state.y - odor.state.y) > 20)
  assert.ok(odor.state.activities.AL_L > blank.state.activities.AL_L + 0.05)
  assert.ok(odor.state.exposure > 0)
})

test('odor history changes later search behavior even with the same current stimulus', () => {
  const familiar = new FlySimulation(19)
  const novel = new FlySimulation(19)
  // Hold both animals at the same sensory location while conditioning their
  // short-term history. Neither hunger nor prior displacement can explain the
  // later difference. This is familiarity, not reward-based learned behavior.
  const hold = (sim: FlySimulation, sources: ChemicalSource[]) => {
    sim.state.x = 500
    sim.state.y = 350
    sim.state.angle = -0.65
    sim.state.hunger = 0.72
    sim.step(1 / 60, sources)
  }
  for (let i = 0; i < 900; i++) {
    hold(familiar, [food])
    hold(novel, [])
  }
  // Let fast peripheral sensors settle to identical current input, retaining
  // only the slower circuit history, then release from a matched pose.
  for (let i = 0; i < 120; i++) {
    hold(familiar, [food])
    hold(novel, [food])
  }
  assert.ok(Math.abs(familiar.state.leftSignal - novel.state.leftSignal) < 1e-7)
  assert.ok(Math.abs(familiar.state.activities.MB_L - novel.state.activities.MB_L) > 0.02)
  for (const sim of [familiar, novel]) {
    sim.state.x = 500
    sim.state.y = 350
    sim.state.angle = -0.65
    sim.state.speed = 40
    sim.state.hunger = 0.72
  }
  advance(familiar, 2, [food])
  advance(novel, 2, [food])
  assert.ok(Math.hypot(familiar.state.x - novel.state.x, familiar.state.y - novel.state.y) > 0.2)
})

test('nearby food is approached without direct movement controls', () => {
  const sim = new FlySimulation(42)
  const before = Math.hypot(sim.state.x - food.x, sim.state.y - food.y)
  advance(sim, 8, [food])
  assert.ok(Math.hypot(sim.state.x - food.x, sim.state.y - food.y) < before * 0.65)
  assert.ok(['tracking', 'feeding'].includes(sim.state.behavior))
})

test('aversive odor triggers escape and removal allows sensory activation to decay', () => {
  const sim = new FlySimulation(42)
  const irritant = { ...food, chemical: 'benzaldehyde' as const, x: 600, y: 350 }
  const before = Math.hypot(sim.state.x - irritant.x, sim.state.y - irritant.y)
  advance(sim, 3, [irritant])
  assert.equal(sim.state.behavior, 'avoiding')
  assert.ok(Math.hypot(sim.state.x - irritant.x, sim.state.y - irritant.y) > before)
  assert.ok(sim.state.activities.AL_L > 0.1)
  advance(sim, 5, [])
  assert.equal(sim.state.behavior, 'exploring')
  assert.ok(sim.state.activities.AL_L < 0.001)
  assert.equal(sim.state.concentrations.benzaldehyde, 0)
})

test('long runs keep position, neural activations and internal state finite and bounded', () => {
  const sim = new FlySimulation(987)
  const sources: ChemicalSource[] = [food, { ...food, id: 'risk', chemical: 'co2', x: 180, y: 500, amount: 100, spread: 220 }]
  advance(sim, 300, sources)
  for (const n of [sim.state.x, sim.state.y, sim.state.angle, sim.state.speed, sim.state.distance, sim.state.exposure]) assert.ok(Number.isFinite(n))
  assert.ok(sim.state.x >= 18 && sim.state.x <= ARENA_WIDTH - 18)
  assert.ok(sim.state.y >= 18 && sim.state.y <= ARENA_HEIGHT - 18)
  assert.ok(sim.state.hunger >= 0 && sim.state.hunger <= 1)
  for (const activation of Object.values(sim.state.activities)) assert.ok(activation >= 0 && activation <= 1)
  assert.ok(sim.state.trail.length > 10 && sim.state.trail.length <= 550)
})
