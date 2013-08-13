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
  this.options = _.defaults(options, this.options)
  this.initialize.apply(this, arguments)
}
_.extend(Pattern.prototype, {
  options: {},
  initialize: function() {},
  events: function() {},
  generator: function() {
    var events = this.events()
    if (events.toEvents) {
      events = events.toEvents()
    }
    _.each(events, function(event) {
      event.run = this.runEvent
      event.scheduled = true  // TODO: what should control this?
    }, this)
    return events
  },
  runEvent: function(event) {
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
  this.curBeat = 0
  this.curTime = 0
  this._task = null
  this.initialize.apply(this, arguments)
}
_.extend(Transport.prototype, {
  options: {
    tempo: 120,
    sequence: []
  },

  initialize: function() {},

  set: function(options) {
    _.extend(this.options, options)
    this.regen()
  },

  regen: function() {
    // braindump: first step, just brute force dump all events for all patterns
    // second step, incremental generation
    var events = []

    _.each(this.options.sequence, function(seq) {
      var pattern = new window[seq.pattern]
      // TODO: doesn't work for lazy patterns
      _.each(pattern.generator(), function(event) {
        event.beat += seq.start
        event.pattern = pattern
        event.transport = this
        events.push(event)
      }, this)
    }, this)

    events = _.sortBy(events, 'beat')
    this.events = events
  },

  t: function(beats) {
    var beatLen = 60 /* seconds */ / this.options.tempo
    return beats * beatLen
  },

  generator: function(t) {
    var beatEvents = []
    var genBeats = 1

    while (this.events.length && this.events[0].beat < this.curBeat + genBeats + 1) {
      var event = this.events.shift()
      event.t = this.curTime + this.t(event.beat - this.curBeat)
      beatEvents.push(event)
    }

    console.log(this.curBeat, this.curTime)
    this.curBeat += genBeats
    this.curTime += this.t(genBeats)

    if (!beatEvents.length && this.events.length) {
      beatEvents.push({
        t: this.curTime,
        run: function() {}
      })
    }

    return beatEvents
  },

  play: function() {
    this.regen()
    this.curTime = jam.scheduler.now()
    this.curBeat = 0
    this._task = jam.scheduler.start(_.bind(this.generator, this))
  },

  pause: function() {
    if (this._task) {
      jam.scheduler.stop(this._task)
    }
  },

  loop: function() {
  
  }
})
Transport.extend = Backbone.View.extend
