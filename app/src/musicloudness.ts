/**
 * LemmixRL: the music of the levels, normalised. The tracks of the original games are not equally loud (Holiday 94
 * Track 01 is almost 9 dB quieter than the median track, Orig Track 19 more than 2 dB louder), so every track is played with
 * the gain that brings it to the loudness of the median track: the music as a whole stays as loud as it was.
 *
 * The loudness of every track (LUFS, ModPlayer.measure: one pass of the song, before any volume) is measured from the
 * music files once, here; app/test/music.test.ts measures them again and fails, with the new table, when they differ.
 */

const LOUDNESS: Record<string, number> = {
  'orig/track_01.mod': -11.37,
  'orig/track_02.mod': -10.44,
  'orig/track_03.mod': -12.58,
  'orig/track_04.mod': -10.82,
  'orig/track_05.mod': -12.19,
  'orig/track_06.mod': -12.61,
  'orig/track_07.mod': -12.94,
  'orig/track_08.mod': -14.1,
  'orig/track_09.mod': -13.05,
  'orig/track_10.mod': -10.39,
  'orig/track_11.mod': -11.75,
  'orig/track_12.mod': -12.05,
  'orig/track_13.mod': -10.62,
  'orig/track_14.mod': -14.11,
  'orig/track_15.mod': -13.42,
  'orig/track_16.mod': -12.16,
  'orig/track_17.mod': -13.04,
  'orig/track_18.mod': -15.67,
  'orig/track_19.mod': -9.68,
  'orig/track_20.mod': -11.53,
  'orig/track_21.mod': -11.87,
  'ohno/track_01.mod': -14.2,
  'ohno/track_02.mod': -11.95,
  'ohno/track_03.mod': -11.96,
  'ohno/track_04.mod': -11.55,
  'ohno/track_05.mod': -11.26,
  'ohno/track_06.mod': -11.28,
  'h94/track_01.mod': -20.82,
  'h94/track_02.mod': -14.12,
};

const key = (styleName: string, fileName: string) => `${styleName}/${fileName}`.toLowerCase();

/** the loudness every track is played at: that of the median track (LUFS) */
export const MUSIC_TARGET_LUFS = (() => {
  const v = Object.values(LOUDNESS).sort((a, b) => a - b);
  return (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2;
})();

/** the measured loudness of a track of a style (LUFS), undefined for a track that is not in the table */
export function musicLoudness(styleName: string, fileName: string): number | undefined {
  return LOUDNESS[key(styleName, fileName)];
}

/** the gain that brings a track of a style to MUSIC_TARGET_LUFS, in dB (0 for a track that is not in the table) */
export function musicGainDb(styleName: string, fileName: string): number {
  const l = musicLoudness(styleName, fileName);
  return l === undefined ? 0 : MUSIC_TARGET_LUFS - l;
}

/** musicGainDb as a factor of the volume */
export function musicGain(styleName: string, fileName: string): number {
  return 10 ** (musicGainDb(styleName, fileName) / 20);
}

