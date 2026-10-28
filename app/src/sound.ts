/**
 * Game.Sound (TSoundMgr) on the Web Audio API. The game identifies sounds by the ids in DEFAULT_SOUND_IDS (the
 * TSoundEffect ordinals); the files come from Sounds.zip, the music from the style's music archive.
 */
import { type Archive, type GameSoundManager, SoundEffect, SoundEffectFileNames } from '../../engine/src/index.ts';
import { ModPlayer } from './modplayer.ts';
import { MUSIC_TARGET_LUFS, musicGain } from './musicloudness.ts';

interface PlayingSound {
  source: AudioBufferSourceNode;
  startTime: number;
}

/** TMusic: the volume of a level's music (Game.Sound: AddMusicFromFileName) */
const MUSIC_VOLUME = 0.2;

/**
 * LemmixRL: the sounds play 6 dB quieter than in Lemmix (below the volume of the settings): with the volumes of
 * Lemmix they were about 20 dB louder than the music.
 */
const SFX_LEVEL = 0.5;

/** LemmixRL: the music of the screens around the levels (the title, the run, the collection), looped */
const MENU_MUSIC_URL = new URL('./music/lematro_menu.mp3', import.meta.url).href;
/** its loudness (LUFS, measured with LoudnessMeter over the whole file): it is played as loud as the music of the levels */
const MENU_MUSIC_LUFS = -16.1;
/** how long it fades in and out (seconds) */
const MENU_FADE_IN = 1;
const MENU_FADE_OUT = 0.4;

interface Music {
  player: ModPlayer | null;
  volume: number;
  /** LemmixRL: the gain that brings the track to the loudness of the others (musicloudness.ts) */
  gain: number;
  isPlaying: boolean;
}

export class WebSoundManager implements GameSoundManager {
  readonly context: AudioContext;
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly playing = new Map<number, PlayingSound>();
  private musics: Music[] = [];
  private musicArchive: Archive | null = null;
  private musicStyle = '';
  /** LemmixRL: the volumes of the sounds and of the music (the settings), on top of what the game sets */
  private readonly sfxGain: GainNode;
  private readonly musicGain: GainNode;
  private musicSettingValue = 1;
  private normalize = true;
  /** LemmixRL: the music of the menus (loaded the first time it plays; it goes on where it stopped) */
  private readonly menu: {
    buffer: AudioBuffer | null;
    loading: Promise<void> | null;
    source: AudioBufferSourceNode | null;
    gain: GainNode | null;
    wanted: boolean;
    /** where it is in the track: when it started (context time, less where it started from), and where it stopped */
    startedAt: number;
    offset: number;
  } = { buffer: null, loading: null, source: null, gain: null, wanted: false, startedAt: 0, offset: 0 };
  /** LemmixRL (the music panel, ?music): a track played on its own */
  private preview: { player: ModPlayer; gain: number } | null = null;

  private constructor(context: AudioContext) {
    this.context = context;
    this.sfxGain = context.createGain();
    this.sfxGain.connect(context.destination);
    this.musicGain = context.createGain();
    this.musicGain.connect(context.destination);
  }

  /** LemmixRL: the volumes of the sounds and of the music, 0 to 1 */
  setVolumes(sfx: number, music: number): void {
    const v = (x: number) => Math.min(1, Math.max(0, x));
    // (a curve: the ear hears the square of the slider about evenly)
    this.sfxGain.gain.value = v(sfx) ** 2 * SFX_LEVEL;
    this.musicGain.gain.value = v(music) ** 2;
    this.musicSettingValue = v(music);
  }

  /** LemmixRL: the volume of the music as last set (0 to 1, 0 when the music is off) */
  get musicSetting(): number {
    return this.musicSettingValue;
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

  /** the music archive of a style (the style name finds the loudness of its tracks) */
  setMusicArchive(archive: Archive | null, styleName: string): void {
    this.musicArchive = archive;
    this.musicStyle = styleName;
  }

  /** LemmixRL: every track as loud as the others (on), or as loud as its file (off: the music panel compares them) */
  get normalizeMusic(): boolean {
    return this.normalize;
  }

  set normalizeMusic(on: boolean) {
    this.normalize = on;
    for (const m of this.musics) m.player?.setVolume(this.musicVolume(m.volume, m.gain));
    this.preview?.player.setVolume(this.musicVolume(MUSIC_VOLUME, this.preview.gain));
    this.menu.gain?.gain.setValueAtTime(this.menuVolume(), this.context.currentTime);
  }

  /** LemmixRL: the music of the menus on (it fades in, from where it stopped) or off (it fades out) */
  setMenuMusic(on: boolean): void {
    if (on === this.menu.wanted) return;
    this.menu.wanted = on;
    if (on) void this.startMenuMusic();
    else this.stopMenuMusic();
  }

  private menuVolume(): number {
    return this.musicVolume(MUSIC_VOLUME, 10 ** ((MUSIC_TARGET_LUFS - MENU_MUSIC_LUFS) / 20));
  }

  private async startMenuMusic(): Promise<void> {
    const m = this.menu;
    if (!m.buffer) {
      m.loading ??= fetch(MENU_MUSIC_URL)
        .then((r) => r.arrayBuffer())
        .then((b) => this.context.decodeAudioData(b))
        .then((b) => {
          m.buffer = b;
        })
        .catch(() => {
          // no music for the menus: they stay quiet
        });
      await m.loading;
    }
    // (it may have been turned off, or on again, while it loaded)
    if (!m.buffer || !m.wanted || m.source) return;
    const t = this.context.currentTime;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.menuVolume(), t + MENU_FADE_IN);
    gain.connect(this.musicGain);
    const source = this.context.createBufferSource();
    source.buffer = m.buffer;
    source.loop = true;
    source.connect(gain);
    source.start(t, m.offset);
    m.startedAt = t - m.offset;
    m.source = source;
    m.gain = gain;
  }

  private stopMenuMusic(): void {
    const m = this.menu;
    if (!m.source || !m.gain || !m.buffer) return;
    const t = this.context.currentTime;
    m.offset = (t - m.startedAt) % m.buffer.duration;
    const g = m.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + MENU_FADE_OUT);
    m.source.stop(t + MENU_FADE_OUT + 0.05);
    const gain = m.gain;
    m.source.onended = () => gain.disconnect();
    m.source = null;
    m.gain = null;
  }

  /** the volume of a music player: the volume the game sets, with the gain of its track when the music is normalised */
  private musicVolume(volume: number, gain: number): number {
    return this.normalize ? volume * gain : volume;
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
    source.connect(this.sfxGain);
    source.start();
    return source;
  }

  addMusic(fileName: string): number {
    const data = this.musicArchive?.get(fileName);
    let player: ModPlayer | null = null;
    if (data) {
      try {
        player = new ModPlayer(this.context, data, this.musicGain);
      } catch {
        player = null;
      }
    }
    this.musics.push({ player, volume: MUSIC_VOLUME, gain: musicGain(this.musicStyle, fileName), isPlaying: false });
    return this.musics.length - 1;
  }

  playMusic(index: number): void {
    const m = this.musics[index];
    if (!m) return;
    this.stopPreview(); // the track of the music panel stops when a level starts its music
    m.player?.play(this.musicVolume(m.volume, m.gain));
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
    m.player?.setVolume(this.musicVolume(m.volume, m.gain));
  }

  /**
   * LemmixRL (the music panel, ?music): plays a track of a style on its own, like a level plays it (its volume, its
   * gain, then the music setting), until stopPreview. Returns false when the file cannot be played.
   */
  previewMusic(data: Uint8Array, styleName: string, fileName: string): boolean {
    this.stopPreview();
    let player: ModPlayer;
    try {
      player = new ModPlayer(this.context, data, this.musicGain);
    } catch {
      return false;
    }
    this.preview = { player, gain: musicGain(styleName, fileName) };
    player.play(this.musicVolume(MUSIC_VOLUME, this.preview.gain));
    return true;
  }

  stopPreview(): void {
    this.preview?.player.stop();
    this.preview = null;
  }

  get previewing(): boolean {
    return this.preview !== null;
  }
}
