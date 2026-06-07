/** Matches Stash TextUtils.timestampToSeconds (m:ss and h:mm:ss[.ms]). */
export function timestampToSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.includes(":")) return null;

  const splits = trimmed.split(":");
  if (splits.length > 3) return null;

  let secondsPart = splits[splits.length - 1];
  let msFrac = 0;
  if (secondsPart.includes(".")) {
    const secondsParts = secondsPart.split(".");
    if (secondsParts.length !== 2) return null;
    secondsPart = secondsParts[0];
    const msPart = Number(secondsParts[1]);
    if (!Number.isFinite(msPart)) return null;
    msFrac = msPart / 1000;
  }

  let seconds = 0;
  let factor = 1;
  const parts = [...splits];
  while (parts.length > 0) {
    const thisSplit = parts.pop();
    if (thisSplit === undefined) return null;
    const thisInt = Number(thisSplit.split(".")[0]);
    if (!Number.isFinite(thisInt)) return null;
    seconds += factor * thisInt;
    factor *= 60;
  }

  return seconds + msFrac;
}
