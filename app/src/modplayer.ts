/**
 * A small ProTracker (M.K., 4 channels, 31 samples) player for the Lemmings music, standing in for the BASS library
 * (BASS_MusicLoad with BASS_MUSIC_LOOP: the song restarts when it ends).
 */

const PAULA_CLOCK = 3546894.6; // PAL
const ROWS = 64;
const CHANNELS = 4;

// ProTracker periods of finetune 0, C-1 .. B-3
const BASE_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190, 180, 170,
  160, 151, 143, 135, 127, 120, 113,
];

const SINE = Array.from({ length: 32 }, (_, i) => Math.round(255 * Math.sin((Math.PI * i) / 32)));

interface Sample {
  data: Float32Array;
  length: number;
  finetune: number;
  volume: number;
  loopStart: number;
  loopLength: number;
}

interface Note {
  sample: number;
  period: number;
  effect: number;
  param: number;
}

class Channel {
  sample: Sample | null = null;
  pos = 0;
  playing = false;
  period = 0;
  basePeriod = 0;
  volume = 0;
  finetune = 0;
  portaTarget = 0;
  portaSpeed = 0;
  vibratoSpeed = 0;
  vibratoDepth = 0;
  vibratoPos = 0;
  vibratoWave = 0;
  tremoloSpeed = 0;
  tremoloDepth = 0;
  tremoloPos = 0;
  tremoloWave = 0;
  tremoloDelta = 0;
  arpeggio = 0;
  offsetMemory = 0;
  loopRow = 0;
  loopCount = 0;
  periodDelta = 0;
  note: Note = { sample: 0, period: 0, effect: 0, param: 0 };
  delayedNote: Note | null = null;
  pan = 0;
}

function finetunedPeriod(period: number, finetune: number): number {
  if (finetune === 0) return period;
  // the closest note of the table, shifted by the finetune (1/8 semitone steps)
  let best = BASE_PERIODS[0];
  for (const p of BASE_PERIODS) if (Math.abs(p - period) < Math.abs(best - period)) best = p;
  return Math.round(best * Math.pow(2, -finetune / 96));
}

function waveValue(wave: number, pos: number): number {
  const p = pos & 63;
  switch (wave & 3) {
    case 1: // ramp down
      return p < 32 ? 255 - p * 8 : -(p - 32) * 8;
    case 2: // square
      return p < 32 ? 255 : -255;
    default:
      return p < 32 ? SINE[p] : -SINE[p - 32];
  }
}

export class ModPlayer {
  private readonly samples: Sample[] = [];
  private readonly order: number[] = [];
  private readonly patterns: Note[][] = [];
  private readonly songLength: number;
  private readonly channels: Channel[] = [];
  private node: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;
  private readonly rate: number;
  // playback state
  private position = 0;
  private row = 0;
  private tick = 0;
  private speed = 6;
  private tempo = 125;
  private tickSamples = 0;
  private samplesLeft = 0;
  private patternDelay = 0;
  private breakRow = -1;
  private jumpPosition = -1;

  constructor(
    private readonly context: AudioContext,
    data: Uint8Array,
  ) {
    if (data.length < 1084 || String.fromCharCode(...data.subarray(1080, 1084)) !== 'M.K.') throw new Error('unsupported module');
    this.rate = context.sampleRate;
    const word = (o: number) => (data[o] << 8) | data[o + 1];
    this.songLength = Math.max(1, data[950]);
    let maxPattern = 0;
    for (let i = 0; i < 128; i++) {
      this.order.push(data[952 + i]);
      if (i < this.songLength) maxPattern = Math.max(maxPattern, data[952 + i]);
    }
    let ofs = 1084;
    for (let p = 0; p <= maxPattern; p++) {
      const notes: Note[] = [];
      for (let i = 0; i < ROWS * CHANNELS; i++) {
        const b0 = data[ofs] ?? 0;
        const b1 = data[ofs + 1] ?? 0;
        const b2 = data[ofs + 2] ?? 0;
        const b3 = data[ofs + 3] ?? 0;
        notes.push({ sample: (b0 & 0xf0) | (b2 >> 4), period: ((b0 & 0x0f) << 8) | b1, effect: b2 & 0x0f, param: b3 });
        ofs += 4;
      }
      this.patterns.push(notes);
    }
    for (let s = 0; s < 31; s++) {
      const h = 20 + s * 30;
      const length = word(h + 22) * 2;
      const ft = data[h + 24] & 0x0f;
      const loopStart = word(h + 26) * 2;
      const loopLength = word(h + 28) * 2;
      const raw = data.subarray(ofs, ofs + length);
      ofs += length;
      const f = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) f[i] = ((raw[i] << 24) >> 24) / 128;
      this.samples.push({
        data: f,
        length: f.length,
        finetune: ft > 7 ? ft - 16 : ft,
        volume: Math.min(64, data[h + 25]),
        loopStart,
        loopLength: loopLength > 2 && loopStart + loopLength <= f.length ? loopLength : 0,
      });
    }
    for (let c = 0; c < CHANNELS; c++) {
      const ch = new Channel();
      ch.pan = c === 0 || c === 3 ? -0.6 : 0.6; // Amiga LRRL, not fully separated
      this.channels.push(ch);
    }
  }

  play(volume: number): void {
    this.stop();
    this.position = 0;
    this.row = 0;
    this.tick = 0;
    this.speed = 6;
    this.tempo = 125;
    this.patternDelay = 0;
    this.breakRow = -1;
    this.jumpPosition = -1;
    for (const ch of this.channels) {
      const pan = ch.pan;
      Object.assign(ch, new Channel());
      ch.pan = pan;
    }
    this.setTickSamples();
    this.samplesLeft = 0;
    this.gain = this.context.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(this.context.destination);
    this.node = this.context.createScriptProcessor(4096, 0, 2);
    this.node.onaudioprocess = (e) => this.render(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));
    this.node.connect(this.gain);
  }

  stop(): void {
    if (this.node) {
      this.node.disconnect();
      this.node.onaudioprocess = null;
      this.node = null;
    }
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }
  }

  setVolume(volume: number): void {
    if (this.gain) this.gain.gain.value = volume;
  }

  private setTickSamples(): void {
    this.tickSamples = (this.rate * 2.5) / this.tempo;
  }

  private render(left: Float32Array, right: Float32Array): void {
    let i = 0;
    const n = left.length;
    while (i < n) {
      if (this.samplesLeft <= 0) {
        this.processTick();
        this.samplesLeft += this.tickSamples;
      }
      const count = Math.min(n - i, Math.ceil(this.samplesLeft));
      left.fill(0, i, i + count);
      right.fill(0, i, i + count);
      for (const ch of this.channels) this.mix(ch, left, right, i, count);
      i += count;
      this.samplesLeft -= count;
    }
  }

  private mix(ch: Channel, left: Float32Array, right: Float32Array, start: number, count: number): void {
    const s = ch.sample;
    if (!ch.playing || !s || s.length === 0 || ch.period <= 0) return;
    const period = Math.max(113 / 2, ch.period + ch.periodDelta);
    const step = PAULA_CLOCK / period / this.rate;
    const vol = (Math.min(64, Math.max(0, ch.volume + ch.tremoloDelta)) / 64) * 0.5;
    const lv = vol * (1 - ch.pan) * 0.5;
    const rv = vol * (1 + ch.pan) * 0.5;
    const data = s.data;
    const loopEnd = s.loopLength ? s.loopStart + s.loopLength : s.length;
    let pos = ch.pos;
    for (let k = start; k < start + count; k++) {
      if (pos >= loopEnd) {
        if (!s.loopLength) {
          ch.playing = false;
          break;
        }
        pos = s.loopStart + ((pos - s.loopStart) % s.loopLength);
      }
      const ip = pos | 0;
      const a = data[ip];
      const b = ip + 1 < loopEnd ? data[ip + 1] : s.loopLength ? data[s.loopStart] : 0;
      const v = a + (b - a) * (pos - ip);
      left[k] += v * lv;
      right[k] += v * rv;
      pos += step;
    }
    ch.pos = pos;
  }

  private processTick(): void {
    if (this.tick === 0) {
      if (this.patternDelay > 0) this.patternDelay--;
      else this.processRow();
    } else {
      for (const ch of this.channels) this.tickEffects(ch);
    }
    this.tick++;
    if (this.tick >= this.speed) {
      this.tick = 0;
      if (this.patternDelay > 0) return;
      this.nextRow();
    }
  }

  private nextRow(): void {
    if (this.jumpPosition >= 0 || this.breakRow >= 0) {
      this.position = this.jumpPosition >= 0 ? this.jumpPosition : this.position + 1;
      this.row = this.breakRow >= 0 ? this.breakRow : 0;
      this.jumpPosition = -1;
      this.breakRow = -1;
    } else {
      this.row++;
      if (this.row >= ROWS) {
        this.row = 0;
        this.position++;
      }
    }
    if (this.position >= this.songLength) this.position = 0; // BASS_MUSIC_LOOP
  }

  private trigger(ch: Channel, note: Note): void {
    if (note.sample > 0 && note.sample <= 31) {
      const s = this.samples[note.sample - 1];
      ch.sample = s;
      ch.volume = s.volume;
      ch.finetune = s.finetune;
    }
    if (note.period > 0) {
      const p = finetunedPeriod(note.period, ch.finetune);
      if (note.effect === 3 || note.effect === 5) {
        ch.portaTarget = p;
      } else {
        ch.period = p;
        ch.basePeriod = p;
        ch.pos = 0;
        ch.playing = true;
        if (!(ch.vibratoWave & 4)) ch.vibratoPos = 0;
        if (!(ch.tremoloWave & 4)) ch.tremoloPos = 0;
        if (note.effect === 9) {
          if (note.param) ch.offsetMemory = note.param * 256;
          ch.pos = ch.offsetMemory;
        }
      }
    }
  }

  private processRow(): void {
    const pattern = this.patterns[this.order[this.position]];
    if (!pattern) return;
    for (let c = 0; c < CHANNELS; c++) {
      const ch = this.channels[c];
      const note = pattern[this.row * CHANNELS + c];
      ch.note = note;
      ch.periodDelta = 0;
      ch.tremoloDelta = 0;
      const { effect, param } = note;
      const x = param >> 4;
      const y = param & 15;
      if (effect === 0x0e && x === 0x0d && y > 0) {
        ch.delayedNote = note; // note delay
      } else this.trigger(ch, note);
      switch (effect) {
        case 0x3:
          if (param) ch.portaSpeed = param;
          break;
        case 0x4:
          if (x) ch.vibratoSpeed = x;
          if (y) ch.vibratoDepth = y;
          break;
        case 0x7:
          if (x) ch.tremoloSpeed = x;
          if (y) ch.tremoloDepth = y;
          break;
        case 0xb:
          this.jumpPosition = param;
          break;
        case 0xc:
          ch.volume = Math.min(64, param);
          break;
        case 0xd:
          this.breakRow = Math.min(63, x * 10 + y);
          if (this.jumpPosition < 0) this.jumpPosition = this.position + 1;
          break;
        case 0xe:
          switch (x) {
            case 0x1:
              ch.period = Math.max(113, ch.period - y);
              break;
            case 0x2:
              ch.period = Math.min(856 * 2, ch.period + y);
              break;
            case 0x4:
              ch.vibratoWave = y;
              break;
            case 0x5:
              ch.finetune = y > 7 ? y - 16 : y;
              break;
            case 0x6:
              if (y === 0) ch.loopRow = this.row;
              else {
                if (ch.loopCount === 0) ch.loopCount = y;
                else ch.loopCount--;
                if (ch.loopCount > 0) {
                  this.breakRow = ch.loopRow;
                  this.jumpPosition = this.position;
                }
              }
              break;
            case 0x7:
              ch.tremoloWave = y;
              break;
            case 0xa:
              ch.volume = Math.min(64, ch.volume + y);
              break;
            case 0xb:
              ch.volume = Math.max(0, ch.volume - y);
              break;
            case 0xe:
              this.patternDelay = y;
              break;
          }
          break;
        case 0xf:
          if (param === 0) break;
          if (param < 32) this.speed = param;
          else {
            this.tempo = param;
            this.setTickSamples();
          }
          break;
      }
    }
  }

  private tickEffects(ch: Channel): void {
    const { effect, param } = ch.note;
    const x = param >> 4;
    const y = param & 15;
    ch.periodDelta = 0;
    switch (effect) {
      case 0x0:
        if (param) {
          const t = this.tick % 3;
          const semis = t === 1 ? x : t === 2 ? y : 0;
          ch.periodDelta = Math.round(ch.period * Math.pow(2, -semis / 12)) - ch.period;
        }
        break;
      case 0x1:
        ch.period = Math.max(113, ch.period - param);
        break;
      case 0x2:
        ch.period = Math.min(856 * 2, ch.period + param);
        break;
      case 0x3:
        this.tonePorta(ch);
        break;
      case 0x4:
        this.vibrato(ch);
        break;
      case 0x5:
        this.tonePorta(ch);
        this.volumeSlide(ch, param);
        break;
      case 0x6:
        this.vibrato(ch);
        this.volumeSlide(ch, param);
        break;
      case 0x7:
        ch.tremoloDelta = (waveValue(ch.tremoloWave, ch.tremoloPos) * ch.tremoloDepth) >> 6;
        ch.tremoloPos += ch.tremoloSpeed;
        break;
      case 0xa:
        this.volumeSlide(ch, param);
        break;
      case 0xe:
        if (x === 0x9 && y > 0 && this.tick % y === 0) ch.pos = 0; // retrigger
        else if (x === 0xc && this.tick === y) ch.volume = 0; // note cut
        else if (x === 0xd && this.tick === y && ch.delayedNote) {
          this.trigger(ch, { ...ch.delayedNote, effect: 0 });
          ch.delayedNote = null;
        }
        break;
    }
  }

  private tonePorta(ch: Channel): void {
    if (!ch.portaTarget) return;
    if (ch.period < ch.portaTarget) ch.period = Math.min(ch.portaTarget, ch.period + ch.portaSpeed);
    else if (ch.period > ch.portaTarget) ch.period = Math.max(ch.portaTarget, ch.period - ch.portaSpeed);
  }

  private vibrato(ch: Channel): void {
    ch.periodDelta = (waveValue(ch.vibratoWave, ch.vibratoPos) * ch.vibratoDepth) >> 7;
    ch.vibratoPos += ch.vibratoSpeed;
  }

  private volumeSlide(ch: Channel, param: number): void {
    const x = param >> 4;
    const y = param & 15;
    if (x) ch.volume = Math.min(64, ch.volume + x);
    else ch.volume = Math.max(0, ch.volume - y);
  }
}
