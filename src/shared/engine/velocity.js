export class VelocityTracker {
  constructor(n = 6) {
    this.n = n
    this.bufs = {}
  }

  update(id, y) {
    if (!this.bufs[id]) this.bufs[id] = []
    this.bufs[id].push({ y, t: performance.now() })
    if (this.bufs[id].length > this.n) this.bufs[id].shift()
  }

  vel(id) {
    const b = this.bufs[id]
    if (!b || b.length < 2) return 0
    const dt = (b[b.length - 1].t - b[0].t) / 1000
    return dt < 0.001 ? 0 : (b[b.length - 1].y - b[0].y) / dt
  }

  clear(id) {
    if (id) delete this.bufs[id]
    else this.bufs = {}
  }
}
