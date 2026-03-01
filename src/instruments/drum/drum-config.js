export const ARUCO_DICT = 'ARUCO_6X6_250'
export const PAD_COUNT = 8
export const STRIKE_COOLDOWN = 150 // ms
export const OCCLUSION_THRESHOLD = 0.5

export const PAD_COLOURS = [
  { name: 'Orange', hue: [10, 30] },
  { name: 'Cyan', hue: [170, 200] },
  { name: 'Magenta', hue: [290, 330] },
  { name: 'Lime', hue: [80, 120] },
  { name: 'Orange', hue: [10, 30] },
  { name: 'Cyan', hue: [170, 200] },
  { name: 'Magenta', hue: [290, 330] },
  { name: 'Lime', hue: [80, 120] },
]

const SOUNDFONT_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite'

export const DEFAULT_SAMPLES = [
  { name: 'Kick', url: `${SOUNDFONT_BASE}/synth_drum-mp3/C2.mp3` },
  { name: 'Snare', url: `${SOUNDFONT_BASE}/synth_drum-mp3/D2.mp3` },
  { name: 'Hi-Hat Closed', url: `${SOUNDFONT_BASE}/synth_drum-mp3/F%232.mp3` },
  { name: 'Hi-Hat Open', url: `${SOUNDFONT_BASE}/synth_drum-mp3/A%232.mp3` },
  { name: 'Clap', url: `${SOUNDFONT_BASE}/synth_drum-mp3/E2.mp3` },
  { name: 'Tom Hi', url: `${SOUNDFONT_BASE}/synth_drum-mp3/C3.mp3` },
  { name: 'Tom Lo', url: `${SOUNDFONT_BASE}/synth_drum-mp3/A2.mp3` },
  { name: 'Rim', url: `${SOUNDFONT_BASE}/synth_drum-mp3/C%232.mp3` },
]
