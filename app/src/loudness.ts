/**
 * LemmixRL: the loudness of audio as people hear it, after ITU-R BS.1770 (LUFS, as EBU R 128 uses it). Each channel is
 * K-weighted (a high shelf and a high-pass filter: the ear hears high tones as louder and deep ones as less loud),
 * its power is taken over blocks of 400 ms every 100 ms, and the integrated loudness leaves out the silence (blocks
 * under -70 LUFS) and the quiet parts (blocks more than 10 LU under the rest).
 */

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * the two filters of the K-weighting for a sample rate: the filters of BS.1770 (given for 48 kHz) designed for any
 * rate, as libebur128 does
 */
function kWeighting(rate: number): [Biquad, Biquad] {
  // the high shelf: about +4 dB above 2 kHz
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * 1681.974450955533) / rate);
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / q + k * k;
  const shelf = {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
  // the high-pass: below about 38 Hz
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * 38.13547087602444) / rate);
  a0 = 1 + k / q + k * k;
  const highPass = { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
  return [shelf, highPass];
}

/** a channel through the K-weighting, with the state of its filters */
class Channel {
  /** the last two inputs and outputs of both filters */
  private readonly state = new Float64Array(8);

  constructor(private readonly filters: [Biquad, Biquad]) {}

  /** the K-weighted samples of input into output */
  filter(input: Float32Array, output: Float64Array): void {
    const [f, g] = this.filters;
    const z = this.state;
    let [fx1, fx2, fy1, fy2, gx1, gx2, gy1, gy2] = z;
    const { b0: fb0, b1: fb1, b2: fb2, a1: fa1, a2: fa2 } = f;
    const { b0: gb0, b1: gb1, b2: gb2, a1: ga1, a2: ga2 } = g;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const y = fb0 * x + fb1 * fx1 + fb2 * fx2 - fa1 * fy1 - fa2 * fy2;
      fx2 = fx1;
      fx1 = x;
      fy2 = fy1;
      fy1 = y;
      const k = gb0 * y + gb1 * gx1 + gb2 * gx2 - ga1 * gy1 - ga2 * gy2;
      gx2 = gx1;
      gx1 = y;
      gy2 = gy1;
      gy1 = k;
      output[i] = k;
    }
    z.set([fx1, fx2, fy1, fy2, gx1, gx2, gy1, gy2]);
  }
}

const loudness = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare);

/** Measures stereo audio given in parts, one after the other. */
export class LoudnessMeter {
  private readonly left: Channel;
  private readonly right: Channel;
  private readonly segmentLength: number;
  /** the summed power of both channels of every complete 100 ms */
  private readonly segments: number[] = [];
  private sum = 0;
  private count = 0;
  /** the K-weighted samples of a part */
  private l = new Float64Array(0);
  private r = new Float64Array(0);

  constructor(sampleRate: number) {
    const filters = kWeighting(sampleRate);
    this.left = new Channel(filters);
    this.right = new Channel(filters);
    this.segmentLength = Math.round(sampleRate / 10);
  }

  add(left: Float32Array, right: Float32Array): void {
    if (this.l.length < left.length) {
      this.l = new Float64Array(left.length);
      this.r = new Float64Array(left.length);
    }
    this.left.filter(left, this.l);
    this.right.filter(right, this.r);
    const { l, r, segmentLength } = this;
    let { sum, count } = this;
    for (let i = 0; i < left.length; i++) {
      sum += l[i] * l[i] + r[i] * r[i];
      if (++count === segmentLength) {
        this.segments.push(sum / count);
        sum = 0;
        count = 0;
      }
    }
    this.sum = sum;
    this.count = count;
  }

  /** the integrated loudness in LUFS (-Infinity for silence or less than 400 ms) */
  integrated(): number {
    const blocks: number[] = [];
    for (let i = 0; i + 4 <= this.segments.length; i++) blocks.push((this.segments[i] + this.segments[i + 1] + this.segments[i + 2] + this.segments[i + 3]) / 4);
    const mean = (zs: number[]) => zs.reduce((a, b) => a + b, 0) / zs.length;
    const audible = blocks.filter((z) => loudness(z) > -70);
    if (audible.length === 0) return -Infinity;
    const relativeGate = loudness(mean(audible)) - 10;
    return loudness(mean(audible.filter((z) => loudness(z) > relativeGate)));
  }
}
