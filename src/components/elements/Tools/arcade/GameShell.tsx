import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { sfx, useMuted } from './sfx';
import './arcade.css';

/**
 * Frame shared by every game: starfield background, a "◀ Games" back button,
 * the game's title, and a global mute toggle. Put the game itself in children.
 *
 * `accent` recolours buttons and boxes inside (pink | cyan | amber | green | purple).
 */
export function GameShell({
  title,
  subtitle,
  accent = 'pink',
  wide = false,
  children,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  accent?: 'pink' | 'cyan' | 'amber' | 'green' | 'purple';
  wide?: boolean;
  children: ReactNode;
  actions?: ReactNode; // extra buttons shown in the top bar, right side
}) {
  const navigate = useNavigate();
  const [muted, setMuted] = useMuted();

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Jordan's Arcade`;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className={`arcade px-accent-${accent}`}>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <button
          type="button"
          className="px-btn px-btn--small"
          onClick={() => {
            sfx.back();
            navigate('/Tools');
          }}
        >
          ◀ Games
        </button>
        <div className="flex items-center gap-3">
          {actions}
          <button
            type="button"
            className="px-btn px-btn--icon"
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            title={muted ? 'Sound off' : 'Sound on'}
            onClick={(e) => {
              setMuted(!muted);
              if (muted) setTimeout(() => sfx.select(), 0);
              // after a mouse click, give focus back to the game so Enter/Space
              // keep working there; keyboard users (detail 0) keep focus
              if (e.detail > 0) e.currentTarget.blur();
            }}
          >
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className={`mx-auto px-4 pb-16 pt-6 sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="mb-6 text-center">
          {/* On narrow phones with large text the title shrinks to the screen
              width (min with 11vw) so words stay whole; wrap-break-word is the
              last resort so it is never cut off. */}
          <h1 className="px-title text-[min(2.25rem,11vw)] wrap-break-word sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-[var(--px-dim)]">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
