import * as Tone from 'tone'

export const ARP_PATTERNS = {
  off:    { label: 'Off',    fn: () => [] },
  up:     { label: '▲ Up',   fn: (notes) => [...notes] },
  down:   { label: '▼ Down', fn: (notes) => [...notes].reverse() },
  updown: { label: '▲▼ Alt', fn: (notes) => {
    if (notes.length <= 1) return [...notes]
    return [...notes, ...[...notes].reverse().slice(1, -1)]
  }},
  random: { label: 'Rnd', fn: (notes) => {
    const arr = [...notes]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }},
}

export const ARP_RATES = {
  whole:     { label: '1',    beats: 4 },
  half:      { label: '½',    beats: 2 },
  quarter:   { label: '¼',    beats: 1 },
  eighth:    { label: '⅛',    beats: 0.5 },
  sixteenth: { label: '1/16', beats: 0.25 },
}

export class ArpEngine {
  constructor(onNoteOn, onNoteOff) {
    this.onNoteOn = onNoteOn
    this.onNoteOff = onNoteOff
    this.running = false
    this.pattern = 'up'
    this.rate = 'eighth'
    this.bpm = 120
    this.notes = []
    this.stepIdx = 0
    this.nextTime = 0
    this._timer = null
    this.noteDuty = 0.8
    this.LOOKAHEAD = 0.08
    this.INTERVAL = 20
  }

  setNotes(notes) {
    this.notes = notes
  }

  setPattern(p) { this.pattern = p; this.stepIdx = 0 }
  setRate(r) { this.rate = r }
  setBPM(bpm) { this.bpm = bpm }

  start() {
    if (this.running) return
    this.running = true
    this.stepIdx = 0
    this.nextTime = Tone.now() + 0.05
    this._schedule()
  }

  stop() {
    this.running = false
    if (this._timer) clearTimeout(this._timer)
    this._timer = null
  }

  get isRunning() { return this.running }

  _getSequence() {
    if (!this.notes.length) return []
    return ARP_PATTERNS[this.pattern]?.fn(this.notes) ?? [...this.notes]
  }

  _schedule() {
    if (!this.running) return

    const beatsPerSec = this.bpm / 60
    const stepBeats = ARP_RATES[this.rate]?.beats ?? 0.5
    const stepSecs = stepBeats / beatsPerSec

    const seq = this._getSequence()
    if (!seq.length) {
      this._timer = setTimeout(() => this._schedule(), this.INTERVAL)
      return
    }

    const now = Tone.now()
    while (this.nextTime < now + this.LOOKAHEAD) {
      const note = seq[this.stepIdx % seq.length]
      if (note) {
        const offTime = this.nextTime + stepSecs * this.noteDuty
        this.onNoteOn(note.id, note.freq, 0.75, this.nextTime)
        this.onNoteOff(note.id, offTime)
      }
      this.stepIdx = (this.stepIdx + 1) % seq.length
      this.nextTime += stepSecs
    }

    this._timer = setTimeout(() => this._schedule(), this.INTERVAL)
  }
}
