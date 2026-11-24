import { Pause, Play } from 'lucide-react';

/**
 * Pause / resume control for an auto-rotating carousel. The carousels keep
 * moving while the pointer is over them, so this button is the way to stop
 * them (keyboard focus inside a carousel also pauses it).
 */
export function CarouselToggle({
  playing,
  onToggle,
  label,
  className = '',
}: {
  playing: boolean;
  onToggle: () => void;
  label: string; // what rotates, e.g. "projects"
  className?: string;
}) {
  const Icon = playing ? Pause : Play;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!playing}
      aria-label={playing ? `Pause rotating ${label}` : `Resume rotating ${label}`}
      title={playing ? 'Pause' : 'Play'}
      className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors focus:outline-none focus-visible:ring-2 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
