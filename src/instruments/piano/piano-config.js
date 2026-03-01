// Tag ID map — must match piano_template_v3.html
export const TAG = {
  // Position markers — octave 1 (0-6, 8-12)
  C4: 0, D4: 1, E4: 2, F4: 3, G4: 4, A4: 5, B4: 6,
  Cs4: 8, Ds4: 9, Fs4: 10, Gs4: 11, As4: 12,
  // Ribbon (13-22)
  RIB_0: 13, RIB_1: 14, RIB_2: 15, RIB_3: 16, RIB_4: 17,
  RIB_5: 18, RIB_6: 19, RIB_7: 20, RIB_8: 21, RIB_9: 22,
  // Control markers (23-45): ghost detection
  CHORD_MAJ: 23, CHORD_MIN: 24, CHORD_MAJ7: 25, CHORD_DOM7: 26,
  CHORD_HDIM: 27, CHORD_DIM: 28, CHORD_AUG: 29, CHORD_PWR: 30,
  ARP_OFF: 31, ARP_UP: 32, ARP_DOWN: 33, ARP_UPDOWN: 34, ARP_RANDOM: 35,
  RATE_WHOLE: 36, RATE_HALF: 37, RATE_QUARTER: 38, RATE_EIGHTH: 39, RATE_16TH: 40,
  OCT_DOWN: 41, OCT_UP: 42, SUSTAIN: 43,
  MODE_MOD: 44, MODE_VOL: 45,
  // Position markers — octave 2 (46-52, 53-57)
  C5: 46, D5: 47, E5: 48, F5: 49, G5: 50, A5: 51, B5: 52,
  Cs5: 53, Ds5: 54, Fs5: 55, Gs5: 56, As5: 57,
  // Top C (58)
  C6: 58,
}

export const TAG_INV = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, k]))

// Position markers excluded from ghost-marker logic
export const POSITION_TAGS = new Set([
  ...Array.from({ length: 23 }, (_, i) => i),
  ...Array.from({ length: 13 }, (_, i) => 46 + i),
])

export const CHORD_TAG_MAP = {
  [TAG.CHORD_MAJ]: 'maj', [TAG.CHORD_MIN]: 'min', [TAG.CHORD_MAJ7]: 'maj7',
  [TAG.CHORD_DOM7]: 'dom7', [TAG.CHORD_HDIM]: 'hdim', [TAG.CHORD_DIM]: 'dim',
  [TAG.CHORD_AUG]: 'aug', [TAG.CHORD_PWR]: 'pwr',
}

export const ARP_PAT_TAG = {
  [TAG.ARP_OFF]: 'off', [TAG.ARP_UP]: 'up', [TAG.ARP_DOWN]: 'down',
  [TAG.ARP_UPDOWN]: 'updown', [TAG.ARP_RANDOM]: 'random',
}

export const ARP_RATE_TAG = {
  [TAG.RATE_WHOLE]: 'whole', [TAG.RATE_HALF]: 'half', [TAG.RATE_QUARTER]: 'quarter',
  [TAG.RATE_EIGHTH]: 'eighth', [TAG.RATE_16TH]: 'sixteenth',
}

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FREQ_RATIOS = [1, 1.0595, 1.1225, 1.1892, 1.2599, 1.3348, 1.4142, 1.4983, 1.5874, 1.6818, 1.7818, 1.8877]

function buildOctave(oct, tagOct) {
  const base = 261.63 * Math.pow(2, oct - 4)
  const whites = [
    { semi: 0, label: 'C', tkBase: 'C' }, { semi: 2, label: 'D', tkBase: 'D' },
    { semi: 4, label: 'E', tkBase: 'E' }, { semi: 5, label: 'F', tkBase: 'F' },
    { semi: 7, label: 'G', tkBase: 'G' }, { semi: 9, label: 'A', tkBase: 'A' },
    { semi: 11, label: 'B', tkBase: 'B' },
  ].map((k, i) => ({
    id: `${CHROMATIC[k.semi]}${oct}`,
    label: k.label, freq: base * FREQ_RATIOS[k.semi],
    semi: k.semi, tagId: TAG[`${k.tkBase}${tagOct}`], whiteIdx: i,
  }))
  const blacks = [
    { semi: 1, label: 'C#', tkBase: 'Cs', lw: 0 }, { semi: 3, label: 'D#', tkBase: 'Ds', lw: 1 },
    { semi: 6, label: 'F#', tkBase: 'Fs', lw: 3 }, { semi: 8, label: 'G#', tkBase: 'Gs', lw: 4 },
    { semi: 10, label: 'A#', tkBase: 'As', lw: 5 },
  ].map(k => ({
    id: `${CHROMATIC[k.semi]}${oct}`, label: k.label, freq: base * FREQ_RATIOS[k.semi],
    semi: k.semi, tagId: TAG[`${k.tkBase}${tagOct}`], leftWhiteIdx: k.lw, isBlack: true,
  }))
  return { whites, blacks, all: [...whites, ...blacks] }
}

export function buildKeyboard(octave) {
  const oct1 = buildOctave(octave, 4)
  const oct2 = buildOctave(octave + 1, 5)
  oct2.whites.forEach((w, i) => { w.whiteIdx = 7 + i })
  oct2.blacks.forEach(b => { b.leftWhiteIdx += 7 })
  const topC = {
    id: `C${octave + 2}`, label: 'C', freq: 261.63 * Math.pow(2, (octave + 2) - 4),
    semi: 0, tagId: TAG.C6, whiteIdx: 14,
  }
  return {
    whites: [...oct1.whites, ...oct2.whites, topC],
    blacks: [...oct1.blacks, ...oct2.blacks],
    all: [...oct1.all, ...oct2.all, topC],
  }
}

export const PRESS_VEL = 0.35
