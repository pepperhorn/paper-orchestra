import * as Tone from 'tone'

class TransportWrapper {
  get bpm() { return Tone.getTransport().bpm.value }
  set bpm(value) { Tone.getTransport().bpm.value = value }

  get state() { return Tone.getTransport().state }
  get isPlaying() { return Tone.getTransport().state === 'started' }

  start(time) { Tone.getTransport().start(time) }
  stop(time) { Tone.getTransport().stop(time) }
  pause(time) { Tone.getTransport().pause(time) }

  scheduleRepeat(callback, interval, startTime) {
    return Tone.getTransport().scheduleRepeat(callback, interval, startTime)
  }

  clear(eventId) {
    Tone.getTransport().clear(eventId)
  }

  cancel(after) {
    Tone.getTransport().cancel(after)
  }
}

export const transport = new TransportWrapper()
