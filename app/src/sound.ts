/**
 * Game.Sound (TSoundMgr) on the Web Audio API. The game identifies sounds by the ids in DEFAULT_SOUND_IDS (the
 * TSoundEffect ordinals); the files come from Sounds.zip, the music from the style's music archive.
 */
import { type Archive, type GameSoundManager, SoundEffect, SoundEffectFileNames } from '../../engine/src/index.ts';
import { ModPlayer } from './modplayer.ts';

interface PlayingSound {
  source: AudioBufferSourceNode;
  startTime: number;
}

interface Music {
  player: ModPlayer | null;
  volume: number;
  isPlaying: boolean;
}

export class WebSoundManager implements GameSoundManager {
  readonly context: AudioContext;
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly playing = new Map<number, PlayingSound>();
  private musics: Music[] = [];
  private musicArchive: Archive | null = null;

  private constructor(context: AudioContext) {
    this.context = context;
  }

  static async create(sounds: Archive): Promise<WebSoundManager> {
    const mgr = new WebSoundManager(new AudioContext());
    for (let e = SoundEffect.BuilderWarning; e <= SoundEffect.SquishingTrap; e++) {
      const data = sounds.get(SoundEffectFileNames[e] + '.wav');
      if (!data) continue;
      try {
        mgr.buffers.set(e, await mgr.context.decodeAudioData(data.slice().buffer));
      } catch {
        // a sound that cannot be decoded stays silent
      }
    }
    return mgr;
  }

  /**
   * Browsers only start audio after a user gesture. Safari also stops it after an interruption (a call, another app):
   * its state is then "interrupted", and the next gesture starts it again.
   */
  resume(): void {
    const state: string = this.context.state;
    if (state === 'suspended' || state === 'interrupted') this.context.resume().catch(() => {});
  }

  setMusicArchive(archive: Archive | null): void {
    this.musicArchive = archive;
  }

  /**
   * SoundLibrary.PlaySound: the sound has one main channel, which restarts when it is played again, unless it has
   * been playing for at least 0.1 seconds: then a temporary second instance overlaps it.
   */
  playSound(id: number): void {
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const now = this.context.currentTime;
    const main = this.playing.get(id);
    if (main && now - main.startTime < buffer.duration) {
      if (now - main.startTime >= 0.1) {
        this.start(buffer);
        return;
      }
      try {
        main.source.stop();
      } catch {
        // already ended
      }
    }
    this.playing.set(id, { source: this.start(buffer), startTime: now });
  }

  private start(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.start();
    return source;
  }

  addMusic(fileName: string): number {
    const data = this.musicArchive?.get(fileName);
    let player: ModPlayer | null = null;
    if (data) {
      try {
        player = new ModPlayer(this.context, data);
      } catch {
        player = null;
      }
    }
    this.musics.push({ player, volume: 0.2, isPlaying: false });
    return this.musics.length - 1;
  }

  playMusic(index: number): void {
    const m = this.musics[index];
    if (!m) return;
    m.player?.play(m.volume);
    m.isPlaying = true;
  }

  stopMusic(index: number): void {
    const m = this.musics[index];
    if (!m) return;
    m.player?.stop();
    m.isPlaying = false;
  }

  clearMusics(): void {
    for (const m of this.musics) m.player?.stop();
    this.musics = [];
  }

  musicIsPlaying(index: number): boolean {
    return this.musics[index]?.isPlaying ?? false;
  }

  getMusicVolume(index: number): number {
    return this.musics[index]?.volume ?? 0;
  }

  setMusicVolume(index: number, volume: number): void {
    const m = this.musics[index];
    if (!m) return;
    m.volume = Math.min(1, Math.max(0, volume));
    m.player?.setVolume(m.volume);
  }
}
