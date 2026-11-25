import { useEffect, useRef, useState } from 'react';
import Slider from 'react-slick';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DNA from '../../standards/backgrounds/DNA';
import { useReveal } from '../../../lib/useReveal';
import { prefersReducedMotion } from '../../../lib/motion';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { useSlickFocusGuard } from '../../../lib/useSlickFocusGuard';
import Semiconductor from '../../standards/backgrounds/Semiconductor';
import Standard from '../../standards/backgrounds/Standard';
import { ManhattanHero } from './BME/ManhattanHero';
import { CarouselToggle } from './CarouselToggle';
import type { BackgroundKey, ProjectCard, Section } from '../../../content/siteContent';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';

type ProjectsSection = Extract<Section, { kind: 'projects' }>;

function Background({ kind }: { kind: BackgroundKey }) {
  switch (kind) {
    case 'dna':
      return <DNA />;
    case 'semiconductor':
      return <Semiconductor />;
    case 'standard':
      return <Standard />;
    default:
      return null;
  }
}

/**
 * The image / animated visual for a card. Shared by the carousel tile and the
 * expanded modal so the manhattan-plot, gradient-placeholder and imagePlate
 * behaviours all live in exactly one place.
 */
function CardVisual({ card }: { card: ProjectCard }) {
  if (card.visual === 'manhattan') {
    return <ManhattanHero />;
  }
  return (
    <>
      {/* Gradient placeholder — base layer, shown when no image or on error */}
      <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-40`} />
      {card.image && (
        <img
          src={card.image}
          alt={card.title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full ${
            card.imagePlate ? 'object-contain' : 'object-cover'
          }`}
          style={card.imagePlate ? { backgroundColor: card.imagePlate } : undefined}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
    </>
  );
}

/**
 * A compact carousel slide: just the visual and the title. Clicking (or pressing
 * Enter/Space on) it opens the full description in a modal.
 *
 * react-slick wraps each slide in divs of its own and passes this element only
 * a width style, which we forward. Its aria-hidden for off-screen and cloned
 * slides lands on those wrappers, so useSlickFocusGuard keeps hidden tiles out
 * of the Tab order.
 */
function ProjectCardTile({
  card,
  onOpen,
  style,
}: {
  card: ProjectCard;
  onOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="px-3 pb-2" style={style}>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="group relative block w-full h-80 sm:h-[22rem] overflow-hidden rounded-3xl border border-pink-500/30 shadow-2xl shadow-pink-500/10 bg-gradient-to-br from-pink-900/40 to-purple-900/30 backdrop-blur-md text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
      >
        {/* Visual */}
        <div className="absolute inset-0 overflow-hidden">
          <CardVisual card={card} />
        </div>

        {/* Scrim so the title stays legible over any image, including the
            white-plate cards where the title would otherwise sit over white. */}
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/95 via-black/70 to-transparent" />

        {/* Title + expand hint */}
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{card.title}</h2>
          <span className="mt-2 inline-flex items-center gap-1 text-sm text-pink-200/90 opacity-80 transition-opacity group-hover:opacity-100">
            Click to read more <span aria-hidden="true">→</span>
          </span>
        </div>
      </button>
    </div>
  );
}

/**
 * The expanded card. Rendered as an accessible modal dialog: Escape and a
 * backdrop click close it, focus is trapped inside while open and restored to
 * the trigger on close, and the page behind it is scroll-locked.
 */
function ProjectModal({
  card,
  featuresLabel,
  onClose,
}: {
  card: ProjectCard;
  featuresLabel: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `project-modal-title-${card.id}`;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Move focus into the dialog once it mounts.
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      // Simple focus trap — keep Tab cycling within the dialog.
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Scroll-lock the page behind the dialog, and hide the floating menu button
    // and music switch (see action.css), which otherwise sit over the close
    // button on phones and take its taps.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.overlayOpen = 'true';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      delete document.body.dataset.overlayOpen;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div ref={panelRef} className="relative z-10 w-full max-w-5xl">
        {/* Close. It sits outside the scrolling box below, so it stays in reach
            after scrolling down through the details on a phone. */}
        <button
          type="button"
          data-autofocus
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/90 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            ×
          </span>
        </button>

        <div className="max-h-[90vh] overflow-y-auto rounded-3xl border border-pink-500/30 shadow-2xl shadow-pink-500/20 bg-gradient-to-br from-pink-950/90 to-purple-950/90 backdrop-blur-md">
          <div className="flex flex-col lg:flex-row">
            {/* Visual */}
            <div className="lg:w-1/2 h-64 sm:h-80 lg:h-auto lg:min-h-[420px] relative overflow-hidden">
              <CardVisual card={card} />
            </div>

            {/* Details */}
            <div className="lg:w-1/2 p-8 flex flex-col justify-center">
              <div className="mb-6">
                <h2 id={titleId} className="text-3xl font-bold text-white mb-2">
                  {card.title}
                </h2>
                <p className="text-gray-400 text-lg">{card.subtitle}</p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-pink-100 mb-4">{featuresLabel}</h3>
                <ul className="space-y-3 text-gray-300 text-base leading-relaxed">
                  {card.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-pink-400 mt-1">•</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {card.link && (
                  <a
                    href={card.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-5 text-pink-300 hover:text-pink-200 transition-colors underline underline-offset-4"
                  >
                    {card.link.label} <span aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Themed carousel arrow. react-slick clones the element it is given and injects
 * `onClick` (plus className/currentSlide/slideCount, which we deliberately drop
 * so they never reach the DOM), so we render our own button and use only onClick.
 */
function CarouselArrow({
  direction,
  onClick,
}: {
  direction: 'prev' | 'next';
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const isPrev = direction === 'prev';
  const Icon = isPrev ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? 'Previous project' : 'Next project'}
      className={`absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-pink-400/40 bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-100 shadow-lg shadow-pink-500/20 backdrop-blur-md transition-colors duration-200 hover:border-pink-300/80 hover:from-pink-500/40 hover:to-purple-500/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 ${
        isPrev ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

const ProjectSection: React.FC<{ section: ProjectsSection }> = ({ section }) => {
  const scopeRef = useRef<HTMLDivElement>(null);
  useReveal(scopeRef, '[data-reveal]', { y: 40, start: 'top 82%' });

  const [activeCard, setActiveCard] = useState<ProjectCard | null>(null);
  const featuresLabel = section.featuresLabel ?? 'Key Features';
  const sliderRef = useRef<Slider>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  useSlickFocusGuard(carouselRef);

  // Distinguish a click from a swipe: react-slick fires onClick even at the end
  // of a drag, so we track how far the pointer moved and ignore "clicks" that
  // were really drags.
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const cardCount = section.cards.length;
  // Auto-rotate, but never for reduced-motion users, and only when there is more
  // than one card to rotate through.
  const autoplayEnabled = !prefersReducedMotion() && cardCount > 1;
  // Whether the visitor wants rotation on (the pause button flips it).
  const [playing, setPlaying] = useState(autoplayEnabled);

  const openCard = (card: ProjectCard, e: React.MouseEvent<HTMLButtonElement>) => {
    // Keyboard activation (Enter/Space) reports detail 0 and never involves a
    // drag, so the swipe guard applies only to real pointer clicks. Without this
    // a stale didDrag from an earlier swipe would silently swallow keyboard opens.
    if (e.detail !== 0 && didDrag.current) return;
    // Freeze rotation while the reader is looking at the expanded card.
    sliderRef.current?.slickPause();
    setActiveCard(card);
  };

  const closeCard = () => {
    setActiveCard(null);
    if (playing) sliderRef.current?.slickPlay();
  };

  const togglePlaying = () => {
    if (playing) sliderRef.current?.slickPause();
    else sliderRef.current?.slickPlay();
    setPlaying(!playing);
  };

  // Cards side by side: 1 on phones, 2 on tablets, 3 on wide screens.
  const isPhone = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const perView = Math.min(isPhone ? 1 : isTablet ? 2 : 3, cardCount);

  const settings = {
    dots: true,
    infinite: cardCount > 1,
    speed: 500,
    slidesToShow: perView,
    slidesToScroll: 1,
    autoplay: autoplayEnabled,
    autoplaySpeed: 4000,
    // Keep rotating under the pointer (the desktop pointer usually rests over the
    // carousel, which made it look static); the pause button stops it instead.
    pauseOnHover: false,
    pauseOnFocus: true,
    arrows: cardCount > 1,
    prevArrow: <CarouselArrow direction="prev" />,
    nextArrow: <CarouselArrow direction="next" />,
  };

  return (
    <div
      ref={scopeRef}
      className="relative w-full min-h-screen overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-black"
    >
      {/* Animated background */}
      <div className="absolute inset-0 z-0">
        <Background kind={section.background} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col justify-center py-20 px-6">
        <div className="text-center mb-12">
          {/* break-words: with large text settings one long word can be wider
              than a phone, and the section would clip it */}
          <h1
            data-reveal
            className="pb-3 text-5xl font-bold break-words bg-gradient-to-r from-pink-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent"
          >
            {section.title}
          </h1>
          <p data-reveal className="mt-2 text-gray-400 text-lg">
            Tap a project to read more.
          </p>
        </div>

        <div
          ref={carouselRef}
          data-reveal
          className="project-carousel relative w-full max-w-6xl mx-auto px-8 sm:px-12 pb-16"
          onPointerDownCapture={(e) => {
            pointerDown.current = { x: e.clientX, y: e.clientY };
            didDrag.current = false;
          }}
          onPointerMoveCapture={(e) => {
            if (!pointerDown.current) return;
            if (
              Math.abs(e.clientX - pointerDown.current.x) > 8 ||
              Math.abs(e.clientY - pointerDown.current.y) > 8
            ) {
              didDrag.current = true;
            }
          }}
        >
          <style>{`
            .project-carousel .slick-dots { bottom: -44px; }
            .project-carousel .slick-dots li button:before { font-size: 11px; color: #f472b6; opacity: 0.45; }
            .project-carousel .slick-dots li.slick-active button:before { color: #f472b6; opacity: 1; }
            .project-carousel .slick-dots li button:hover:before { opacity: 0.75; }
            .project-carousel .slick-dots li button:focus-visible { outline: 2px solid #f472b6; outline-offset: -2px; border-radius: 9999px; }
            .project-carousel .slick-dots li button:focus-visible:before { opacity: 1; }
          `}</style>
          <Slider ref={sliderRef} {...settings}>
            {section.cards.map((card) => (
              <ProjectCardTile key={card.id} card={card} onOpen={(e) => openCard(card, e)} />
            ))}
          </Slider>
          {autoplayEnabled && (
            <CarouselToggle
              playing={playing}
              onToggle={togglePlaying}
              label="projects"
              className="absolute bottom-3.5 right-8 sm:right-12 border-pink-400/40 bg-pink-500/10 text-pink-100 hover:border-pink-300/80 hover:bg-pink-500/25 focus-visible:ring-pink-400/70"
            />
          )}
        </div>
      </div>

      {activeCard && (
        <ProjectModal card={activeCard} featuresLabel={featuresLabel} onClose={closeCard} />
      )}
    </div>
  );
};

export default ProjectSection;
