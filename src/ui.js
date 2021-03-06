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
          var localMin = Number.MAX_VALUE
          var localMax = Number.MIN_VALUE
          // TODO: calculate appropriate step based on average expected error and height to draw
          for (var j = Math.floor(i * columnWidth); j < Math.floor((i + 1) * columnWidth); j+=100) {
            var localMin = Math.min(localMin, chan[j])
            var localMax = Math.max(localMax, chan[j])
            maxAmp = Math.max(maxAmp, Math.abs(localMin), Math.abs(localMax))
          }
          columns[i] = [localMax, localMin]
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
            colBottom = center + Math.abs(levels[1]) * colScale,
            colHeight = colBottom - colTop
        canvas.fillRect(x, colTop, 1, colHeight)
      }
      canvas.fillStyle = centerColor
      canvas.fillRect(0, center, width, 1)
    }

    var canvas = this.el.getContext('2d'),
        width = this.$el.width(),
        height = this.$el.height()

    this.el.width = width
    this.el.height = height

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

  resize: function(width, height) {
    this.$el.css({
      width: width,
      height: height
    })
    this.waveview.render()
    this._updateSelect()
  },

  _px: function(sec) {
    return Math.round((sec / this.options.buffer.duration) * this.$el.width())
  },

  select: function(startsec, endsec) {
    this.selection = [startsec, endsec]
    this._updateSelect
  },

  _updateSelect: function() {
    var left = this._px(this.selection[0])
    this.$selection.css({
      left: left,
      width: this._px(this.selection[1]) - left
    })
  },

  setBuffer: function(buf) {
    this.options.buffer = buf
    this.waveview.setBuffer(buf)
    this.select(.2, .5)
  }
})

HUDView = Backbone.View.extend({
  className: 'hud',
  render: function() {
    this.$arrow = $('<div>')
      .addClass('arrow')
      .appendTo(this.el)
  },
  position: function(pos) {
    var hudHeight = this.$el.outerHeight(),
        // center HUDs vertically by default
        centerTop = pos.y - hudHeight / 2,
        // limit to keep the hud onscreen if possible
        spacing = 3,
        hudTop = clamp(spacing, centerTop, this.$el.parent().height() - hudHeight - spacing)

    this.$el.css({
      'left': pos.x - this.$el.outerWidth(),
      'top': hudTop
    })
    this.$arrow.css({
      'top': hudHeight / 2 + (centerTop - hudTop)
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
  define: function(match/*, ... */) {
    var cls = this.extend.apply(this, _.rest(arguments))
    cls.match = match
    cls.define = this.define
    HUDView.defs.unshift(cls)
    return cls
  }
})

VoiceHUD = HUDView.define(Voice, {
  className: 'hud hud-voice',
  events: {
    'click .test': 'test',
    'click .loop': 'loop'
  },

  render: function() {
    HUDView.prototype.render.call(this)
    $('<button class="test icon-play">').appendTo(this.el)
    $('<button class="loop icon-loop">').appendTo(this.el)
    return this
  },

  test: function() {
    v = new window[this.options.name]({freq: 440})
    connect(v.out, ctx.destination)
    v.play(ctx.currentTime, 1)
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
      var p = loopPattern(
        Pattern(this.options.name, {
          freq: notes('A4')
        }, 120)
      )()
      connect(p.out, ctx.destination)
      this.looping = scheduler.play(p, 'loop-voice-' + this.options.name)
      this.$('.loop')
        .addClass('running')
        .text('stop')
    }
  }
})

SampleVoiceHUD = VoiceHUD.define(SampleVoice, {
  className: 'hud hud-voice hud-sample',
  render: function() {
    VoiceHUD.prototype.render.apply(this)
    this.sampleView = new SampleView()
    this.$el.append(this.sampleView.render().el)
    var name = window[this.options.name].prototype.options.sample
    // todo: loading indicator
    $.when(jam.samples.index[name]).done(_.bind(function(buf) {
      this.sampleView.setBuffer(buf)
    }, this))
    return this
  }
})

PatternHUD = HUDView.define(Pattern, {
  className: 'hud hud-pattern',
  events: {
    'click .play': 'play',
    'click .loop': 'loop'
  },

  render: function() {
    HUDView.prototype.render.call(this)
    $('<button class="play icon-play">').appendTo(this.el)
    $('<button class="loop icon-loop">').appendTo(this.el)
    return this
  },

  _init_transport: function() {
    if (this.transport) {
      this.transport.stop()
    }

    this.transport = new Transport()
    this.transport.set({
      tempo: jam.transport.options.tempo,
      sequence: [
        {start: 0, pattern: this.options.name}
      ]
    })
    this.stopListening(jam.transport)

    // update our temp transport when the main one updates
    this.listenTo(jam.transport, 'set', function() {
      this.transport.options.tempo = jam.transport.options.tempo
      this.transport.regen()
    })
  },

  play: function() {
    this._init_transport()
    this.transport.play()
  },

  looping: null,
  loop: function() {
    if (this.looping) {
      this.transport.stop()
      this.looping = null
      this.$('.loop').removeClass('icon-stop running').addClass('icon-loop')
    } else {
      this._init_transport()
      this.transport.loop()
      this.looping = true
      this.$('.loop').removeClass('icon-loop').addClass('icon-stop running')
    }
  }
})

TransportHUD = HUDView.define(/(jam.transport.set)/, {
  className: 'hud hud-transport',
  events: {
    'click .play': 'play',
    'click .loop': 'loop'
  },

  render: function() {
    HUDView.prototype.render.call(this)
    $('<button class="play icon-play">').appendTo(this.el)
    $('<button class="loop icon-loop">').appendTo(this.el)
    return this
  },

  play: function() {
    jam.transport.play()
  },

  looping: null,
  loop: function() {
    if (this.looping) {
      jam.transport.stop()
      this.looping = null
      this.$('.loop').removeClass('icon-stop running').addClass('icon-loop')
    } else {
      jam.transport.setLoop(true)
      jam.transport.play()
      this.looping = true
      this.$('.loop').removeClass('icon-loop').addClass('icon-stop running')
    }
  }
})

EditorView = Backbone.View.extend({
  defRe: /(\w+)\s*=\s*\w+/,

  render: function() {
    this.huds = {}
    var editorEl = $('<div id="ace">').appendTo(this.$el)
    this.ace = ace.edit('ace')
    this.aces = this.ace.getSession()
    this.ace.setKeyboardHandler(require('ace/keyboard/vim').handler)
    this.aces.setMode('ace/mode/javascript')
    this.aces.setUseWorker(false)
    this.aces.setTabSize(2)
    this.aces.bgTokenizer.on('update', _.bind(function() {
      this.updateFoldRanges()
      this.updateHUD()
    }, this))
    this.ace.on('change', $.proxy(this, 'hideHUDs'))
    // FIXME: pass an arg to skip some checks only necessary if code changed
    this.ace.renderer.on('afterRender', $.proxy(this, 'updateHUD'))
    this.ace.on('change', _.debounce($.proxy(this, 'execute'), 100))
    this.updateHUD()
  },

  loadCode: function(url) {
    // FIXME: cleanup
    if (false && localStorage['code']) {
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
      var foldRange = this.aces.getFoldWidgetRange(row)
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
    var huds = _.map(this.foldRanges, function(range) {
      var startLine = this.aces.getLine(range.start.row)
      var defMatch = startLine.match(this.defRe)
      var hudCls = _.find(HUDView.defs, function(cls) {
        if (cls.match instanceof RegExp) {
          match = startLine.match(cls.match)
          return !!match
        } else {
          match = defMatch
          if (!match) {
            return
          }

          var obj = window[match[1]]
          if (!obj) {
            return
          }

          return obj.prototype instanceof cls.match || obj instanceof cls.match
        }
      }, this)
      if (!hudCls) {
        return
      }

      var name = match[1]
      var hud = this.huds[name]
      if (!(hud && hud instanceof hudCls)) {
        hud = this.huds[name] = new hudCls({
          name: name,
          subject: window[name]
        })
        this.$el.append(hud.el)
        hud.render()
      }

      var textLayer = this.ace.renderer.$textLayer
          lineEl = textLayer.element.childNodes[range.start.row - textLayer.config.firstRow]

      if (!lineEl) {
        hud.hide()
        return hud
      }

      var lineTop = $(lineEl).offset().top - this.$el.offset().top,
          lineHeight = $(lineEl).height(),
          onscreen = lineTop > 0 && lineTop + lineHeight < this.$el.height()

      if (onscreen) {
        hud.position({
          x: -7,
          y: lineTop + lineHeight / 2
        })
        hud.options.range = range
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
  },

  hideHUDs: function() {
    _.each(this.huds, function(hud) {
      hud.hide()
    })
  }
})

VolumeView = Backbone.View.extend({
  events: {
    'click .icon': 'toggleMute',
  },

  initialize: function() {
    this._targetVol = this._level = jam.out.gain.value
    this.$el.html('<div class="icon icon-volume-up"></div><div class="level"><div class="active"></div></div>')
    this.$('.level')
      .drag($.proxy(this, '_dragLevel'))
      .drag('init', $.proxy(this, '_dragLevel'))
  },

  render: function() {
    var $icon = this.$('.icon')
    $icon.removeClass('icon-volume-off icon-volume-up')
    if (this._targetVol > 0) {
      $icon.addClass('icon-volume-up')
    } else {
      $icon.addClass('icon-volume-off')
    }
    this.$el.toggleClass('muted', this._targetVol == 0)
    this.$('.level > .active').css('width', Math.round(100 * this._level) + '%')
    return this
  },

  setVolume: function(value) {
    this._targetVol = value
    jam.gain.gain.setValueAtTime(jam.gain.gain.value, ctx.currentTime)
    jam.gain.gain.linearRampToValueAtTime(value, ctx.currentTime + .15)
    this.render()
  },

  toggleMute: function() {
    if (this._targetVol > 0) {
      this.setVolume(0)
    } else {
      this.setVolume(this._level)
    }
  },

  _dragLevel: function(ev, dd) {
    var $level = this.$('.level')
    this._level = (dd.startX + dd.deltaX - $level.position().left) / $level.width()
    this._level = clamp(0, this._level, 1)
    this.setVolume(this._level)
  }
})

LevelsMeterView = Backbone.View.extend({
  initialize: function() {
    jam.outbuffer.addEventListener('audioprocess', _.bind(this.update, this), false)
    this.$containers = []
    this.$avgbars = []
    this.$maxbars = []
    for (var i = 0; i < ctx.destination.channelCount; i++) {
      var $container = $('<div class="container channel1"></div>').appendTo(this.$el)
      this.$containers.push($container)
      this.$avgbars.push($('<div class="bar avg">').appendTo($container))
      this.$maxbars.push($('<div class="bar max">').appendTo($container))
    }
  },

  update: function(ev) {
    var buf = ev.inputBuffer
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var data = buf.getChannelData(c)
      var sum = 0
      for (var i = 0; i < data.length; i++) {
        sum += Math.abs(data[i])
      }
      var avg = sum / data.length
      var max = _.max(data)
      this.$avgbars[c].width(Math.round(100 * clamp(0, avg, 1)) + '%')
      this.$maxbars[c].width(Math.round(100 * clamp(0, max, 1)) + '%')
      this.$containers[c].toggleClass('clip', max >= 1)
    }
  }
})

ProgressView = Backbone.View.extend({
  template: _.template('<div class="panel"><div class="playback-controls"><button class="play icon-play"></button><button class="stop icon-stop"></button><button class="loop icon-loop"></button></div><div class="status-controls"><div class="jam-meter"></div></div></div><div class="bar-container"><div class="bar"></div><div class="current-time"></div><div class="end-time"></div></div>'),

  events: {
    'click .play': 'play',
    'click .stop': 'stop',
    'click .loop': 'loop'
  },

  initialize: function(options) {
    this.transport = options.transport
    this.listenTo(this.transport, 'regen seek change', this.update)
    this.listenTo(this.transport, 'start', this._startUpdating)
    this.listenTo(this.transport, 'stop', this._stopUpdating)
    this.$el.html(this.template({}))
    this.$play = this.$('.play')
    this.$loop = this.$('.loop')
    this.$currentTime = this.$('.current-time')
    this.$endTime = this.$('.end-time')
    this.$bar = this.$('.bar')

    this._doSeek = _.debounce(this._doSeek, 100)
    this.$('.bar-container')
      .drag($.proxy(this, '_dragSeek'))
      .drag('init', $.proxy(this, '_dragSeek'))

    this.meter = new LevelsMeterView({el: this.$('.jam-meter')})
  },

  _formatTime: function(seconds) {
    function zeropad(n, len) {
      len = len || 2
      s = n.toString()
      var need = Math.max(0, len - s.length)
      return new Array(need+1).join('0') + n
    }
    var hours = Math.floor(seconds / 60 / 60)
    var minutes = Math.floor(seconds / 60)
    return hours + ':' + zeropad(minutes) + ':' + zeropad(seconds.toFixed(3), 6)
  },

  _update: function(curTime) {
    var curTime = curTime
    var duration = this.transport.duration
    this.$currentTime.text(this._formatTime(curTime))
    this.$endTime.text(this._formatTime(duration))
    this.$bar.width(Math.round(10000 * clamp(0, curTime / duration, 1)) / 100 + '%')

    if (jam.transport.state == 'playing') {
      this.$play.removeClass('icon-play').addClass('icon-pause running')
    } else {
      this.$play.removeClass('icon-pause running').addClass('icon-play')
    }
    this.$loop.toggleClass('toggled', !!jam.transport.looping)
  },

  update: function() {
   this._update(this.transport.playbackTime())
  },

  _startUpdating: function() {
    this._stopUpdating()
    this._interval = setInterval(_.bind(this.update, this), 1000/30)
  },

  _stopUpdating: function() {
    if (this._interval) {
      clearInterval(this._interval)
    }
    this.update()
  },

  play: function() {
    if (jam.transport.state == 'playing') {
      jam.transport.pause()
    } else {
      jam.transport.play()
    }
  },

  stop: function() {
    jam.transport.stop()
  },

  loop: function() {
    if (this.$loop.is('.toggled')) {
      jam.transport.setLoop(false)
    } else {
      jam.transport.setLoop(true)
    }
  },

  _dragSeek: function(ev, dd) {
    this._stopUpdating()
    var frac = clamp(0, (dd.startX + dd.deltaX) / this.$el.width(), 1)
    var newTime = jam.transport.duration * frac
    this._update(newTime)
    this._doSeek(newTime)
  },

  _doSeek: function(time) {
    jam.transport.seek(time)
    if (jam.transport.state == 'playing') {
      this._startUpdating()
    }
  }
})

$(function() {
  // TODO: move to some kind of init
  jam.transport = new Transport()
  //
  editorView = new EditorView({el: $('#editor')})
  editorView.render()
  editorView.loadCode('demo.js')

  volumeView = new VolumeView({el: $('header .jam-volume')})
  volumeView.render()

  progressView = new ProgressView({
    el: $('#progress'),
    transport: jam.transport
  })
  progressView.render()

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
        jam.samples.fromArrayBuffer(file.name, reader.result)
      })
    })
})
