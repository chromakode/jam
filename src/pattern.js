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
