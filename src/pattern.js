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
    // todo: use current tempo for duration
    v.play(event.t, event.transport.t(event.duration))
  }
})
Pattern.extend = Backbone.View.extend

function SeekEvent(seekTime) {
  this.seekTime = seekTime
}
_.extend(SeekEvent.prototype, {
  finalize: function(event) {
    event.transport._genBaseTime = event.t - this.seekTime
    event.transport._nextIdx = null
  },

  run: function(event) {
    event.transport._displayBaseTime = event.t - this.seekTime
  }
})

// takes patterns, tempo, schedule, etc and turns them into a timeline of real node manipulating events
// someday will have seek / pause / rewind
// TODO:
// + tempo changes as events
// + incremental piece wise updating
// + cache, only regen changed patterns (deep property compare?)
// + continuous patterns
Transport = function(options) {
  this.options = _.defaults(options || {}, this.options)
  this._pauseTime = 0
  this._loopEvent = null
  this.looping = false
  this.state = 'stopped'
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
          tempo: seq.tempo,
          duration: 0
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

    // persist loop event
    if (this._loopEvent) {
      this._loopEvent.dt = this.duration
      events.push(this._loopEvent)
    }

    // re-run the generator with the new events
    // TODO: generate tempo map and use to determine beat so that tempo edits
    // retain seek position
    this.seek(Math.min(this.playbackTime(), this.duration))

    console.timeEnd('transport regen')
    this.trigger('regen')
  },

  t: function(beats, tempo) {
    tempo = tempo || this.options.tempo
    var beatLen = 60 /* seconds */ / tempo
    return beats * beatLen
  },

  genAhead: .25,
  generator: function() {
    // event scheduler "generator" -- called in real time by scheduler to
    // re-fill buffer of next events to play.

    var now = jam.scheduler.now()

    // collect the next batch of events
    var event
    var scheduleEvents = []
    var stop = false
    while (true) {
      // if we don't have a _nextIdx (from previous generator iterations), we
      // need to determine the next event to feed by finding the next event
      // after our current generation time. binary search to the rescue!
      if (this._nextIdx == null) {
        var genTime = jam.scheduler.now() - this._genBaseTime
        this._nextIdx = _.sortedIndex(this.events, {dt: genTime}, 'dt')
      }

      // check for end of transport
      if (this._nextIdx >= this.events.length) {
        stop = true
        break
      }

      // FIXME: we need to clone for the corner case in which events are
      // touched multiple times in this loop. this only happens for really
      // short loops.
      event = _.clone(this.events[this._nextIdx])
      event.t = this._genBaseTime + event.dt

      // stop generating if we've passed our lookahead point
      if (event.t > now + this.genAhead * 2) {
        break
      }

      this._nextIdx++
      if (event.finalize) { event.finalize(event) }
      scheduleEvents.push(event)
    }

    if (stop) {
      // schedule a stop at the appropriate real time and stop generating.
      scheduleEvents.push({
        t: this._genBaseTime + this.duration,
        run: _.bind(function() {
          this.stop()
        }, this)
      })
    } else {
      // schedule next run (don't let our buffer run out)
      scheduleEvents.push({
        t: now + this.genAhead,
        run: _.bind(function() {
          jam.scheduler.runTask(this._task)
        }, this)
      })
    }

    return scheduleEvents
  },

  playbackTime: function() {
    if (this.state == 'playing') {
      return jam.scheduler.now() - this._displayBaseTime
    } else {
      return this._pauseTime
    }
  },

  _stop: function() {
    if (this._task) {
      if (this.out) {
        this.out.disconnect(0)
        this.out = null
      }
      jam.scheduler.stop(this._task)
      this._task = null
      this._pauseTime = this.playbackTime()
      this._genBaseTime = this._displayBaseTime = null
      this.state = 'paused'
      this.trigger('stop')
    }
  },

  play: function() {
    this._stop()

    this._genBaseTime = this._displayBaseTime = jam.scheduler.now() - this._pauseTime
    this._nextIdx = null

    // Web Audio scheduling grace period; see Voice for more details
    this._genBaseTime += Voice._scheduleFudge

    this.out = ctx.createGainNode()
    connect(this.out, jam.out)

    this._task = jam.scheduler.start(_.bind(this.generator, this))
    this.state = 'playing'
    this.trigger('start')
  },

  pause: function() {
    this._stop()
  },

  seek: function(seconds) {
    var wasPlaying = this.state == 'playing'
    this._stop()
    this._pauseTime = seconds
    if (wasPlaying) {
      this.play()
    }
    this.trigger('seek')
  },

  stop: function() {
    this._stop()
    this.seek(0)
    this.state = 'stopped'
  },

  setLoop: function(looping) {
    this.looping = looping
    if (looping) {
      this._loopEvent = new SeekEvent(0)
      this._loopEvent.dt = this.duration
      this._loopEvent.transport = this
      this.events.push(this._loopEvent)
    } else {
      this.events.splice(_.indexOf(this.events, this._loopEvent), 1)
      this._loopEvent = null
    }
    this.trigger('change', 'loop', this.looping)
  }
})
Transport.extend = Backbone.View.extend
