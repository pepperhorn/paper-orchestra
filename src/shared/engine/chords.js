export const CHORD_TYPES = {
  maj:  { label: 'Major',        symbol: 'maj',  intervals: [0, 4, 7] },
  min:  { label: 'Minor',        symbol: 'm',    intervals: [0, 3, 7] },
  maj7: { label: 'Major 7th',    symbol: 'maj7', intervals: [0, 4, 7, 11] },
  dom7: { label: 'Dominant 7th', symbol: '7',    intervals: [0, 4, 7, 10] },
  hdim: { label: 'Half-Dim',     symbol: 'ø7',   intervals: [0, 3, 6, 10] },
  dim:  { label: 'Diminished',   symbol: '°',    intervals: [0, 3, 6, 9] },
  aug:  { label: 'Augmented',    symbol: '+',    intervals: [0, 4, 8] },
  pwr:  { label: 'Power',        symbol: '5',    intervals: [0, 7] },
}

export function buildChordNotes(rootFreq, rootLabel, chordTypeKey, octaveSpread = 1) {
  const ct = CHORD_TYPES[chordTypeKey]
  if (!ct) return []
  const notes = []
  for (let oct = 0; oct < octaveSpread; oct++) {
    for (const interval of ct.intervals) {
      const totalSemis = interval + oct * 12
      const freq = rootFreq * Math.pow(2, totalSemis / 12)
      notes.push({
        id: `${rootLabel}_${chordTypeKey}_${totalSemis}`,
        freq,
        label: `${rootLabel}+${totalSemis}`,
        interval: totalSemis,
      })
    }
  }
  return notes
}

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const CHORD_PATS = [
  { name: 'maj',  i: [0, 4, 7] },
  { name: 'min',  i: [0, 3, 7] },
  { name: 'dim',  i: [0, 3, 6] },
  { name: 'aug',  i: [0, 4, 8] },
  { name: 'sus2', i: [0, 2, 7] },
  { name: 'sus4', i: [0, 5, 7] },
  { name: 'maj7', i: [0, 4, 7, 11] },
  { name: 'min7', i: [0, 3, 7, 10] },
  { name: '7',    i: [0, 4, 7, 10] },
]

export function detectChord(semiSet) {
  const semis = [...semiSet].sort((a, b) => a - b)
  if (semis.length < 2) return null
  for (const root of semis) {
    const norm = semis.map(s => ((s - root) % 12 + 12) % 12).sort((a, b) => a - b)
    for (const pat of CHORD_PATS) {
      if (pat.i.every((iv, i) => norm[i] === iv) && norm.length === pat.i.length) {
        return `${CHROMATIC[root % 12]} ${pat.name}`
      }
    }
  }
  return null
}
