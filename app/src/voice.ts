/** Prog.Voice (TVoiceMgr, SAPI) on the Web Speech API. Not immediate texts are cued for 500 ms; a new text restarts. */

export enum VoiceOption {
  Cheater,
  CurrentSection,
  CurrentStyle,
  GameSaved,
  ReplayFail,
  SoundFX,
  StartReplay,
  VoiceDisable,
  VoiceEnable,
}

const VoiceStrings: Record<VoiceOption, string> = {
  [VoiceOption.Cheater]: 'Cheater',
  [VoiceOption.CurrentSection]: 'Current section',
  [VoiceOption.CurrentStyle]: 'Current style',
  [VoiceOption.GameSaved]: 'Game saved',
  [VoiceOption.ReplayFail]: 'Fail',
  [VoiceOption.SoundFX]: 'Current sound',
  [VoiceOption.StartReplay]: 'Start replay',
  [VoiceOption.VoiceDisable]: 'Mute',
  [VoiceOption.VoiceEnable]: 'I will speak',
};

class VoiceMgr {
  enabled = true;
  private currentString = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  private get installed(): boolean {
    return typeof speechSynthesis !== 'undefined';
  }

  private directSpeak(s: string): void {
    if (!s) return;
    speechSynthesis.cancel(); // restart if new string
    speechSynthesis.speak(new SpeechSynthesisUtterance(s));
  }

  private cue(s: string): void {
    if (!s || this.currentString === s) return;
    this.currentString = s;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.directSpeak(this.currentString);
      this.currentString = '';
    }, 500);
  }

  speak(s: string, immediate: boolean): void {
    if (!this.installed || !this.enabled) return;
    if (immediate) this.directSpeak(s);
    else this.cue(s);
  }
}

export const voice = new VoiceMgr();

export function speak(what: VoiceOption | string, immediate: boolean, customText?: string): void {
  voice.speak(typeof what === 'string' ? what : (customText ?? VoiceStrings[what]), immediate);
}
