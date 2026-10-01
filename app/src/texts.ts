/** The English texts of Base.Strings (TGlobalTexts) used by the screens. CR is the line separator of the purple font. */
import { StyleDef } from '../../engine/src/index.ts';

export const CR = '\r';

export const PROGRAM_NAME = 'Lemmix';
export const FULL_PROGRAM_NAME = 'Lemmix 3.0.0 - TypeScript';
export const SCheatCode = 'elangedijk';

export const SProgramTexts: Record<StyleDef, string> = {
  [StyleDef.Orig]: 'Original Lemmings',
  [StyleDef.Ohno]: 'Oh No More Lemmings!',
  [StyleDef.H94]: 'Holiday Lemmings 94',
  [StyleDef.X91]: 'XMas Lemmings 91',
  [StyleDef.X92]: 'XMas Lemmings 92',
  [StyleDef.User]: '%s',
};

// Note: Max size for string that fits in the scrolling reel = 34
export const SCredits = [
  'By Eric Langedijk',
  'Thanks to...',
  'DMA for the original game',
  'ccexplore for game-mechanics',
  'A. Denisov and others for Graphics32',
  'Un4seen Development for BASS at:',
  'un4seen.com',
  'The Lemmings Community at:',
  'lemmingsforums.net',
  'Volker Oth, ccexplore, Mindless, Namida, WilLEM, for sharing sourcecode, resources and technical information about lemmings',
  'Anna for support',
  'Milain for testing and ideas',
  'Arjan for clone and licence text',
  'Original credits...',
  'Lemmings By DMA Design',
  'Programming By Russell Kay',
  'Animation By Gary Timmons',
  'Graphics By Scott Johnston',
  'Music By Brian Johnston & Tim Wright',
  'PC Music By Tony Williams',
  'Copyright 1991 Psygnosis Ltd.',
];

export const SGame_ToolBar_TextTemplate = '..............OUT_.....IN_.....TIME_.-..';

export const SLevelCodeScreen_EnterCode = 'Enter Code';
export const SLevelCodeScreen_IncorrectCode = 'INCORRECT CODE';
export const SLevelCodeScreen_CodeForSectionLevel_ss = 'Code for %s' + CR + 'Level %s';

export const SPreviewScreen_Level_ss = 'Level %s %s';
export const SPreviewScreen_NumberOfLemmings_s = 'Number of Lemmings %s';
export const SPreviewScreen_ToBeSaved_s = '%s To Be Saved';
export const SPreviewScreen_ReleaseRate_s = 'Release Rate %s';
export const SPreviewScreen_Time_s = 'Time %s Minutes';
export const SPreviewScreen_Rating_s = 'Rating %s';
export const SPreviewScreen_Style_s = 'Style %s';
export const SPreviewScreen_PressMouseButtonToContinue = 'Press mouse button to continue';

export const SPostviewScreen_YourTimeIsUp = 'Your time is up!';
export const SPostviewScreen_AllLemmingsAccountedFor = 'All lemmings accounted for.';
export const SPostviewScreen_YouRescued_s = 'You rescued %s';
export const SPostviewScreen_YouNeeded_s = 'You needed  %s';
export const SPostviewScreen_YourAccessCode_ss = 'Your Access Code for Level %s' + CR + 'is %s';
export const SPostviewScreen_PressLeftMouseForNextLevel = 'Press left mouse button for next level';
export const SPostviewScreen_PressLeftMouseToRetryLevel = 'Press left mouse button to retry level';
export const SPostviewScreen_PressRightMouseForMenu = 'Press right mouse button for menu';
export const SPostviewScreen_PressMouseToContinue = 'Press mouse button to continue';
export const SPostviewScreen_YouCheater = 'Cheating apparently allowed';
export const SPostviewScreen_UnknownGameResultString = 'WOW! We do not know' + CR + 'what happened in this level';

const ResultsOrig = [
  'ROCK BOTTOM! I hope for your sake' + CR + 'that you nuked that level.',
  'Better rethink your strategy before' + CR + 'you try this level again!',
  'A little more practice on this level' + CR + 'is definitely recommended.',
  'You got pretty close that time.' + CR + 'Now try again for that few % extra.',
  'OH NO, So near and yet so far (teehee)' + CR + 'Maybe this time.....',
  "RIGHT ON. You can't get much closer" + CR + "than that. Let's try the next...",
  'That level seemed no problem to you on' + CR + 'that attempt. Onto the next....',
  'You totally stormed that level!' + CR + "Let's see if you can storm the next...",
  'Superb! You rescued every lemmings on' + CR + 'that level. Can you do it again....',
];

// result texts oh no more lemmings (#6 seems a typo but it really is enough + space + point in the original exe)
const ResultsOhNo = [
  'Oh dear, not even one poor Lemming' + CR + 'saved. Try a little harder next time.',
  'Yes, well, err, erm, maybe that is' + CR + 'NOT the way to do this level.',
  'We are not too impressed with your' + CR + 'attempt at that level!',
  'Getting close. You are either pretty' + CR + 'good, or simply lucky.',
  'Shame, You were short by a tiny amount.' + CR + 'Go for it this time.',
  'Just made it by the skin of your' + CR + 'teeth. Time to progress..',
  'More than enough .You have the makings' + CR + 'of a master Lemmings player.',
  'What a fine display of Lemmings control.' + CR + 'Take a bow then carry on with the game.',
  'WOW! You saved every Lemming.' + CR + 'TOTALLY EXCELLENT!',
];

const CongratulationOrig =
  CR + CR + 'Congratulations!' + CR + CR + CR + CR + CR +
  'Everybody here at DMA Design salutes you' + CR +
  'as a MASTER Lemmings player. Not many' + CR +
  'people will complete the Mayhem levels,' + CR +
  'you are definitely one of the elite' + CR +
  CR + CR + CR + CR + CR + 'Now hold your breath for the data disk';

const CongratulationOhNo =
  CR + CR + 'Congratulations!' + CR + CR + CR + CR + CR + CR +
  'You are truly an Excellent' + CR + 'Lemmings player' + CR + CR +
  'The Lemmings Saga continues at a' + CR + 'later date, watch this space';

export function resultStrings(def: StyleDef): readonly string[] {
  return def === StyleDef.Orig || def === StyleDef.User ? ResultsOrig : ResultsOhNo;
}

export function congratsString(def: StyleDef): string {
  return def === StyleDef.Orig || def === StyleDef.User ? CongratulationOrig : CongratulationOhNo;
}

/** Base.Utils.FormatSimple: for each argument, the first '%s' of the result so far is replaced by it. */
export function formatSimple(fmt: string, args: readonly string[]): string {
  let result = fmt;
  for (const a of args) {
    const i = result.indexOf('%s');
    if (i >= 0) result = result.slice(0, i) + a + result.slice(i + 2);
  }
  return result;
}
