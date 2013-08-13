sin = Voice.extend({
  initialize: function() {
    this.out = ctx.createGainNode()
    this.o = ctx.createOscillator()
    this.o.type = 0
    connect(this.o, this.out)
  },

  start: function(t) {
    this.out.gain.setValueAtTime(0, t)
    this.out.gain.linearRampToValueAtTime(.2, t + .01)
    this.o.frequency.setValueAtTime(this.options.freq, t)
    this.o.noteOn(t)
  },

  stop: function(t) {
    var tail = t + .05
    this.o.noteOff(tail)
    this.out.gain.linearRampToValueAtTime(0, tail + .05)
  }
})

dumdum = Pattern.extend({
  events: function() {
    return new Scribe()
      .set({voice: 'sin', duration: 1, wait: true})
      .play({note: 'a5'})
      .play({note: 'e5'})
      .wait(2)
      .play({note: 'd5'})
      .play({note: 'a4'})
      .wait(2)
      .play({note: 'd4'})
      .play({note: 'a4'})
  }
})

jam.transport.set({
  tempo: 120,
  sequence: [
    {start: 0, pattern: 'dumdum'},
  ]
})
