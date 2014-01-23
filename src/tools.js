TempoTapper = function(options) {
  this.options = _.defaults(options || {}, this.options)
  this.initialize.apply(this, arguments)
}
_.extend(TempoTapper.prototype, {
  options: {
    transport: jam.transport
  },

  initialize: function(options) {
    this.beats = this.options.beats || []
  },

  record: function() {
    $(document).on('keydown', $.proxy(this, 'onKey'))
  },

  stop: function() {
    $(document).off('keydown', $.proxy(this, 'onKey'))
  },

  clear: function() {
    this.beats = []
  },

  onKey: function(event) {
    console.log('tap', this.options.transport.playbackTime())
    this.beats.push({
      dt: this.options.transport.playbackTime(),
      key: event.which
    })
  },

  toTempoSeq: function(mul) {
    mul = mul || 1
    var seq = _.map(this.beats, function(beat, idx) {
      if (idx == 0) {
        return {
          start: 0,
          tempo: mul * 60 / beat.dt,
          when: 0
        }
      } else {
        return {
          start: idx,
          tempo: mul * 60 / (beat.dt - this.beats[idx-1].dt),
          when: this.beats[idx-1].dt
        }
      }
    }, this)
    return _.compact(seq)
  }
})
TempoTapper.extend = Backbone.View.extend

TempoTapperHUD = HUDView.define(TempoTapper, {
  className: 'hud hud-beattapper',
  events: {
    'click .record': 'record',
  },

  render: function() {
    HUDView.prototype.render.call(this)
    $('<button class="record icon-record">').appendTo(this.el)
    return this
  },

  record: function() {
    this.options.subject.clear()
    this.options.subject.record()
    jam.transport.play()
    this.listenToOnce(jam.transport, 'halt', this.stop)
  },

  stop: function() {
    this.options.subject.stop()
    editorView.aces.replace(
      this.options.range,
      JSON.stringify(this.options.subject.beats, null, '  ')
    )
  }
})

KeyboardLagTester = function(options) {
  this.options = _.defaults(options || {}, this.options)
  this.initialize.apply(this, arguments)
}
_.extend(KeyboardLagTester.prototype, {
  options: {
    tempo: 120
  },

  initialize: function(options) {
    this.options = options

    var voice = Voice.extend({
      initialize: function() {
        this.out = ctx.createGainNode()
        this.o = ctx.createOscillator()
        this.o.type = 0
        connect(this.o, this.out)
      },

      start: function(t) {
        this.out.gain.setValueAtTime(1, t)
        this.o.frequency.setValueAtTime(this.options.freq, t)
        this.o.noteOn(t)
      },

      stop: function(t) {
        this.o.noteOff(t)
        this.out.gain.linearRampToValueAtTime(0, t)
      }
    })

    var metronome = Pattern.extend({
      events: function() {
        return new Scribe()
          .play({voice: voice, freq: 880, duration: .1})
          .wait(1)
      }
    })

    this.transport = (new Transport).set({
      tempo: this.options.tempo,
      sequence: [
        {start: 0, stop: 100, loop: true, pattern: metronome}
      ]
    })

    this.tapper = new TempoTapper({
      transport: this.transport
    })
  },

  start: function() {
    this.transport.setLoop(true)
    this.transport.play()
    this.tapper.record()
  },

  stop: function() {
    this.transport.stop()
    this.tapper.stop()
  }
})
