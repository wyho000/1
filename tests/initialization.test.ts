import assert from 'node:assert/strict'
import test from 'node:test'
import { FlySimulation, type ChemicalSource } from '../src/simulation.ts'

const symmetricAttractants: ChemicalSource[] = [250, 750].map((x, index) => ({
  id: `attractant-${index}`, chemical: 'ethyl-acetate', x, y: 350,
  amount: 85, spread: 160, enabled: true,
}))

const advance = (sim: FlySimulation, seconds: number, fps = 60) => {
  for (let frame = 0; frame < seconds * fps; frame++) sim.step(1 / fps, symmetricAttractants)
}

test('trial headings cover all directions instead of always facing right', () => {
  const quadrants = [0, 0, 0, 0]
  for (let seed = 0; seed < 256; seed++) {
    const sim = new FlySimulation(seed)
    const angle = sim.state.angle
    assert.ok(angle >= -Math.PI && angle < Math.PI)
    assert.equal(sim.state.x, 500)
    assert.equal(sim.state.y, 350)
    quadrants[Math.floor((angle + Math.PI) / (Math.PI / 2))]++
  }
  // A deterministic seed set gives a stable regression check without requiring
  // exactly equal counts or forcing a particular side in any individual trial.
  for (const count of quadrants) assert.ok(count >= 40 && count <= 88, String(quadrants))
})

test('equal bilateral attractants produce both left and right approaches across trials', () => {
  let left = 0
  let right = 0
  for (let seed = 0; seed < 128; seed++) {
    const sim = new FlySimulation(seed)
    advance(sim, 10)
    // Require movement beyond the center region, not just the first subpixel
    // displacement. The old fixed-heading model chose right in all 128 trials.
    if (sim.state.x < 475) left++
    if (sim.state.x > 525) right++
  }
  assert.ok(left >= 45 && right >= 45, `Left: ${left}; right: ${right}`)
  assert.ok(left + right >= 115, `Too many trials remained at the center: ${128 - left - right}`)
})

test('recorded initial conditions survive movement and replay after changing the trial seed', () => {
  const sim = new FlySimulation(18)
  const originalConditions = sim.initialConditions
  assert.equal(originalConditions.angle, sim.state.angle)
  advance(sim, 3)
  assert.deepEqual(sim.initialConditions, originalConditions)

  sim.reset(987)
  const replay = new FlySimulation(987)
  assert.deepEqual(sim.initialConditions, replay.initialConditions)
  assert.equal(sim.initialConditions.seed, 987)
  assert.notEqual(sim.initialConditions.angle, originalConditions.angle)
  assert.deepEqual(sim.state, replay.state)

  advance(sim, 5)
  advance(replay, 5, 30)
  assert.deepEqual(sim.state, replay.state)
  sim.reset()
  assert.deepEqual(sim.state, new FlySimulation(987).state)
})
