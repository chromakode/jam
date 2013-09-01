// a stateful pattern writer's trusty companion
Scribe = function() {
  this.curBeat = 0
  this.beats = []
  this.defaultVars = {}
}
_.extend(Scribe.prototype, {
  set: function(defaultVars) {
    this.defaultVars = defaultVars
    return this
  },

  play: function(vars) {
    vars = _.defaults(vars, this.defaultVars)

    if (vars.note) {
      vars.freq = Note.fromLatin(vars.note.toUpperCase()).frequency()
    }

    this.beats.push({
      beat: this.curBeat,
      vars: vars
    })

    if (vars.wait && vars.duration) {
      this.wait(vars.duration)
    }

    return this
  },

  wait: function(beats) {
    beats = beats || 0
    this.beats.push({beat: this.curBeat, vars: {duration: beats}})
    this.curBeat += beats
    return this
  },

  toEvents: function() {
    return this.beats
  }
})
Scribe.extend = Backbone.View.extend


// a simple base pattern class
Pattern = function(options) {
  this.options = _.defaults(options, this.defaults)
  this.initialize.apply(this, arguments)
}
_.extend(Pattern.prototype, {
  defaults: {},
  initialize: function() {},
  events: function() {},
  generator: function() {
    if (this.ran) {
      return
    }

    var events = this.events()
    if (events.toEvents) {
      events = events.toEvents()
    }
    _.each(events, function(event) {
      event.run = this.runEvent
      event.scheduled = true  // TODO: what should control this?
    }, this)
    this.ran = true
    return events
  },
  runEvent: function(event) {
    if (!event.vars.voice) {
      return
    }
    var v = new window[event.vars.voice](event.vars)
    connect(v.out, event.transport.out)
    v.play(event.t, event.transport.t(event.vars.duration))
  }
})
Pattern.extend = Backbone.View.extend


// takes patterns, tempo, schedule, etc and turns them into a timeline of real node manipulating events
// someday will have seek / pause / rewind
// TODO:
// + tempo changes as events
// + incremental piece wise updating
// + cache, only regen changed patterns (deep property compare?)
// + continuous patterns
Transport = function(options) {
  this.options = _.defaults(options || {}, this.options)
  this.out = ctx.createGainNode()
  connect(this.out, jam.out)
  this.curBeat = 0
  this.curTime = 0
  this.loopBeat = null
  this._task = null
  this.initialize.apply(this, arguments)
}
_.extend(Transport.prototype, Backbone.Events, {
  options: {
    tempo: 120,
    sequence: []
  },

  initialize: function() {},

  set: function(options) {
    _.extend(this.options, options)
    this.regen()
    this.trigger('set', options)
  },

  regen: function() {
    console.time('transport regen')
    this.beatLen = 60 /* seconds */ / this.options.tempo

    // braindump: first step, just brute force dump all events for all patterns
    // second step, incremental generation
    var events = []

    _.each(this.options.sequence, function(seq) {
      var pattern = new window[seq.pattern](seq)
      var patternStart = seq.start
      var patternEvents = pattern.generator()
      var event
      while (event = patternEvents.shift()) {
        event.beat += patternStart
        event.pattern = pattern
        event.transport = this

        if (seq.end && event.beat >= seq.end) {
          break
        } else {
          events.push(event)
        }

        if (!patternEvents || !patternEvents.length) {
          patternEvents = pattern.generator()
          // if the generator ended...
          if (!patternEvents || !patternEvents.length) {
            if (seq.loop && seq.end) {
              pattern = new window[seq.pattern](seq)
              patternEvents = pattern.generator()
              patternStart = event.beat + event.vars.duration
            } else {
              break
            }
          }
        }
      }
    }, this)

    events = _.sortBy(events, 'beat')
    this.events = events

    if (this._task) {
      // FIXME: this forces a re-scan of the whole event list because we don't know where we left off.
      // I think this could be replaced with a smarter update
      this.nextEvent = 0
    }

    console.timeEnd('transport regen')
  },

  t: function(beats) {
    return beats * this.beatLen
  },

  generator: function(t) {
    console.time('transport generator')
    var newEvents = []

    while (this.nextEvent < this.events.length && this.curBeat > this.events[this.nextEvent].beat) {
      // skip events too early
      this.nextEvent++
    }

    // feed events for the next beat
    if (this.loopBeat == 'end' && this.nextEvent >= this.events.length) {
      this.curBeat = 0
      this.nextEvent = 0
    }

    while (this.nextEvent < this.events.length && (event = this.events[this.nextEvent]).beat < this.curBeat + 1) {
      event.t = this.curTime + this.t(event.beat - this.curBeat)
      newEvents.push(event)
      this.nextEvent++
    }

    // if we didn't generate any events, step forward in time and wait til next beat window
    if (!newEvents.length && this.nextEvent < this.events.length) {
      // a no-op event makes the scheduler wait until it before generating more events
      newEvents.push({
        t: this.curTime,
        run: function() {}
      })
    }

    this.curBeat++
    this.curTime += this.t(1)

    console.timeEnd('transport generator')

    return newEvents
  },

  _stop: function() {
    if (this._task) {
      jam.scheduler.stop(this._task)
    }
  },

  play: function() {
    this.regen()
    this.curBeat = 0
    this.curTime = jam.scheduler.now()
    this.nextEvent = 0
    this._stop()
    this._task = jam.scheduler.start(_.bind(this.generator, this))
  },

  stop: function() {
    this._stop()
  },

  loop: function() {
    this.loopBeat = 'end'
    this.play()
  }
})
Transport.extend = Backbone.View.extend
