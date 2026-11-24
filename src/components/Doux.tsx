import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Hero from './elements/Hero';
import MenuButton from './elements/Menu/MenuButton';
import ProjectSection from './elements/Sections/ProjectSection';
import Highlights from './elements/Sections/Highlights/Highlights';
import Testimonials from './elements/Sections/Testimonials';
import { sections } from '../content/siteContent';

const Doux: React.FC = () => {
  const { hash } = useLocation();

  // Arriving with a #section (e.g. from a game in the arcade) scrolls to it
  // once the page has rendered.
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>

      <main id="main-content">
        <Hero />

        {sections.map((section) => (
          <div id={section.id} key={section.id}>
            {section.kind === 'projects' ? (
              <ProjectSection section={section} />
            ) : section.kind === 'testimonials' ? (
              <Testimonials section={section} />
            ) : (
              <Highlights section={section} />
            )}
          </div>
        ))}
      </main>

      <MenuButton />
    </>
  );
};

export default Doux;
