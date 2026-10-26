/**
 * Shared chemical catalog for model, controls, rendering and exported records.
 *
 * Nominal solution percentages are preparation labels, NOT measured airborne
 * concentrations. New odor strengths are normalized within each chemical to
 * the highest requested preset. Default behavioral valences are editable
 * illustrative assumptions, not empirical dose-response fits.
 */

export type ChemicalId = 'ethyl-acetate' | 'benzaldehyde' | 'co2'
  | '2-phenylethanol' | 'ethanol' | 'acetic-acid' | 'dw' | 'pbs'
export type ConcentrationBasis = 'unspecified' | 'v/v' | 'w/v'

export interface ChemicalSource {
  id: string
  chemical: ChemicalId
  x: number
  y: number
  /** Relative emission multiplier, 0–100; separate from nominal solution %. */
  amount: number
  /** Gaussian diffusion length in virtual arena coordinates. */
  spread: number
  enabled: boolean
  /** Nominal preparation percentage; never interpreted as measured vapor %. */
  solutionConcentration?: number
  /** Metadata only: basis is not converted without a calibrated physical model. */
  concentrationBasis?: ConcentrationBasis
  /** Editable assumed behavioral valence (-1 avoidance, 0 neutral, +1 attraction). */
  responseValence?: number
}

export interface ChemicalDefinition {
  name: string
  english: string
  color: string
  description: string
  valence: number
  isControl: boolean
  /** Upper requested solution-% preset; only a within-chemical model reference. */
  referenceConcentration?: number
}

export const CHEMICALS: Record<ChemicalId, ChemicalDefinition> = {
  'ethyl-acetate': {
    name: '에틸 아세테이트', english: 'Ethyl acetate', color: '#a7dfb1',
    description: '과일 향 · 기존 먹이 유인 모델', valence: 1, isControl: false,
  },
  benzaldehyde: {
    name: '벤즈알데하이드', english: 'Benzaldehyde', color: '#eead78',
    description: '아몬드 향 · 기존 회피 모델', valence: -1, isControl: false,
  },
  co2: {
    name: '이산화탄소', english: 'Carbon dioxide', color: '#90bdf1',
    description: 'CO₂ · 기존 회피 모델', valence: -0.85, isControl: false,
  },
  '2-phenylethanol': {
    name: '2-페닐에탄올', english: '2-Phenylethanol', color: '#e9a7d3',
    description: '명목 용액 농도 · 반응 방향과 강도는 조절 가능한 가정',
    valence: 0.5, isControl: false, referenceConcentration: 0.1,
  },
  ethanol: {
    name: '에탄올', english: 'Ethanol', color: '#95cde8',
    description: '명목 용액 농도 · 실제 농도별 선호 반응은 미보정',
    valence: 0.35, isControl: false, referenceConcentration: 10,
  },
  'acetic-acid': {
    name: '아세트산', english: 'Acetic acid', color: '#e5cf83',
    description: '명목 용액 농도 · 실제 농도별 선호 반응은 미보정',
    valence: 0.4, isControl: false, referenceConcentration: 1,
  },
  dw: {
    name: 'DW', english: 'Distilled water', color: '#b3c2cc',
    description: '증류수 대조군 · 이 모델에서는 후각 입력 없음',
    valence: 0, isControl: true,
  },
  pbs: {
    name: '1× PBS', english: '1× PBS buffer', color: '#a6b9ac',
    description: '1× PBS 완충액 대조군 · 이 모델에서는 후각 입력 없음',
    valence: 0, isControl: true,
  },
}

export interface ChemicalPreset {
  id: string
  chemical: ChemicalId
  label: string
  solutionConcentration?: number
  concentrationBasis?: ConcentrationBasis
}

export const CHEMICAL_PRESETS: ChemicalPreset[] = [
  { id: 'ethyl-acetate', chemical: 'ethyl-acetate', label: '에틸 아세테이트' },
  { id: 'benzaldehyde', chemical: 'benzaldehyde', label: '벤즈알데하이드' },
  { id: 'co2', chemical: 'co2', label: '이산화탄소' },
  ...([0.01, 0.05, 0.1] as const).map((value) => ({
    id: `2-phenylethanol-${value}`, chemical: '2-phenylethanol' as const,
    label: `2-페닐에탄올 ${value}%`, solutionConcentration: value,
    concentrationBasis: 'unspecified' as const,
  })),
  ...([1, 5, 10] as const).map((value) => ({
    id: `ethanol-${value}`, chemical: 'ethanol' as const,
    label: `에탄올 ${value}%`, solutionConcentration: value,
    concentrationBasis: 'unspecified' as const,
  })),
  ...([0.1, 0.5, 1] as const).map((value) => ({
    id: `acetic-acid-${value}`, chemical: 'acetic-acid' as const,
    label: `아세트산 ${value}%`, solutionConcentration: value,
    concentrationBasis: 'unspecified' as const,
  })),
  { id: 'dw', chemical: 'dw', label: 'DW (증류수 대조군)' },
  { id: 'pbs-1x', chemical: 'pbs', label: '1× PBS buffer (대조군)' },
]

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback

/** Normalized model odor strength, never an estimate of headspace concentration. */
export function sourceStrength(source: ChemicalSource): number {
  const chemical = CHEMICALS[source.chemical]
  if (!chemical || chemical.isControl || !source.enabled) return 0
  const amount = clamp(finite(source.amount, 0), 0, 100) / 100
  const reference = chemical.referenceConcentration
  const relativeDose = reference === undefined ? 1
    : clamp(finite(source.solutionConcentration, reference) / reference)
  return amount * relativeDose
}

/** Control containers cannot create taxis even if an imported record has an override. */
export function sourceValence(source: ChemicalSource): number {
  const chemical = CHEMICALS[source.chemical]
  if (!chemical || chemical.isControl) return 0
  return clamp(finite(source.responseValence, chemical.valence), -1, 1)
}

export function sourceLabel(source: ChemicalSource): string {
  const chemical = CHEMICALS[source.chemical]
  if (chemical.referenceConcentration === undefined) return chemical.name
  const dose = Math.max(0, finite(source.solutionConcentration, chemical.referenceConcentration))
  return `${chemical.name} ${dose}%`
}

export function createSourceFromPreset(presetId: string, id: string, x: number, y: number): ChemicalSource {
  const preset = CHEMICAL_PRESETS.find((item) => item.id === presetId)
  if (!preset) throw new Error(`Unknown chemical preset: ${presetId}`)
  const chemical = CHEMICALS[preset.chemical]
  return {
    id, chemical: preset.chemical, x, y, amount: 55, spread: 190, enabled: true,
    ...(preset.solutionConcentration !== undefined ? {
      solutionConcentration: preset.solutionConcentration,
      concentrationBasis: preset.concentrationBasis ?? 'unspecified',
      responseValence: chemical.valence,
    } : {}),
  }
}
