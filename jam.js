// Loosely based on https://github.com/katspaugh/wavesurfer.js/blob/master/src/drawer.js
WaveformView = Backbone.View.extend({
  tagName: 'canvas',
  className: 'waveview',

  setBuffer: function(buf) {
    this.options.buffer = buf
    this.render()
  },

  _getColumns: function(buf, width) {
    var columnWidth = buf.getChannelData(0).length / width,
        maxAmp = 0,
        channelCount = buf.numberOfChannels,
        channels = []

    // build an array of [<maxval>, <minval>] per channel
    for (var c = 0; c < channelCount; c++) {
      var columns = channels[c] = [],
          chan = buf.getChannelData(c)
      for (var i = 0; i < width; i++) {
          var vals = Array.prototype.slice.call(chan, i * columnWidth, (i + 1) * columnWidth)
          columns[i] = [_.max(vals), _.min(vals)]
          maxAmp = Math.max(_.max(columns[i], Math.abs), maxAmp)
      }
    }

    // scale values based on max amplitude
    for (var c = 0; c < channelCount; c++) {
      for (var i = 0; i < width; i++) {
        var levels = channels[c][i]
        levels[0] = levels[0] / maxAmp
        levels[1] = levels[1] / maxAmp
      }
    }

    return channels
  },

  render: function() {
    var fillColor = this.options.fillColor || '#444',
        centerColor = this.options.centerColor || '#555'

    function drawGraph(columns, top, bottom) {
      canvas.fillStyle = fillColor
      var colScale = (bottom - top) / 2,
          center = top + colScale
      for (var x = 0; x < columns.length; x++) {
        var levels = columns[x],
            colTop = center - levels[0] * colScale,
            colBottom = center + Math.abs(levels[1]) * colScale
        canvas.fillRect(x, colTop, 1, colBottom - colTop)
      }
      canvas.fillStyle = centerColor
      canvas.fillRect(0, center, width, 1)
    }

    this.el.width = this.$el.width()
    this.el.height = this.$el.height()

    var canvas = this.el.getContext('2d'),
        width = this.$el.width(),
        height = this.$el.height()

    canvas.clearRect(0, 0, width, height)
    var cols = this._getColumns(this.options.buffer, width)
    drawGraph(cols[0], 0, height / 2)
    drawGraph(cols[1], height / 2, height)
    return this
  }
})

function clamp(min, v, max) {
  return Math.min(Math.max(min, v), max)
}

SampleView = Backbone.View.extend({
  className: 'sampleview',

  render: function() {
    this.waveview = new WaveformView()
    var $selection = this.$selection = $('<div class="selection"><div class="handle left"></div><div class="handle right"></div></div>')
    $selection
      .drag('start', _.bind(function(ev, dd) {
        dd.name = ev.target.className
        dd.parentWidth = this.$el.width()
        dd.width = $selection.outerWidth()
        dd.minWidth = $selection.find('.handle').width()
      }, this))
      .drag(_.bind(function(ev, dd) {
        if (dd.name == 'selection') {
          $selection.css({
            left: clamp(0, dd.offsetX, dd.parentWidth - dd.width)
          })
        } else if (dd.name == 'handle left') {
          var left = clamp(0, dd.offsetX, dd.originalX + dd.width - dd.minWidth)
          $selection.css({
            left: left,
            width: dd.width - (left - dd.originalX)
          })
        } else if (dd.name == 'handle right') {
          $selection.css({
            width: clamp(dd.minWidth, dd.width + dd.deltaX, dd.parentWidth - dd.originalX)
          })
        }
      }, this), {relative: true})
    this.$el.append([
      this.waveview.el,
      $selection
    ])
    return this
  },

  _px: function(sec) {
    return Math.round((sec / this.options.buffer.duration) * this.$el.width())
  },

  select: function(startsec, endsec) {
    var left = this._px(startsec)
    this.$selection.css({
      left: left,
      width: this._px(endsec) - left
    })
  },

  setBuffer: function(buf) {
    this.options.buffer = buf
    this.waveview.setBuffer(buf)
  }
})

HUDView = Backbone.View.extend({
  className: 'hud',
  position: function(pos) {
    this.$el.css({
      'left': pos.x - this.$el.outerWidth(),
      'top': pos.y - this.$el.outerHeight() / 2
    })
  },
  show: function() {
    this.$el.css('opacity', 1)
  },
  hide: function() {
    this.$el.css('opacity', 0)
  }
}, {
  defs: [],
  define: function(re/*, ... */) {
    var cls = this.extend.apply(this, _.rest(arguments))
    cls.re = re
    cls.define = this.define
    HUDView.defs.push(cls)
    return cls
  }
})

VoiceHUD = HUDView.define(/(\w+) = Voice.extend/, {
  className: 'hud hud-voice',
  events: {
    'click .test': 'test'
  },
  render: function() {
    $('<button>')
      .text('test')
      .addClass('test')
      .appendTo(this.el)
    $('<button>')
      .text('loop')
      .appendTo(this.el)
    return this
  },
  test: function() {
    var v = new window[this.options.name]({freq: 440})
    connect(v.out, ctx.destination)
    v.play(ctx.currentTime, 1)
  }
})

SampleVoiceHUD = VoiceHUD.define(/(\w+) = SampleVoice.extend/, {
  className: 'hud hud-voice hud-sample',
  render: function() {
    VoiceHUD.prototype.render.apply(this)
    this.sampleView = new SampleView()
    this.$el.append(this.sampleView.render().el)
    setTimeout(_.bind(function() {
      name = window[this.options.name].prototype.options.sample
      this.sampleView.setBuffer(samples.index[name])
    }, this), 100)
    return this
  }
})

PatternHUD = HUDView.define(/(\w+) = (combine)?Patterns?/, {
  className: 'hud hud-pattern',
  events: {
    'click .play': 'play',
    'click .loop': 'loop'
  },

  render: function() {
    $('<button>')
      .text('play')
      .addClass('play')
      .appendTo(this.el)
    $('<button>')
      .text('loop')
      .addClass('loop')
      .appendTo(this.el)
    return this
  },

  play: function() {
    var p = new window[this.options.name]()
    connect(p.out, ctx.destination)
    scheduler.play(p)
  },

  looping: null,
  loop: function() {
    if (this.looping) {
      scheduler.stop(this.looping)
      this.looping = null
      this.$('.loop')
        .removeClass('running')
        .text('loop')
    } else {
      var p = loopPattern(this.options.name)()
      connect(p.out, ctx.destination)
      this.looping = scheduler.play(p, 'loop-' + this.options.name)
      this.$('.loop')
        .addClass('running')
        .text('stop')
    }
  }
})

EditorView = Backbone.View.extend({
  huds: [],

  render: function() {
    var editorEl = $(this.make('div', {id: 'ace'})).appendTo(this.$el)
    this.ace = ace.edit('ace')
    this.aces = this.ace.getSession()
    this.ace.setKeyboardHandler(require('ace/keyboard/vim').handler)
    this.aces.setMode('ace/mode/javascript')
    this.aces.setUseWorker(false)
    this.aces.bgTokenizer.on('update', _.bind(function() {
      this.updateFoldRanges()
      this.updateHUD()
    }, this))
    this.ace.on('change', $.proxy(this, 'updateHUD'))
    // FIXME: pass an arg to skip some checks only necessary if code changed
    this.ace.renderer.scrollBar.on('scroll', $.proxy(this, 'updateHUD'))
    this.ace.on('change', _.debounce($.proxy(this, 'execute'), 100))
    this.updateHUD()
  },

  loadCode: function(url) {
    // FIXME: cleanup
    if (localStorage['code']) {
      this.ace.setValue(localStorage['code'])
      this.ace.selection.clearSelection()
    } else {
      $.ajax({
        url: url,
        success: _.bind(function(data) {
          this.ace.setValue(data)
          this.ace.selection.clearSelection()
        }, this),
        dataType: 'text'
      })
    }
  },

  execute: function() {
    var code = this.ace.getValue()
    localStorage['code'] = code
    Function(this.ace.getValue())()
  },

  updateFoldRanges: function() {
    var row = 0,
        maxRow = this.aces.getDocument().getLength(),
        foldRanges = []

    while (row < maxRow) {
      var foldRange = this.aces.foldWidgets[row] && this.aces.getFoldWidgetRange(row)
      if (foldRange) {
        foldRanges.push(foldRange)
        row = foldRange.end.row
      } else {
        row++
      }
    }

    this.foldRanges = foldRanges
  },

  updateHUD: function() {
    // FIXME: unused
    var row = this.aces.selection.getCursor().row
    var currentRange = _.find(this.foldRanges, function(r) {
      return r.start.row <= row && r.end.row >= row }
    )

    var huds = _.map(this.foldRanges, function(range) {
      var startLine = this.aces.getLine(range.start.row)

      var match, hudCls
      for (var i = 0; i < HUDView.defs.length; i++) {
        hudCls = HUDView.defs[i]
        match = startLine.match(hudCls.re)
        if (match) {
          break
        }
      }
      if (!match) {
        return
      }

      var name = match[1]
      var hud = this.huds[name]
      if (!(hud && hud instanceof hudCls)) {
        hud = this.huds[name] = new hudCls({name:name})
        this.$el.append(hud.render().el)
      }

      var textLayer = this.ace.renderer.$textLayer
          lineEl = textLayer.element.childNodes[range.start.row - textLayer.config.firstRow]

      if (lineEl) {
        var linePos = $(lineEl).offset()
        hud.position({
          x: -7,
          y: linePos.top + $(lineEl).height() / 2
        })
        hud.show()
      } else {
        hud.hide()
      }
      return hud
    }, this)

    _.each(_.difference(_.values(this.huds), huds), function(oldHud) {
      oldHud.remove()
      delete this.huds[oldHud.options.name]
    }, this)
  }
})


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
        try {
          var p = new window[patName]()
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

looper = function(t) {
  if (!looper.last) {
    looper.last = t
  }
  var next = looper.last + 1
  looper.last = next
  return [{
    t: next - .2,
    run: function() {
      var v = new window['sin']({freq: 440})
      connect(v.out, ctx.destination)
      v.play(next, 1)
    }
  }]
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

$(function() {
  editorView = new EditorView({el: $('#editor')})
  editorView.render()
  editorView.loadCode('demo.js')

  go = function() {
    l = playLoop('run')
    connect(l.out, ctx.destination)
    l.start()
  }
  stop = function() {
    l.stop()
  }

  $(window)
    .bind('dragenter dragover drop', function(ev) {
      ev.stopPropagation()
      ev.preventDefault()
      if (ev.type != 'drop') {
        return
      }

      var files = ev.originalEvent.dataTransfer.files,
          file = files[0],
          reader = new FileReader()
      reader.readAsArrayBuffer(file)
      $(reader).bind('load', function() {
        samples.fromArrayBuffer(file.name, reader.result)
      })
    })
})
