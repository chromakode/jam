sin = Voice.extend({
  attack: .05,
  release: .5,
  gain: .2,
  type: 0,
  filterType: 0,
  filterFreq: 1000,
  initialize: function() {
    this.out = ctx.createGainNode()
    this.o = ctx.createOscillator()
    this.o.type = this.type
    this.f = ctx.createBiquadFilter()
    this.f.type = this.filterType
    this.f.frequency.value = this.filterFreq
    connect(this.o, this.f, this.out)
  },

  start: function(t) {
    this.out.gain.setValueAtTime(0, t)
    this.out.gain.linearRampToValueAtTime(this.gain, t + this.attack)
    this.o.frequency.setValueAtTime(this.options.freq, t)
    this.o.noteOn(t)
  },

  stop: function(t) {
    var tail = t + this.release
    this.o.noteOff(tail)
    this.out.gain.linearRampToValueAtTime(0, tail)
  }
})

lead = sin.extend({
  attack: 0,
  release: 1,
  gain: .4,
  type: 3,
  filterType: 1,
  filterFreq: 2000,
})

bass = sin.extend({
  gain: .5
})

saw = sin.extend({
  release: 1,
  gain: .2,
  type: 2, 
  filterType: 1,
  filterFreq: 1000
})

notsaw = sin.extend({
  release: 1,
  gain: .2,
  type: 3, 
  filterType: 0,
  filterFreq: 1000
})

square = sin.extend({
  type: 1, 
  release: 1,
  gain: .15,
  filterType: 0,
  filterFreq: 2000,
  start: function(t) {
    sin.prototype.start.call(this, t)
    this.o.frequency.linearRampToValueAtTime(this.options.freq / 2, t + .1)
    this.o.frequency.setValueAtTime(this.options.freq / 2, t + .3)
  }
})

glitchsquare = sin.extend({
  type: 1, 
  release: 1,
  gain: .15,
  filterType: 0,
  filterFreq: 2000,
  start: function(t) {
    sin.prototype.start.call(this, t)
    this.o.frequency.linearRampToValueAtTime(this.options.freq / 2, t + .1)
    this.o.frequency.setValueAtTime(this.options.freq / 2, t + .25)
    this.o.frequency.linearRampToValueAtTime(this.options.freq / 4, t + .35)
    this.o.frequency.setValueAtTime(this.options.freq / 4, t + .45)
    this.o.frequency.setValueAtTime(this.options.freq, t + .5)
    this.o.frequency.setValueAtTime(this.options.freq / 4, t + .65)
    this.o.frequency.setValueAtTime(this.options.freq / 2, t + .7)
  }
})

bleepsquare = sin.extend({
  type: 1, 
  release: 1,
  gain: .15,
  filterType: 0,
  filterFreq: 2000,
  start: function(t) {
    sin.prototype.start.call(this, t)
    this.o.frequency.linearRampToValueAtTime(this.options.freq / 2, t + .1)
    this.o.frequency.setValueAtTime(this.options.freq / 2, t + .25)
    this.o.frequency.linearRampToValueAtTime(this.options.freq / 4, t + .35)
    this.o.frequency.setValueAtTime(this.options.freq / 2, t + .55)
    this.o.frequency.setValueAtTime(this.options.freq * 2, t + .68)
    this.o.frequency.setValueAtTime(this.options.freq / 4, t + .75)
  }
})

randomsquare = sin.extend({
  type: 1, 
  release: 1,
  gain: .15,
  filterType: 0,
  filterFreq: 2000,
  start: function(t) {
    sin.prototype.start.call(this, t)
    this.o.frequency.linearRampToValueAtTime(this.options.freq / 2, t + .1)
    for (var i=0; i<7; i++) {
      t += _.random(0, 5) / 100
      this.o.frequency.setValueAtTime(this.options.freq, t)
      t += _.random(0, 10) / 100
      this.o.frequency.setValueAtTime(this.options.freq / 4, t)
      this.f.frequency.setValueAtTime(_.random(200, 2000), t)
    }
  }
})

arpeggio = Pattern.extend({
  defaults: {
    duration: 1
  },
  events: function() {
    var s = new Scribe()
    s.set({voice: this.options.voice, duration: this.options.duration, wait: true})
    _.each(this.options.offsets, function(offset) {
        var note = Note.fromLatin(this.options.note.toUpperCase())
        s.play({freq: note.add(offset).frequency()})
    }, this)
    return s
  }
})

minor = ['unison', 'minor third', 'fifth', 'major second', 'minor sixth']
melody = ['minor sixth', 'minor third', 'fifth', 'unison', 'minor seventh']

bassline = Pattern.extend({
  events: function() {
    return new Scribe()
      .set({voice: 'bass', duration: 1, wait: true})
      .play({note: 'g1'})
      .wait(2)
      .play({note: 'g1'})
      .wait(2)
      .play({note: 'a1'})
      .play({note: 'g1'})
      .play({note: 'g1'})
      .wait(2)
      .play({note: 'a1'})
      .wait(2)
      .play({note: 'g1'})
      .wait(2)
      .play({note: 'g1'})
      .play({note: 'a1'})
      .play({note: 'g1'})
      .wait(2)
  }
})

leadmelody = Pattern.extend({
  events: function() {
    return new Scribe()
      .set({voice: 'lead', duration: 1, wait: true})
      .play({note: 'g6'})
      .wait(4)
      .play({note: 'a#5'})
      .play({note: 'a#5'})
      .wait(4)
      .play({note: 'g6'})
      .play({note: 'a5'})
      .play({note: 'a5'})
      .wait(6)
  }
})

leadmelody2 = Pattern.extend({
  events: function() {
    return new Scribe()
      .set({voice: this.options.voice || 'lead', duration: 1, wait: true})
      .play({note: 'g6'})
      .play({note: 'f6'})
      .wait(3)
      .play({note: 'f6'})
      .play({note: 'f6'})
      .wait(4)
      .play({note: 'd#6'})
      .play({note: 'd6'})
      .play({note: 'd6'})
      .play({note: 'd6'})
      .wait(4)
      .play({note: 'c6'})
      .play({note: 'c6'})
      .wait(6)
      .play({note: 'c6'})
      .play({note: 'c6'})
      .wait(7)
  }
})

jam.transport.set({
  tempo: 180,
  sequence: [
    {start: 5*0, end: 5*8, loop: true, pattern: 'arpeggio', voice: 'glitchsquare', note: 'g2', offsets: melody, duration: 4},
    {start: 5*0, end: 5*4, loop: true, pattern: 'arpeggio', voice: 'notsaw', note: 'g3', offsets: minor, duration: 1},
    {start: 5*0, end: 5*8, loop: true, pattern: 'arpeggio', voice: 'square', note: 'g2', offsets: melody, duration: 4},
    {start: 5*0, end: 5*4, loop: true, pattern: 'bassline'},
    {start: 5*0, end: 5*4, loop: true, pattern: 'leadmelody'},
    {start: 5*2 + 2, end: 5*4, loop: true, pattern: 'arpeggio', voice: 'saw', note: 'g3', offsets: minor, duration: 3},
    {start: 5*4 + 2, end: 5*8 + 2, loop: true, pattern: 'arpeggio', voice: 'randomsquare', note: 'g4', offsets: melody, duration: 4},
    {start: 5*4, end: 5*8, loop: true, pattern: 'arpeggio', voice: 'saw', note: 'g3', offsets: minor, duration: 1},
    {start: 5*4, end: 5*8, loop: true, pattern: 'arpeggio', voice: 'randomsquare', note: 'g3', offsets: melody, duration: 4},
    {start: 5*4, end: 5*8, loop: true, pattern: 'bassline'},
    {start: 5*4, end: 5*16, loop: true, pattern: 'leadmelody2'},
    {start: 5*8, end: 5*13, loop: true, pattern: 'arpeggio', voice: 'notsaw', note: 'g3', offsets: melody, duration: 2},
    {start: 5*8, end: 5*14, loop: true, pattern: 'arpeggio', voice: 'bleepsquare', note: 'g2', offsets: minor, duration: 4},
    {start: 5*10, end: 5*13, loop: true, pattern: 'bassline'},
    {start: 5*10, end: 5*16, loop: true, pattern: 'arpeggio', voice: 'randomsquare', note: 'g5', offsets: minor, duration: 2},
    {start: 5*13 - 3, end: 5*16 - 4, loop: true, pattern: 'arpeggio', voice: 'saw', note: 'g3', offsets: minor, duration: 1},
    {start: 5*13 - 3, end: 5*16 - 4, loop: true, pattern: 'arpeggio', voice: 'notsaw', note: 'g6', offsets: minor, duration: 3},
    {start: 5*12, end: 5*16, loop: true, pattern: 'arpeggio', voice: 'glitchsquare', note: 'g3', offsets: melody, duration: 4},
    {start: 5*12, end: 5*16, loop: true, pattern: 'bassline'},
  ]
})
