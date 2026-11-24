import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { DialogueBox, load, save, sfx, useMuted } from '../arcade';
import { useComputerKeys, useVoices } from './hooks';
import { Keyboard, type KeyMark } from './Keyboard';
import { INTERVAL_NAMES, MIDDLE_C, isBlack, noteName, pick, range } from './notes';
import { playFor, preloadRange } from './sound';

type Difficulty = 'white' | 'all' | 'interval';
type Phase = 'idle' | 'listening' | 'feedback';
type Question = { root: number | null; answer: number };

const LOW = MIDDLE_C; // C4
const HIGH = MIDDLE_C + 24; // C6

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'white', label: 'White keys', blurb: 'One note, white keys only.' },
  { id: 'all', label: 'All keys', blurb: 'One note, any key.' },
  { id: 'interval', label: 'Intervals', blurb: 'Two notes: the first is marked, find the second.' },
];

const POOLS: Record<'white' | 'all', number[]> = {
  white: range(LOW, HIGH).filter((m) => !isBlack(m)),
  all: range(LOW, HIGH - 1),
};

function makeQuestion(difficulty: Difficulty, previous: Question | null): Question {
  for (let tries = 0; tries < 20; tries++) {
    let q: Question;
    if (difficulty === 'interval') {
      const root = LOW + Math.floor(Math.random() * 12); // C4..B4
      q = { root, answer: root + 1 + Math.floor(Math.random() * 12) }; // a 2nd up to an octave
    } else {
      q = { root: null, answer: pick(POOLS[difficulty]) };
    }
    if (q.answer !== previous?.answer || q.root !== previous?.root) return q;
  }
  return { root: null, answer: LOW };
}

const isDifficulty = (v: unknown): v is Difficulty => v === 'white' || v === 'all' || v === 'interval';

function streakLine(streak: number, newBest: boolean): string {
  if (streak >= 10 && streak % 5 === 0) return ` ${streak} in a row. Golden ears!`;
  if (streak === 5) return ' Five in a row!';
  if (streak === 3) return ' Three in a row!';
  if (newBest && streak > 1) return ' New best streak!';
  return '';
}

/** Ear training: hear a mystery note (or interval) and find it on the keyboard. */
export function EarTraining({ names, letters }: { names: boolean; letters: boolean }) {
  const [muted] = useMuted();
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const saved = load<unknown>('piano:difficulty', 'white');
    return isDifficulty(saved) ? saved : 'white';
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const [question, setQuestion] = useState<Question | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<number, KeyMark>>(() => new Map());
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState<Record<Difficulty, number>>(() => ({
    white: 0,
    all: 0,
    interval: 0,
    ...load<Partial<Record<Difficulty, number>>>('piano:best', {}),
  }));
  const [feedback, setFeedback] = useState<{ lines: string[]; good: boolean } | null>(null);

  // Refs so a burst of key presses in one tick only counts once.
  const phaseRef = useRef<Phase>('idle');
  const questionRef = useRef<Question | null>(null);
  const streakRef = useRef(0);
  const cancels = useRef<(() => void)[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => preloadRange(LOW, HIGH), []);
  useEffect(() => save('piano:difficulty', difficulty), [difficulty]);

  const hush = useCallback(() => {
    cancels.current.forEach((c) => c());
    cancels.current = [];
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => hush, [hush]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const playQuestion = useCallback(
    (q: Question) => {
      hush();
      if (q.root !== null) {
        cancels.current.push(playFor(q.root, 1.1), playFor(q.answer, 1.6, 0.8));
      } else {
        cancels.current.push(playFor(q.answer, 1.8));
      }
    },
    [hush],
  );

  const ask = useCallback(
    () => {
      const q = makeQuestion(difficulty, questionRef.current);
      questionRef.current = q;
      phaseRef.current = 'listening';
      setQuestion(q);
      setPhase('listening');
      setFeedback(null);
      setMarks(q.root !== null ? new Map([[q.root, 'root']]) : new Map());
      playQuestion(q);
    },
    [difficulty, playQuestion],
  );

  const answer = useCallback(
    (guess: number) => {
      const q = questionRef.current;
      if (phaseRef.current !== 'listening' || !q) return;
      if (q.root !== null && guess === q.root) return; // re-hearing the first note isn't a guess
      phaseRef.current = 'feedback';
      hush();

      const good = guess === q.answer;
      const nextStreak = good ? streakRef.current + 1 : 0;
      streakRef.current = nextStreak;
      const newBest = nextStreak > best[difficulty];
      if (newBest) {
        const updated = { ...best, [difficulty]: nextStreak };
        setBest(updated);
        save('piano:best', updated);
      }
      setStreak(nextStreak);
      setScore((s) => ({ right: s.right + (good ? 1 : 0), total: s.total + 1 }));

      const m = new Map<number, KeyMark>();
      if (q.root !== null) m.set(q.root, 'root');
      if (good) m.set(q.answer, 'correct');
      else {
        m.set(guess, 'wrong');
        m.set(q.answer, 'answer');
      }
      setMarks(m);

      const what =
        q.root !== null
          ? `a ${INTERVAL_NAMES[q.answer - q.root]}, ${noteName(q.root)} up to ${noteName(q.answer)}`
          : noteName(q.answer);
      let line: string;
      if (good) {
        later(() => sfx.good(), 220);
        line = `Correct! That was ${what}.${streakLine(nextStreak, newBest)}`;
      } else {
        later(() => sfx.bad(), 120);
        // Let them hear the right one straight after their guess.
        later(() => cancels.current.push(playFor(q.answer, 1.4)), 750);
        line = `Not quite: you played ${noteName(guess)}. It was ${what}, the key flashing green.`;
      }
      setFeedback({ lines: [line], good });
      setPhase('feedback');
    },
    [best, difficulty, hush, later],
  );

  const reveal = () => {
    const q = questionRef.current;
    if (!q || phaseRef.current !== 'listening') return;
    phaseRef.current = 'feedback';
    hush();
    streakRef.current = 0;
    setStreak(0);
    setScore((s) => ({ ...s, total: s.total + 1 }));
    const m = new Map<number, KeyMark>([[q.answer, 'answer']]);
    if (q.root !== null) m.set(q.root, 'root');
    setMarks(m);
    cancels.current.push(playFor(q.answer, 1.6));
    const what =
      q.root !== null ? `a ${INTERVAL_NAMES[q.answer - q.root]} up to ${noteName(q.answer)}` : noteName(q.answer);
    setFeedback({ lines: [`It was ${what}. Listen to it once more, then try another.`], good: false });
    setPhase('feedback');
    sfx.back();
  };

  const changeDifficulty = (d: Difficulty) => {
    if (d === difficulty) return;
    sfx.select();
    hush();
    setDifficulty(d);
    setScore({ right: 0, total: 0 });
    setStreak(0);
    streakRef.current = 0;
    questionRef.current = null;
    phaseRef.current = 'idle';
    setQuestion(null);
    setPhase('idle');
    setFeedback(null);
    setMarks(new Map());
  };

  const onNoteOn = useCallback((midi: number) => answer(midi), [answer]);
  const { lit, press, release } = useVoices(onNoteOn);
  useComputerKeys(LOW, true, press, release);

  const lines = useMemo(() => feedback?.lines ?? [], [feedback]);
  const blurb = DIFFICULTIES.find((d) => d.id === difficulty)!.blurb;

  return (
    <div className="grid gap-4">
      <div className="pn-diff" role="group" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            className="px-btn px-btn--small"
            aria-pressed={difficulty === d.id}
            onClick={() => changeDifficulty(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="pn-stats px-box px-box--soft" aria-label="Score">
        <div>
          <span className="px-label">Score</span>
          <b>
            {score.right}/{score.total}
          </b>
        </div>
        <div>
          <span className="px-label">Streak</span>
          <b key={streak} className={streak > 0 ? 'pn-pop' : undefined}>
            {streak}
            {streak >= 3 && <span className="pn-stats__fire" aria-hidden="true"> ★</span>}
          </b>
        </div>
        <div>
          <span className="px-label">Best</span>
          <b>{best[difficulty]}</b>
        </div>
      </div>

      {phase === 'feedback' && feedback ? (
        <DialogueBox
          speaker="Maestro"
          lines={lines}
          onDone={() => ask()}
          className={feedback.good ? 'pn-dialogue pn-dialogue--good' : 'pn-dialogue pn-dialogue--bad'}
        />
      ) : (
        <div className="px-box px-dialogue pn-dialogue" aria-live="polite">
          <span className="px-dialogue__speaker">Maestro</span>
          <p className="m-0">
            {phase === 'idle'
              ? `${blurb} Press Play, listen, then find the note on the keyboard.`
              : question && question.root !== null
                ? 'Two notes. The first is marked “1st”: which key was the second?'
                : 'Which note was that? Play it on the keyboard.'}
          </p>
          {muted && <p className="m-0 mt-2 text-[var(--px-amber)]">Sound is muted: unmute at the top right to hear the notes.</p>}
        </div>
      )}

      <div className="pn-actions">
        {phase === 'idle' && (
          <button type="button" className="px-btn" onClick={() => ask()}>
            <Play size={16} aria-hidden="true" /> Play mystery note
          </button>
        )}
        {phase === 'listening' && question && (
          <>
            <button type="button" className="px-btn px-btn--small" onClick={() => playQuestion(question)}>
              <RotateCcw size={14} aria-hidden="true" /> Replay
            </button>
            {question.root === null && (
              <button
                type="button"
                className="px-btn px-btn--small"
                onClick={() => {
                  hush();
                  cancels.current.push(playFor(MIDDLE_C, 1.4));
                }}
                title="Hear middle C as a reference"
              >
                Hear C4
              </button>
            )}
            <button type="button" className="px-btn px-btn--small" onClick={reveal}>
              Show answer
            </button>
          </>
        )}
        {phase === 'feedback' && question && (
          <>
            <button type="button" className="px-btn px-btn--small" onClick={() => playQuestion(question)}>
              <RotateCcw size={14} aria-hidden="true" /> Hear it again
            </button>
            <button type="button" className="px-btn px-btn--small" onClick={() => ask()}>
              Next ▶
            </button>
          </>
        )}
      </div>

      <div className="px-box pn-panel">
        <Keyboard
          low={LOW}
          high={HIGH}
          lit={lit}
          marks={marks}
          showNames={names}
          letterBase={letters ? LOW : null}
          onPress={press}
          onRelease={release}
          label="Answer keyboard, C4 to C6"
          lidText="EAR TRAINER"
        />
      </div>

      <p className="pn-help">
        Your guess is the first key you play after the mystery note (keys and the computer keyboard both count). After an
        answer, play around freely to compare, then press Enter or click the message for the next note.
      </p>
    </div>
  );
}
