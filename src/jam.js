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
Scheduler = function() {
  this.initialize.apply(this, arguments)
}
_.extend(Scheduler.prototype, {
  running: {},

  initialize: function() {},

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
    this.runTask(task)
    this._tick()
    return task
  },

  stop: function(task) {
    delete this.running[task.name]
  },

  resetTask: function(task) {
    task.events = []
  },

  runTask: function(task) {
    var newEvents = task.generator()
    if (newEvents) {
      task.events = task.events.concat(newEvents)
      task.events = _.sortBy(task.events, 't')
    }
  },

  runEvent: function(event) {
    if (!event.run) { return }
    try {
      event.run(event)
    } catch (e) {
      console.error('event run error', e)
    }
  },

  now: function() {
    return ctx.currentTime
  },

  _tick: function() {
    var now = this.now(),
        next = Number.MAX_VALUE

    _.each(this.running, function(task) {
      // allow firing events up to 5ms early to allow JS timeout undershoots
      while (task.events[0] && task.events[0].t <= now + .005) {
        var event = task.events.shift()
        this.runEvent(event)
      }

      if (!task.events.length) {
        this.runTask(task)
      }

      if (task.events && task.events[0]) {
        next = Math.min(next, task.events[0].t)
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
      var wait = Math.max((next - this.now()) * 1000, 10)
      this.timeout = setTimeout($.proxy(this, '_tick'), wait)
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
Scheduler.extend = Backbone.View.extend

StatsScheduler = Scheduler.extend({
  initialize: function() {
    this.resetStats()
  },

  resetStats: function() {
    this.stats = {
      totalLag: 0,
      maxLag: 0,
      eventCount: 0,
      totalEventTime: 0,
      maxEventTime: 0,
      taskRunCount: 0,
      totalTaskTime: 0,
      maxTaskTime: 0
    }
  },

  runTask: function(task) {
    var start = performance.now()
    Scheduler.prototype.runTask.call(this, task)
    var end = performance.now()

    this.stats.taskRunCount++
    var duration = (end - start) / 1000
    this.stats.totalTaskTime += duration
    this.stats.maxTaskTime = Math.max(duration, this.stats.maxTaskTime)

    console.debug('[task] time: %sms  avg time: %sms  max time: %sms',
      (1000 * duration).toFixed(3),
      (1000 * this.stats.totalTaskTime / this.stats.taskRunCount).toFixed(3),
      (1000 * this.stats.maxTaskTime).toFixed(3)
    )
  },

  runEvent: function(event) {
    var ctxStart = this.now()
    var start = performance.now()
    Scheduler.prototype.runEvent.call(this, event)
    var end = performance.now()

    this.stats.eventCount++
    var offset = ctxStart - event.t
    var lag = Math.abs(offset)
    this.stats.totalLag += lag
    this.stats.maxLag = Math.max(lag, this.stats.maxLag)
    var duration = (end - start) / 1000
    this.stats.totalEventTime += duration
    this.stats.maxEventTime = Math.max(duration, this.stats.maxEventTime)

    console.debug('[event] offset: %sms  avg lag: %sms  max lag: %sms  |  time: %sms  avg time: %sms  max time: %sms',
      (1000 * offset).toFixed(3),
      (1000 * this.stats.totalLag / this.stats.eventCount).toFixed(3),
      (1000 * this.stats.maxLag).toFixed(3),
      (1000 * duration).toFixed(3),
      (1000 * this.stats.totalEventTime / this.stats.eventCount).toFixed(3),
      (1000 * this.stats.maxEventTime).toFixed(3)
    )
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
