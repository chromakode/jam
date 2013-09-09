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
  this._curTime = 0
  this.loopBeat = null
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
      this._nextEvent = null
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
    if (this._nextEvent == null) {
      this._nextEvent = _.sortedIndex(this.events, {dt: this.curTime()}, 'dt')
    }

    if (this._nextEvent >= this.events.length) {
      if (this.loopBeat == 'end') {
        // advance the clock for the final beats of the loop
        this.playbackStartTime += this.duration

        // reset to the beginning and start generating events for the next beat
        this._curTime = 0
        this._nextEvent = 0
      } else {
        this.stop()
        return
      }
    }

    // collect the next second's worth of events
    var scheduleEvents = []
    while (this._nextEvent < this.events.length && (event = this.events[this._nextEvent]).dt < this._curTime + 2) {
      event.t = this.playbackStartTime + event.dt
      if (event.finalize) { event.finalize(event) }
      scheduleEvents.push(event)
      this._nextEvent++
    }

    this._curTime += 1

    // manually schedule next run (don't let our buffer run out)
    scheduleEvents.push({
      t: this.playbackStartTime + this._curTime,
      run: _.bind(function() {
        jam.scheduler.runTask(this._task)
      }, this)
    })

    return scheduleEvents
  },

  curTime: function() {
    // current playback time in seconds relative to beat 0
    if (this.playbackStartTime) {
      return Math.max(jam.scheduler.now() - this.playbackStartTime, 0)
    } else {
      return this._curTime
    }
  },

  _stop: function() {
    if (this._task) {
      jam.scheduler.stop(this._task)
      this._task = null
      this._curTime = this.curTime()
      this.playbackStartTime = null
      this.state = 'paused'
      this.trigger('stop')
    }
  },

  play: function() {
    this._stop()

    this.playbackStartTime = jam.scheduler.now()
    if (this._curTime) {
      this._nextEvent = null
      this.playbackStartTime -= this._curTime
    } else {
      this._nextEvent = 0  // cached next event for playback generation
      this._curTime = 0  // next event time in seconds relative to beat 0
      this.playbackStartTime += Voice._scheduleFudge  // Web Audio scheduling grace period; see Voice for more details
    }

    this._task = jam.scheduler.start(_.bind(this.generator, this))
    this.state = 'playing'
    this.trigger('start')
  },

  pause: function() {
    this._stop()
  },

  seek: function(seconds) {
    var wasPlaying = !!this.playbackStartTime
    this._stop()
    this._curTime = seconds
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

  setLoop: function(beat) {
    if (beat == true) {
      beat = 'end'
    }
    this.loopBeat = beat
    this.trigger('change', 'loop', beat)
  }
})
Transport.extend = Backbone.View.extend
