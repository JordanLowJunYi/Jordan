import type { ReactNode } from 'react';
import { sfx } from '../arcade';
import type { PianoStatus } from './sound';

/** On/off switch styled as an arcade button with a little LED. */
export function Toggle({
  on,
  onChange,
  children,
  title,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="px-btn px-btn--small pn-toggle"
      aria-pressed={on}
      title={title}
      onClick={() => {
        sfx.move();
        onChange(!on);
      }}
    >
      <span className="pn-led" data-on={on || undefined} aria-hidden="true" />
      {children}
    </button>
  );
}

const STATUS_TEXT: Record<PianoStatus, string> = {
  idle: 'Tap or press a key to load the piano',
  loading: 'Tuning the grand piano…',
  ready: 'Grand piano',
  fallback: 'Synth piano (samples offline)',
};

/** Which piano sound is in use: samples loading, ready, or the synth fallback. */
export function StatusChip({ status, muted }: { status: PianoStatus; muted: boolean }) {
  return (
    <p className="pn-status" data-status={status} role="status">
      <span className="pn-status__dot" aria-hidden="true" />
      {STATUS_TEXT[status]}
      {muted && <span className="pn-status__muted">· sound is muted</span>}
    </p>
  );
}
