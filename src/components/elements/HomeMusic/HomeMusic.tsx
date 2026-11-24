import { Music, VolumeX } from 'lucide-react';
import { useMuted } from '../Tools/arcade/sfx';
import { useSong } from '../Tools/arcade/music';
import { ELECTRON_DRIFT } from './electronDrift';
import './homeMusic.css';

/**
 * The home page's music switch, floating in the bottom-left corner. The
 * song starts on the visitor's first click, tap or key anywhere (see
 * useSong). This button shares the arcade's mute, so one switch covers
 * the whole site. Doux loads it lazily, after the page itself.
 */
const HomeMusic: React.FC = () => {
  const [muted, setMuted] = useMuted();
  const music = useSong(ELECTRON_DRIFT);

  const label = muted ? 'Music off' : music.playing ? `Now playing: ${ELECTRON_DRIFT.title}` : 'Play music';
  const action = muted ? 'Turn music on' : music.playing ? `Mute music, now playing ${ELECTRON_DRIFT.title}` : 'Play music';

  return (
    <button
      type="button"
      data-sound-toggle
      className="home-music"
      aria-label={action}
      title={action}
      onClick={() => {
        if (muted) setMuted(false);
        else if (music.playing) return setMuted(true);
        music.start();
      }}
    >
      {muted ? (
        <VolumeX size={16} aria-hidden="true" />
      ) : music.playing ? (
        <span className="home-music__eq" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <Music size={16} aria-hidden="true" />
      )}
      <span className="home-music__label">{label}</span>
    </button>
  );
};

export default HomeMusic;
