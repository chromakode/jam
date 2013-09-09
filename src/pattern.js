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
      duration: vars.duration,
      vars: vars
    })

    if (vars.wait) {
      this.curBeat += vars.duration
    }

    return this
  },

  wait: function(beats) {
    beats = beats || 0
    this.beats.push({beat: this.curBeat, duration: beats, vars: {}})
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

    this.ran = true
    return events
  },
  runEvent: function(event) {
    if (!event.vars.voice) {
      return
    }
    var v = new window[event.vars.voice](event.vars)
    connect(v.out, event.transport.out)
    v.play(event.t, event.transport.t(event.duration))
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
    // timeline generator: bakes a sequence into events.
    // we try to offload as much work to here as possible because it doesn't
    // run in realtime.
    //
    // first rev (now): just brute force dump all events for all patterns
    // future: lazy incremental chunk-wise generation
    // if this gets slow it may be worth moving into a web worker
    console.time('transport regen')

    // step 1: generate sorted events from patterns
    var events = []
    _.each(this.options.sequence, function(seq) {
      if (seq.tempo) {
        events.push({
          beat: seq.start,
          tempo: seq.tempo
        })
      }

      if (seq.pattern) {
        var pattern = new window[seq.pattern](seq)
        var patternStart = seq.start
        var patternEvents = pattern.generator()
        var event
        while (event = patternEvents.shift()) {
          event.beat += patternStart
          event.pattern = pattern
          event.transport = this
          if (event.vars.voice) {
            try {
              window[event.vars.voice].initEvent(event)
            } catch (e) {}
          }

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
                patternStart = event.beat + event.duration
              } else {
                break
              }
            }
          }
        }
      }
    }, this)

    this.events = events = _.sortBy(events, 'beat')

    // step 2: bake beats into seconds and figure out song duration
    // TODO: create index of beat -> time?
    var genBeat = 0
    var genTime = 0
    var genTempo = 0
    _.each(events, function(event) {
      if (event.tempo) {
        // TODO: perhaps make this an event.gen() function?
        genTempo = event.tempo
      }
      var deltaBeat = event.beat - genBeat
      event.dt = genTime += this.t(deltaBeat, genTempo)  // B-)
      genBeat = event.beat
    }, this)

    var lastEvent = _.last(events)
    this.endBeat = lastEvent.beat + lastEvent.duration
    this.duration = lastEvent.dt + this.t(lastEvent.duration, genTempo)

    // if we're currently playing, invalidate our cached next event and re-scan
    // TODO: is there a smarter/cheaper way to do this?
    if (this._task) {
      jam.scheduler.resetTask(this._task)
      this.nextEvent = null
      jam.scheduler.runTask(this._task)
    }

    console.timeEnd('transport regen')
    this.trigger('regen')
  },

  t: function(beats, tempo) {
    tempo = tempo || this.options.tempo
    var beatLen = 60 /* seconds */ / tempo
    return beats * beatLen
  },

  generator: function() {
    // event scheduler "generator" -- called in real time by scheduler to
    // re-fill buffer of next events to play.

    // if our cached event position is out of date, binary search to re-find it.
    if (this.nextEvent == null) {
      this.nextEvent = _.sortedIndex(this.events, {dt: jam.scheduler.now() - this.playbackStartTime}, 'dt')
    }

    if (this.nextEvent >= this.events.length) {
      if (this.loopBeat == 'end') {
        // advance the clock for the final beats of the loop
        this.playbackStartTime += this.duration

        // reset to the beginning and start generating events for the next beat
        this.curTime = 0
        this.nextEvent = 0
      } else {
        return
      }
    }

    // collect the next second's worth of events
    var scheduleEvents = []
    while (this.nextEvent < this.events.length && (event = this.events[this.nextEvent]).dt < this.curTime + 2) {
      event.t = this.playbackStartTime + event.dt
      if (event.finalize) { event.finalize(event) }
      scheduleEvents.push(event)
      this.nextEvent++
    }

    this.curTime += 1

    // manually schedule next run (don't let our buffer run out)
    scheduleEvents.push({
      t: this.playbackStartTime + this.curTime,
      run: _.bind(function() {
        jam.scheduler.runTask(this._task)
      }, this)
    })

    return scheduleEvents
  },

  _stop: function() {
    if (this._task) {
      jam.scheduler.stop(this._task)
    }
  },

  play: function() {
    this.regen()

    // state during event
    this.nextEvent = 0  // cached next event for playback generation
    this.curTime = 0  // current playback time in seconds relative to beat 0
    this.playbackStartTime = jam.scheduler.now() + Voice._scheduleFudge  // start time of playback

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
