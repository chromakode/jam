var ctx = new webkitAudioContext()
// ctx.currentTime won't start ticking until we create something
ctx.createOscillator()

samples = {
  index: {},

  fromArrayBuffer: function(name, ab) {
    ctx.decodeAudioData(ab, _.bind(function(buf) {
      console.log('loaded file', name)
      this.index[name] = buf
    }, this))
  },

  download: function(url) {
    var name = _.last(url.split('/'))
    if (name in this.index) {
      return
    }

    var xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = _.bind(function() {
      this.fromArrayBuffer(name, xhr.response)
    }, this)
    xhr.send()
  }
}

function connect(/* [nodes] */) {
  for (var i = 0; i < arguments.length - 1; i++) {
    var node = arguments[i]
    if (_.isArray(node)) {
      _.invoke(node, 'connect', arguments[i + 1])
    } else {
      arguments[i].connect(arguments[i + 1])
    }
  }
  return arguments[arguments.length - 1]
}

Voice = function(options) {
  this.options = _.defaults(options, this.options)
  this.out = ctx.createGainNode()
  this.initialize.apply(this, arguments)
}
_.extend(Voice.prototype, {
  options: {},
  initialize: function() {},
  note: function() {},
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

notes = function(notestr) {
    var ns = notestr.split('-')
    return _.map(ns, function(n) {
      if (n) {
        return Note.fromLatin(n).frequency()
      }
    })
}

each = function(props) {
    var items = []
    for (var prop in props) {
        var vals = props[prop]
        for (var i = 0; i < vals.length; i++) {
            items[i] = items[i] || {}
            items[i][prop] = vals[i]
        }
    }
    return items
}

Pattern = function(voice, vars, tempo) {
  tempo = tempo || 120
  var beatLen = 60 / tempo

  if (_.isFunction(vars)) {
      vars = vars()
  }

  if (!_.isArray(vars)) {
      vars = each(vars)
  }

  // FIXME: sane inheritance w/ Backbone style object
  return function() {
    var out = ctx.createGainNode()
    return {
      duration: beatLen * vars.length,
      out: out,
      generator: function(t) {
        if (this._run) {
          return
        }
        this._run = true

        var events = []
        for (var i = 0; i < vars.length; i++) {
            if (!vars[i].freq) {
              continue
            }
            events.push({
              t: t,
              vars: vars[i],
              run: function(ev) {
                var v = new window[voice](ev.vars)
                connect(v.out, out)
                v.play(ev.t, beatLen)
              },
              scheduled: true
            })
            t += beatLen
        }
        return events
      }
    }
  }
}

function loopPattern(patName) {
  return function() {
    return {
      out: ctx.createGainNode(),
      generator: function(t) {
        if (!this.t) {
          this.t = t
        }

        var patCls = _.isString(patName) ? window[patName] : patName
        try {
          var p = new patCls()
        } catch (e) {
          console.error('error running pattern', e)
        }
        connect(p.out, this.out)
        var events = p.generator(this.t)
        this.t += p.duration
        return events
      }
    }
  }
}

function combinePatterns(patterns) {
  return function() {
    var ps = _.map(patterns, function(name) { return window[name]() })
    return {
      duration: _.max(_.pluck(ps, 'duration')),
      out: ctx.createGainNode(),
      generator: function(t) {
        connect(_.pluck(ps, 'out'), this.out)
        return _.compact(_.flatten(_.invoke(ps, 'generator', t)))
      }
    }
  }
}

scheduler = {
  running: {},

  play: function(generator, name) {
    if (!_.isFunction(generator)) {
      generator = $.proxy(generator, 'generator')
    }
    if (!name) {
      name = _.uniqueId('play')
    }
    var task = {
      name: name,
      generator: generator,
      events: []
    }
    this.running[name] = task
    this._runTask(task, ctx.currentTime)
    this.tick()
    return task
  },

  stop: function(task) {
    delete this.running[task.name]
  },

  _runTask: function(task, t) {
    task.events = task.generator(t)
    if (task.events) {
      task.events = _.sortBy(task.events, 't')
    }
  },

  tick: function() {
    function t(event) {
      if (event.scheduled) {
        return event.t - .2
      } else {
        return event.t
      }
    }

    var now = ctx.currentTime,
        next = Number.MAX_VALUE

    _.each(this.running, function(task) {
      while (task.events[0] && t(task.events[0]) <= now) {
        var event = task.events.shift()
        try {
          event.run(event)
        } catch (e) {
          console.error('event run error', e)
        }
      }

      if (!task.events.length) {
        this._runTask(task, now)
      }

      if (task.events && task.events[0]) {
        next = Math.min(next, t(task.events[0]))
      }
    }, this)

    // prune finished tasks
    var stopped = _.filter(this.running, function(task) {
      return !task.events || !task.events.length
    })
    _.each(stopped, $.proxy(this, 'stop'))

    // schedule next tick
    if (next != Number.MAX_VALUE) {
      var wait = Math.max((next - now) * 1000, 100)
      this.timeout = setTimeout($.proxy(this, 'tick'), wait)
    }
  },

  stopAll: function() {
    clearTimeout(this.timeout)
    this.running = {}
  }
}

jam = {
  samples: samples.index
}
