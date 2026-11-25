import { useEffect, useRef, useState } from 'react';
import Menu from './Menu';
import { uiSound } from '../../../lib/sound';
import './action.css';

const MenuButton: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = (): void => {
    uiSound(isMenuOpen ? 'close' : 'open');
    setIsMenuOpen((open) => !open);
  };

  const closeMenu = (): void => setIsMenuOpen(false);

  // Escape closes the open menu and puts focus back on this button. An overlay
  // opened on top (a project card, a letter) gets the Escape instead.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.body.dataset.overlayOpen) return;
      setIsMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMenuOpen]);

  return (
    <div className="social-container bg-black dark:bg-white">
      <button
        ref={toggleRef}
        type="button"
        className="social-link dark:text-white dark:bg-black"
        onClick={toggleMenu}
        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMenuOpen}
        aria-controls="main-menu"
      >
        <svg
          className={`hamburger-icon ${isMenuOpen ? 'open' : ''}`}
          viewBox="0 0 100 100"
          width="40"
          height="40"
          aria-hidden="true"
        >
          <rect className="line top" width="80" height="10" x="10" y="30" rx="6" />
          <rect className="line bottom" width="80" height="10" x="10" y="60" rx="6" />
        </svg>
      </button>
      <Menu isMenuOpen={isMenuOpen} onMenuClose={closeMenu} />
    </div>
  );
};

export default MenuButton;
