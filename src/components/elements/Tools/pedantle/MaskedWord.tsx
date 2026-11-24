import { memo, type CSSProperties } from 'react';

interface MaskedWordProps {
  word: string;
  revealed: boolean;
  /** -1 = not highlighted. 0 and 1 alternate so the flash replays on each new guess. */
  hit?: number;
  /** a revealed body word that is also a title word */
  titleWord?: boolean;
  /** title-row styling */
  big?: boolean;
}

/**
 * One word of the article. A hidden word is a dark pixel bar as wide as the
 * word has letters (click it to see the count). The hidden text itself is
 * never put in the DOM, so find-in-page and view-source can't give it away.
 * Screen readers hear "7 letters" through the bar's data-sr text (see CSS).
 */
function MaskedWord({ word, revealed, hit = -1, titleWord = false, big = false }: MaskedWordProps) {
  if (revealed) {
    let cls = 'pd-word';
    if (titleWord) cls += ' pd-word--title';
    if (hit >= 0) cls += ` pd-hit-${hit}`;
    return <span className={cls}>{word}</span>;
  }
  const n = [...word].length;
  return (
    <span
      className={big ? 'pd-mask pd-mask--title' : 'pd-mask'}
      style={{ '--n': n } as CSSProperties}
      data-n={n}
      data-sr={`${n} letter${n === 1 ? '' : 's'}`}
    />
  );
}

// Memoised: a guess re-renders only the words whose state changed.
export default memo(MaskedWord);
