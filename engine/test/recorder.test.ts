import { describe, expect, it } from 'vitest';
import { ByteStream } from '../src/base/stream.ts';
import { raf_EndPause, raf_StartPause, Recorder, REPLAY_HEADER_SIZE, REPLAY_RECORD_SIZE } from '../src/game/recorder.ts';

const context = { mechanics: 0, glitchPauseIterations: 0, getLevelHash: () => 0n, getLevelTitle: () => 'TEST' };

describe('Recorder (TRecorder)', () => {
  it('Truncate to a larger count appends nil items, like TList.SetCount', () => {
    const r = new Recorder();
    r.add().iteration = 5;
    r.truncate(3);
    expect(r.list.length).toBe(3);
    expect(r.list[1]).toBeNull();
    expect(r.list[2]).toBeNull();
    expect(r.lastOrDefault()).toBeNull();
  });

  it('SaveToStream deletes a trailing StartPause record', () => {
    const r = new Recorder();
    r.add().actionFlags = raf_EndPause;
    r.add().actionFlags = raf_StartPause;
    const s = new ByteStream();
    r.saveToStream(context, s);
    expect(r.list.length).toBe(1);
    expect(s.size).toBe(REPLAY_HEADER_SIZE + REPLAY_RECORD_SIZE);
  });

  it('SaveToStream raises at a nil item after writing the header and the records before it', () => {
    const r = new Recorder();
    r.add().iteration = 1;
    r.truncate(3);
    const s = new ByteStream();
    expect(() => r.saveToStream(context, s)).toThrow(TypeError);
    expect(s.size).toBe(REPLAY_HEADER_SIZE + REPLAY_RECORD_SIZE);
    expect(r.wasSaved).toBe(false);
    // the partial file does not load: its header says there are 3 records
    expect(new Recorder().loadFromBytes(s.bytes)).toMatch(/filesize mismatch/);
  });
});
