// TODO:
// + persistent voice objects (for bending between notes etc.)
Voice = function(options) {
  this.options = _.defaults(options, this.options)
  this.out = ctx.createGainNode()
  this.initialize.apply(this, arguments)
}
_.extend(Voice.prototype, {
  options: {},
  initialize: function() {},
  play: function(time, length, offset) {
    try {
      this.start(time, offset)
    } catch (e) {
      console.error('error starting voice', e)
    }
    this.stop(time + length)
  }
})
_.extend(Voice, {
  // Run events 100ms ahead of time since the more accurate Web Audio scheduler
  // will actually be running them.
  _scheduleFudge: .1,

  initEvent: function(event) {
    event.finalize = this.finalizeEvent
    event.run = this.runEvent
  },

  finalizeEvent: function(event) {
    event.t -= Voice._scheduleFudge
  },

  runEvent: function(event) {
    var v = new (ref(event.vars.voice))(event.vars)
    connect(v.out, event.transport.out)
    // fixme tempo duration stuff
    v.play(event.t + Voice._scheduleFudge, event.transport.t(event.duration), event.offset)
  }
})
Voice.extend = Backbone.View.extend

SampleVoice = Voice.extend({
  initialize: function() {
    this.s = ctx.createBufferSource()
    this.s.buffer = jam.samples.index[this.options.sample]
    connect(this.s, this.out)
  },

  start: function(t, offset) {
    var sampleFreq = this.options.sampleFreq || 440,
        sampleStart = this.options.sampleStart || 0
    this.s.playbackRate.value = this.options.freq / sampleFreq
    this.s.noteGrainOn(t, sampleStart + offset, this.s.buffer.duration - sampleStart)
  },

  stop: function(t) {
    this.s.noteOff(t)
  }
})

