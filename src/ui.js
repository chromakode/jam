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
            colBottom = center + Math.abs(levels[1]) * colScale,
            colHeight = colBottom - colTop
        canvas.fillRect(x, colTop, 1, colHeight)
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
        hudTop = clamp(0, centerTop, $(window).height() - hudHeight)

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

PatternHUD = HUDView.define(/(\w+) = Pattern/, {
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
    connect(this.transport.out, jam.out)
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

TransportHUD = HUDView.define(/jam.transport.set/, {
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
      jam.transport.loop()
      this.looping = true
      this.$('.loop').removeClass('icon-loop').addClass('icon-stop running')
    }
  }
})

EditorView = Backbone.View.extend({
  huds: [],

  render: function() {
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
    this.ace.on('change', $.proxy(this, 'updateHUD'))
    // FIXME: pass an arg to skip some checks only necessary if code changed
    this.ace.renderer.scrollBar.on('scroll', $.proxy(this, 'updateHUD'))
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

      if (!lineEl) {
        hud.hide()
        return hud
      }

      var linePos = $(lineEl).offset(),
          lineCenter = linePos.top + $(lineEl).height() / 2,
          onscreen = lineCenter > 0 && lineCenter < $(window).height()
      if (onscreen) {
        hud.position({
          x: -7,
          y: lineCenter
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

$(function() {
  // TODO: move to some kind of init
  jam.transport = new Transport()
  //
  editorView = new EditorView({el: $('#editor')})
  editorView.render()
  editorView.loadCode('demo.js')

  volumeView = new VolumeView({el: $('#volume')})
  volumeView.render()

  levelsView = new LevelsMeterView({el: $('#meter')})

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
