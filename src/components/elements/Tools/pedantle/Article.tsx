import { memo, type MouseEvent } from 'react';
import MaskedWord from './MaskedWord';
import type { Segment } from './words';

/** Show the word count on a clicked bar for a moment (set on the DOM directly: no re-render). */
function peekLength(e: MouseEvent<HTMLElement>) {
  const bar = (e.target as HTMLElement).closest<HTMLElement>('.pd-mask');
  if (!bar) return;
  bar.dataset.peek = '';
  window.setTimeout(() => {
    delete bar.dataset.peek;
  }, 1200);
}

interface WordsProps {
  segments: Segment[];
  revealed: Set<string>;
  revealAll: boolean;
  highlight: Set<string>;
  flash: number;
  titleKeys?: Set<string>;
  big?: boolean;
}

/** A line of words and the text between them (gaps are plain text nodes, which need no key). */
const Words = memo(function Words({ segments, revealed, revealAll, highlight, flash, titleKeys, big }: WordsProps) {
  return (
    <>
      {segments.map((s) =>
        s.kind === 'gap' ? (
          s.text
        ) : (
          <MaskedWord
            key={s.id}
            word={s.text}
            big={big}
            revealed={revealAll || revealed.has(s.key)}
            hit={highlight.has(s.key) ? flash : -1}
            titleWord={titleKeys?.has(s.key)}
          />
        ),
      )}
    </>
  );
});

/** The article title as a big heading of bars and words. */
export const Title = memo(function Title(props: Omit<WordsProps, 'big' | 'titleKeys'> & { id?: string }) {
  const { id, ...rest } = props;
  return (
    <h2 id={id} className="pd-title" onClick={peekLength}>
      <Words {...rest} big />
    </h2>
  );
});

interface ArticleProps extends Omit<WordsProps, 'segments' | 'big'> {
  paragraphs: Segment[][];
}

/** The masked article body. Memoised so typing in the guess box never re-renders it. */
function Article({ paragraphs, ...rest }: ArticleProps) {
  return (
    <div className="pd-article" onClick={peekLength}>
      {paragraphs.map((segments, i) => (
        <p key={i}>
          <Words segments={segments} {...rest} />
        </p>
      ))}
    </div>
  );
}

export default memo(Article);
