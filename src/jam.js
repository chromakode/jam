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

// TODO: web worker?
Scheduler = function() {}
_.extend(Scheduler.prototype, {
  running: {},

  start: function(generator, name) {
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

  now: function() {
    return ctx.currentTime
  },

  tick: function() {
    // TODO: move into pattern's concern?
    function t(event) {
      if (event.scheduled) {
        // fudge events that run in another scheduler (Web
        // Audio) by registering them in the scheduler slightly
        // before they are due to run
        return event.t - .2
      } else {
        return event.t
      }
    }

    var now = this.now(),
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
      this._resetTimeout()
      var wait = Math.max((next - now) * 1000, 100)
      this.timeout = setTimeout($.proxy(this, 'tick'), wait)
    }
  },

  _resetTimeout: function() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  },

  stopAll: function() {
    this._resetTimeout()
    this.running = {}
  }
})

function Samples() {}
_.extend(Samples.prototype, {
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
      return name
    }

    var xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = _.bind(function() {
      this.fromArrayBuffer(name, xhr.response)
    }, this)
    xhr.send()
    return name
  }
})

jam = {
  samples: new Samples,
  scheduler: new Scheduler
}

var ctx = new webkitAudioContext()

jam.out = ctx.createGainNode()
jam.gain = ctx.createGainNode()
connect(jam.out, jam.gain, ctx.destination)

jam.outbuffer = ctx.createScriptProcessor(1024, ctx.destination.channelCount, ctx.destination.channelCount)
connect(jam.out, jam.outbuffer, ctx.destination)
