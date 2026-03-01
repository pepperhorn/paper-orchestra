// Whistle: 6 holes, top-to-bottom = index 0 to 5
// Each entry: holes = [0/1 x 6] (1 = covered), note name, frequency
export const WHISTLE_NOTES = [
  { holes: [0, 0, 0, 0, 0, 0], note: 'D5',  freq: 587.33, label: 'D5 (all open)' },
  { holes: [0, 0, 0, 0, 0, 1], note: 'C#5', freq: 554.37, label: 'C#5' },
  { holes: [0, 0, 0, 0, 1, 1], note: 'B4',  freq: 493.88, label: 'B4' },
  { holes: [0, 0, 0, 1, 1, 1], note: 'A4',  freq: 440.00, label: 'A4' },
  { holes: [0, 0, 1, 1, 1, 1], note: 'G4',  freq: 392.00, label: 'G4' },
  { holes: [0, 1, 1, 1, 1, 1], note: 'F#4', freq: 369.99, label: 'F#4' },
  { holes: [1, 1, 1, 1, 1, 1], note: 'E4',  freq: 329.63, label: 'E4 (all closed)' },
  { holes: [0, 1, 1, 1, 1, 0], note: 'D4',  freq: 293.66, label: 'D4 (cross)' },
]

// Trumpet: 3 valves, left-to-right
// partial = harmonic series selection (higher partial = higher register)
export const TRUMPET_NOTES = [
  { v: [0, 0, 0], note: 'C4',  freq: 261.63, label: 'C4 (open)' },
  { v: [0, 1, 0], note: 'B3',  freq: 246.94, label: 'B3' },
  { v: [1, 0, 0], note: 'Bb3', freq: 233.08, label: 'Bb3' },
  { v: [1, 1, 0], note: 'A3',  freq: 220.00, label: 'A3' },
  { v: [0, 1, 1], note: 'Ab3', freq: 207.65, label: 'Ab3' },
  { v: [1, 0, 1], note: 'G3',  freq: 196.00, label: 'G3' },
  { v: [1, 1, 1], note: 'F#3', freq: 185.00, label: 'F#3' },
]

// Partial multipliers for trumpet registers
export const PARTIAL_THRESHOLDS = [
  { min: 0.0, max: 0.3, partial: 1 },  // fundamental
  { min: 0.3, max: 0.6, partial: 2 },  // octave
  { min: 0.6, max: 1.0, partial: 3 },  // 12th
]

// Z-depth thresholds for whistle hole detection
export const WHISTLE_HOVER_T = 0.03
export const WHISTLE_PRESS_T = 0.06
