// ─── chordEngine.js ──────────────────────────────────────────────────────────
// Given a root frequency and chord type, returns all frequencies in the chord.
// Also handles arpeggio note ordering across multiple octave spreads.

export const CHORD_TYPES = {
  maj:   { label: 'Major',       symbol: 'maj',  intervals: [0, 4, 7] },
  min:   { label: 'Minor',       symbol: 'm',    intervals: [0, 3, 7] },
  maj7:  { label: 'Major 7th',   symbol: 'maj7', intervals: [0, 4, 7, 11] },
  dom7:  { label: 'Dominant 7th',symbol: '7',    intervals: [0, 4, 7, 10] },
  hdim:  { label: 'Half-Dim',    symbol: 'ø7',   intervals: [0, 3, 6, 10] },
  dim:   { label: 'Diminished',  symbol: '°',    intervals: [0, 3, 6, 9] },
  aug:   { label: 'Augmented',   symbol: '+',    intervals: [0, 4, 8] },
  pwr:   { label: 'Power',       symbol: '5',    intervals: [0, 7] },
};

/**
 * Given a root frequency and chord type key, return array of {id, freq, label}.
 * octaveSpread: how many octaves to expand into for arp (1 or 2)
 */
export function buildChordNotes(rootFreq, rootLabel, chordTypeKey, octaveSpread = 1) {
  const ct = CHORD_TYPES[chordTypeKey];
  if (!ct) return [];
  const notes = [];
  for (let oct = 0; oct < octaveSpread; oct++) {
    for (const interval of ct.intervals) {
      const totalSemis = interval + oct * 12;
      const freq = rootFreq * Math.pow(2, totalSemis / 12);
      notes.push({
        id: `${rootLabel}_${chordTypeKey}_${totalSemis}`,
        freq,
        label: `${rootLabel}+${totalSemis}`,
        interval: totalSemis,
      });
    }
  }
  return notes;
}

// ─── arpEngine.js ─────────────────────────────────────────────────────────────
// Clock-compensated arpeggio sequencer using Web Audio API currentTime.
// Accurate to within a few milliseconds even on old hardware.

export const ARP_PATTERNS = {
  off:    { label: 'Off',    fn: (notes) => [] },
  up:     { label: '▲ Up',   fn: (notes) => [...notes] },
  down:   { label: '▼ Down', fn: (notes) => [...notes].reverse() },
  updown: { label: '▲▼ Alt', fn: (notes) => {
    if (notes.length <= 1) return [...notes];
    return [...notes, ...[...notes].reverse().slice(1, -1)];
  }},
  random: { label: 'Rnd',    fn: (notes) => {
    const arr = [...notes];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }},
};

export const ARP_RATES = {
  whole:    { label: '1',    beats: 4 },
  half:     { label: '½',    beats: 2 },
  quarter:  { label: '¼',    beats: 1 },
  eighth:   { label: '⅛',    beats: 0.5 },
  sixteenth:{ label: '1/16', beats: 0.25 },
};

export class ArpEngine {
  constructor(audioCtx, onNoteOn, onNoteOff) {
    this.audioCtx   = audioCtx;
    this.onNoteOn   = onNoteOn;
    this.onNoteOff  = onNoteOff;
    this.running    = false;
    this.pattern    = 'up';
    this.rate       = 'eighth';
    this.bpm        = 120;
    this.notes      = [];       // [{id, freq, label}]
    this.stepIdx    = 0;
    this.nextTime   = 0;
    this._timer     = null;
    this.noteDuty   = 0.8;     // fraction of step duration the note sounds
    this.LOOKAHEAD  = 0.08;    // seconds
    this.INTERVAL   = 20;      // ms scheduler poll
    this._scheduledOff = [];    // [{time, id}]
  }

  setNotes(notes) {
    this.notes = notes;
    // Don't reset step — let it continue through new chord smoothly
  }

  setPattern(p) { this.pattern = p; this.stepIdx = 0; }
  setRate(r)    { this.rate = r; }
  setBPM(bpm)   { this.bpm = bpm; }

  start() {
    if (this.running) return;
    this.running = true;
    this.stepIdx = 0;
    this.nextTime = this.audioCtx.currentTime + 0.05;
    this._schedule();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  get isRunning() { return this.running; }

  _getSequence() {
    if (!this.notes.length) return [];
    return ARP_PATTERNS[this.pattern]?.fn(this.notes) ?? [...this.notes];
  }

  _schedule() {
    if (!this.running) return;

    const beatsPerSec = this.bpm / 60;
    const stepBeats   = ARP_RATES[this.rate]?.beats ?? 0.5;
    const stepSecs    = stepBeats / beatsPerSec;

    const seq = this._getSequence();
    if (!seq.length) {
      this._timer = setTimeout(() => this._schedule(), this.INTERVAL);
      return;
    }

    while (this.nextTime < this.audioCtx.currentTime + this.LOOKAHEAD) {
      const note = seq[this.stepIdx % seq.length];
      if (note) {
        const offTime = this.nextTime + stepSecs * this.noteDuty;
        // Schedule note on
        this.onNoteOn(note.id, note.freq, 0.75, this.nextTime);
        // Schedule note off
        this.onNoteOff(note.id, offTime);
      }
      this.stepIdx = (this.stepIdx + 1) % seq.length;
      this.nextTime += stepSecs;
    }

    this._timer = setTimeout(() => this._schedule(), this.INTERVAL);
  }
}
