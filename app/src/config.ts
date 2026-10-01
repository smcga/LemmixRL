/** Prog.Config (TConfig): the user settings, stored in the browser instead of Lemmix.config. */
import {
  DEFAULT_GAME_OPTIONS,
  DEFAULT_MISC_OPTIONS,
  GameOption,
  MiscOption,
  OptionalMechanic,
  SoundOption,
} from '../../engine/src/index.ts';

const STORAGE_KEY = 'lemmix.config';

export class Config {
  styleName = 'Orig';
  gameOptions = new Set<GameOption>(DEFAULT_GAME_OPTIONS);
  miscOptions = new Set<MiscOption>(DEFAULT_MISC_OPTIONS);
  optionalMechanics = new Set<OptionalMechanic>();
  soundOptions = new Set<SoundOption>([SoundOption.Sound, SoundOption.Music]);
  /** 0 = maximum */
  zoomFactor = 0;

  static load(): Config {
    const c = new Config();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return c;
      const j = JSON.parse(raw) as Record<string, unknown>;
      if (typeof j.styleName === 'string') c.styleName = j.styleName;
      const names = <T extends number>(e: Record<string, string | number>, v: unknown): Set<T> | null =>
        Array.isArray(v) ? new Set(v.filter((n) => typeof n === 'string' && typeof e[n] === 'number').map((n) => e[n] as T)) : null;
      c.gameOptions = names<GameOption>(GameOption, j.gameOptions) ?? c.gameOptions;
      c.miscOptions = names<MiscOption>(MiscOption, j.miscOptions) ?? c.miscOptions;
      c.optionalMechanics = names<OptionalMechanic>(OptionalMechanic, j.optionalMechanics) ?? c.optionalMechanics;
      c.soundOptions = names<SoundOption>(SoundOption, j.soundOptions) ?? c.soundOptions;
      if (typeof j.zoomFactor === 'number' && j.zoomFactor >= 0 && j.zoomFactor < 16) c.zoomFactor = j.zoomFactor;
    } catch {
      // keep defaults
    }
    return c;
  }

  save(): void {
    const j = {
      styleName: this.styleName,
      gameOptions: [...this.gameOptions].map((o) => GameOption[o]),
      miscOptions: [...this.miscOptions].map((o) => MiscOption[o]),
      optionalMechanics: [...this.optionalMechanics].map((o) => OptionalMechanic[o]),
      soundOptions: [...this.soundOptions].map((o) => SoundOption[o]),
      zoomFactor: this.zoomFactor,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(j));
    } catch {
      // not persistent
    }
  }
}
