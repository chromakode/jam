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
