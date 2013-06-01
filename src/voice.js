Voice = function(options) {
  this.options = _.defaults(options, this.options)
  this.out = ctx.createGainNode()
  this.initialize.apply(this, arguments)
}
_.extend(Voice.prototype, {
  options: {},
  initialize: function() {},
  play: function(time, length) {
    try {
      this.start(time)
    } catch (e) {
      console.error('error starting voice', e)
    }
    this.stop(time + length)
  }
})
Voice.extend = Backbone.View.extend

SampleVoice = Voice.extend({
  initialize: function() {
    this.s = ctx.createBufferSource()
    this.s.buffer = samples.index[this.options.sample]
    connect(this.s, this.out)
  },

  start: function(t) {
    var sampleFreq = this.options.sampleFreq || 440,
        sampleStart = this.options.sampleStart || 0
    this.s.playbackRate.value = this.options.freq / sampleFreq
    this.s.noteGrainOn(t, sampleStart, this.s.buffer.duration - sampleStart)
  },

  stop: function(t) {
    this.s.noteOff(t)
  }
})

