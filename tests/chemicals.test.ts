import assert from 'node:assert/strict'
import test from 'node:test'
import { CHEMICAL_PRESETS, createSourceFromPreset, sourceLabel, sourceStrength, sourceValence } from '../src/chemicals.ts'
import { concentrationAt, FlySimulation } from '../src/simulation.ts'
import type { ChemicalSource } from '../src/chemicals.ts'

const advance = (sim: FlySimulation, seconds: number, sources: ChemicalSource[]) => {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, sources)
}
const source = (preset: string) => createSourceFromPreset(preset, preset, 720, 250)

test('all eleven requested conditions preserve exact nominal dose and control identity', () => {
  const expected = [
    ['2-phenylethanol-0.01', 0.01], ['2-phenylethanol-0.05', 0.05], ['2-phenylethanol-0.1', 0.1],
    ['ethanol-1', 1], ['ethanol-5', 5], ['ethanol-10', 10],
    ['acetic-acid-0.1', 0.1], ['acetic-acid-0.5', 0.5], ['acetic-acid-1', 1],
    ['dw', undefined], ['pbs-1x', undefined],
  ] as const
  assert.equal(CHEMICAL_PRESETS.length, 14)
  assert.equal(new Set(CHEMICAL_PRESETS.map(preset => preset.id)).size, 14)
  for (const [id, dose] of expected) {
    const item = source(id)
    assert.equal(item.solutionConcentration, dose)
    if (dose !== undefined) {
      assert.equal(item.concentrationBasis, 'unspecified')
      assert.ok(sourceLabel(item).endsWith(`${dose}%`))
    }
  }
  assert.equal(sourceLabel(source('pbs-1x')), '1× PBS')
  assert.throws(() => source('unknown-condition'))
})

test('nominal dose and relative amount independently affect local fields within a chemical', () => {
  for (const ids of [
    ['2-phenylethanol-0.01', '2-phenylethanol-0.05', '2-phenylethanol-0.1'],
    ['ethanol-1', 'ethanol-5', 'ethanol-10'],
    ['acetic-acid-0.1', 'acetic-acid-0.5', 'acetic-acid-1'],
  ]) {
    const items = ids.map(source)
    const fields = items.map(item => concentrationAt(item, item.x, item.y))
    assert.ok(fields[0] < fields[1] && fields[1] < fields[2])
    assert.ok(Math.abs(fields[0] / fields[2] - 0.1) < 1e-10)
    assert.ok(Math.abs(fields[1] / fields[2] - 0.5) < 1e-10)
    const maximum = items[2]
    assert.equal(sourceStrength({ ...maximum, amount: maximum.amount / 2 }), sourceStrength(maximum) / 2)
    assert.equal(concentrationAt({ ...maximum, amount: 0 }, maximum.x, maximum.y), 0)
    assert.equal(concentrationAt({ ...maximum, enabled: false }, maximum.x, maximum.y), 0)
    assert.ok(concentrationAt(maximum, maximum.x + 50, maximum.y) > concentrationAt(maximum, maximum.x + 250, maximum.y))
    assert.equal(sourceStrength({ ...maximum, concentrationBasis: 'w/v' }), sourceStrength({ ...maximum, concentrationBasis: 'v/v' }))
  }
})

test('DW and 1x PBS add no olfactory or behavioral effects even with overrides', () => {
  const controls = ['dw', 'pbs-1x'].map(id => ({ ...source(id), amount: 100, responseValence: 1, solutionConcentration: 100 }))
  for (const control of controls) {
    assert.equal(sourceStrength(control), 0)
    assert.equal(sourceValence(control), 0)
    assert.equal(concentrationAt(control, control.x, control.y), 0)
  }
  const blank = new FlySimulation(52)
  const withControls = new FlySimulation(52)
  advance(blank, 20, [])
  advance(withControls, 20, controls)
  assert.deepEqual(withControls.state, blank.state)
})

test('higher nominal dose activates stronger sensory activity at an identical held position', () => {
  const low = new FlySimulation(12)
  const high = new FlySimulation(12)
  for (let i = 0; i < 120; i++) {
    for (const sim of [low, high]) { sim.state.x = 500; sim.state.y = 350; sim.state.angle = -0.65 }
    low.step(1 / 60, [source('ethanol-1')])
    high.step(1 / 60, [source('ethanol-10')])
  }
  assert.ok(high.state.activities.AL_L > low.state.activities.AL_L * 5)
})

test('changing an assumed response reverses approach versus avoidance without changing the physical field', () => {
  const attractive = { ...source('ethanol-10'), x: 650, y: 300, amount: 100, responseValence: 1 }
  const aversive = { ...attractive, responseValence: -1 }
  assert.equal(sourceStrength(attractive), sourceStrength(aversive))
  const approach = new FlySimulation(42)
  const escape = new FlySimulation(42)
  const initialDistance = Math.hypot(approach.state.x - attractive.x, approach.state.y - attractive.y)
  advance(approach, 3, [attractive])
  advance(escape, 3, [aversive])
  assert.ok(Math.hypot(approach.state.x - attractive.x, approach.state.y - attractive.y) < initialDistance)
  assert.ok(Math.hypot(escape.state.x - aversive.x, escape.state.y - aversive.y) > initialDistance)
  assert.equal(escape.state.behavior, 'avoiding')
})

test('opposite response assumptions remain per source even for the same chemical', () => {
  const attractive = { ...source('ethanol-10'), amount: 100, responseValence: 1, x: 500, y: 350 }
  const neutral = { ...attractive, responseValence: 0 }
  const aversive = { ...attractive, id: 'second', responseValence: -1 }
  const mixed = new FlySimulation(9)
  const positive = new FlySimulation(9)
  const none = new FlySimulation(9)
  advance(mixed, 0.5, [attractive, aversive])
  advance(positive, 0.5, [attractive, neutral])
  advance(none, 0.5, [neutral, neutral])
  assert.equal(mixed.state.behavior, 'avoiding')
  assert.equal(positive.state.behavior, 'tracking')
  assert.equal(none.state.behavior, 'exploring')
  assert.ok(none.state.activities.AL_L > 0.5)
})

test('new attractive organic odors never replenish hunger as though they were food', () => {
  for (const id of ['2-phenylethanol-0.1', 'ethanol-10', 'acetic-acid-1']) {
    const sim = new FlySimulation(42)
    const initialHunger = sim.state.hunger
    const item = { ...source(id), x: 500, y: 350, amount: 100, spread: 500, responseValence: 1 }
    for (let i = 0; i < 600; i++) {
      sim.step(1 / 60, [item])
      assert.notEqual(sim.state.behavior, 'feeding')
    }
    assert.ok(sim.state.hunger >= initialHunger)
  }
})

test('mixed requested conditions remain finite and serializable throughout an extended run', () => {
  const sources = CHEMICAL_PRESETS.map((preset, i) => ({
    ...source(preset.id), id: `source-${i}`, x: 100 + (i % 5) * 180, y: 100 + (i % 3) * 230,
  }))
  const sim = new FlySimulation(42)
  advance(sim, 180, sources)
  for (const value of [sim.state.x, sim.state.y, sim.state.speed, sim.state.exposure, ...Object.values(sim.state.activities), ...Object.values(sim.state.concentrations)]) assert.ok(Number.isFinite(value))
  for (const value of Object.values(sim.state.activities)) assert.ok(value >= 0 && value <= 1)
  const restored = JSON.parse(JSON.stringify(sources))
  assert.deepEqual(restored, sources)
})
