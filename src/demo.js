sin = Voice.extend({
    initialize: function() {
      this.out = ctx.createGainNode()
      this.o = ctx.createOscillator()
      this.o.type = 0
      connect(this.o, this.out)
    },

    start: function(t) {
        this.out.gain.setValueAtTime(0, t)
        this.out.gain.linearRampToValueAtTime(.8, t + .01)
        this.o.frequency.setValueAtTime(this.options.freq, t)
        this.o.noteOn(t)
    },

    stop: function(t) {
        var tail = t + .05
        this.o.noteOff(tail)
        this.out.gain.linearRampToValueAtTime(0, tail + .05)
    }
})

octave = Pattern('sin', {
    freq: notes('C4-C5-E4-C5')
}, 200)
