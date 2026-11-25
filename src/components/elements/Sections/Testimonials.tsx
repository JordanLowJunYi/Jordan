import { useRef, useState } from 'react';
import Slider from 'react-slick';
import { ChevronLeft, ChevronRight, FileText, Quote } from 'lucide-react';
import TestimonialPanel from './Highlights/TestimonialPanel';
import type { Testimonial } from './Highlights/TestimonialPanel';
import { CarouselToggle } from './CarouselToggle';
import { useReveal } from '../../../lib/useReveal';
import { prefersReducedMotion } from '../../../lib/motion';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { useSlickFocusGuard } from '../../../lib/useSlickFocusGuard';
import type { Section, TestimonialQuote } from '../../../content/siteContent';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';

type TestimonialsSection = Extract<Section, { kind: 'testimonials' }>;

// react-slick wraps each slide in divs of its own and passes this element only a
// width style, which is forwarded. Its aria-hidden for off-screen and cloned
// slides lands on those wrappers, so useSlickFocusGuard keeps hidden slides out
// of the Tab order.
function QuoteSlide({
  item,
  onOpenLetter,
  style,
}: {
  item: TestimonialQuote;
  onOpenLetter: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="h-full px-3 pb-2" style={style}>
      <figure className="flex h-full flex-col rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-950/50 via-gray-900/60 to-teal-950/40 p-7 sm:p-8 shadow-2xl shadow-emerald-500/10 backdrop-blur-md">
        <Quote className="h-8 w-8 shrink-0 text-emerald-300/70" aria-hidden="true" />
        <blockquote className="mt-4 flex-1 text-lg sm:text-xl leading-relaxed text-gray-100">
          {item.quote}
        </blockquote>
        <figcaption className="mt-6 border-t border-white/10 pt-5">
          <p className="font-bold text-white">{item.name}</p>
          <p className="text-sm text-emerald-200/80">
            {item.role}, {item.org}
          </p>
          <button
            type="button"
            onClick={onOpenLetter}
            aria-haspopup="dialog"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-300 hover:text-emerald-200 underline underline-offset-4 decoration-emerald-400/40 hover:decoration-emerald-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 rounded"
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            Read the full letter
          </button>
        </figcaption>
      </figure>
    </div>
  );
}

function Arrow({
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
      aria-label={isPrev ? 'Previous testimonial' : 'Next testimonial'}
      className={`absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20 backdrop-blur-md transition-colors duration-200 hover:border-emerald-300/80 hover:from-emerald-500/40 hover:to-teal-500/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
        isPrev ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

const Testimonials: React.FC<{ section: TestimonialsSection }> = ({ section }) => {
  const scopeRef = useRef<HTMLDivElement>(null);
  useReveal(scopeRef, '[data-reveal]', { y: 36, start: 'top 85%' });

  const sliderRef = useRef<Slider>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  useSlickFocusGuard(carouselRef);
  const count = section.quotes.length;
  const autoplayEnabled = !prefersReducedMotion() && count > 1;
  const [playing, setPlaying] = useState(autoplayEnabled);
  const [openLetter, setOpenLetter] = useState<Testimonial | null>(null);
  // Two letters side by side on wide screens, one at a time below 1024px.
  const isWide = useMediaQuery('(min-width: 1025px)');

  const open = (letter: Testimonial) => {
    sliderRef.current?.slickPause();
    setOpenLetter(letter);
  };
  const close = () => {
    setOpenLetter(null);
    if (playing) sliderRef.current?.slickPlay();
  };
  const toggle = () => {
    if (playing) sliderRef.current?.slickPause();
    else sliderRef.current?.slickPlay();
    setPlaying(!playing);
  };

  const settings = {
    dots: true,
    infinite: count > 1,
    speed: 700,
    slidesToShow: Math.min(isWide ? 2 : 1, count),
    slidesToScroll: 1,
    autoplay: autoplayEnabled,
    autoplaySpeed: 6500,
    pauseOnHover: false,
    pauseOnFocus: true,
    arrows: count > 1,
    prevArrow: <Arrow direction="prev" />,
    nextArrow: <Arrow direction="next" />,
  };

  return (
    <div
      ref={scopeRef}
      className="relative w-full overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-black"
    >
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(52,211,153,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[56rem] h-[40rem] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 py-24 px-6">
        <div className="text-center mb-12">
          <h1
            data-reveal
            className="pb-3 text-5xl font-bold break-words bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent"
          >
            {section.title}
          </h1>
          {section.subtitle && (
            <p data-reveal className="mt-2 text-gray-400 text-lg">
              {section.subtitle}
            </p>
          )}
        </div>

        <div
          ref={carouselRef}
          data-reveal
          role="region"
          aria-roledescription="carousel"
          aria-label="Testimonials"
          className="testimonial-carousel relative w-full max-w-5xl mx-auto px-8 sm:px-12 pb-16"
        >
          <style>{`
            .testimonial-carousel .slick-track { display: flex; }
            .testimonial-carousel .slick-slide { height: auto; }
            .testimonial-carousel .slick-slide > div { height: 100%; }
            .testimonial-carousel .slick-dots { bottom: -44px; }
            .testimonial-carousel .slick-dots li button:before { font-size: 11px; color: #34d399; opacity: 0.45; }
            .testimonial-carousel .slick-dots li.slick-active button:before { color: #34d399; opacity: 1; }
            .testimonial-carousel .slick-dots li button:hover:before { opacity: 0.75; }
            .testimonial-carousel .slick-dots li button:focus-visible { outline: 2px solid #34d399; outline-offset: -2px; border-radius: 9999px; }
            .testimonial-carousel .slick-dots li button:focus-visible:before { opacity: 1; }
          `}</style>
          <Slider ref={sliderRef} {...settings}>
            {section.quotes.map((item, i) => (
              <QuoteSlide key={i} item={item} onOpenLetter={() => open(item.letter)} />
            ))}
          </Slider>
          {autoplayEnabled && (
            <CarouselToggle
              playing={playing}
              onToggle={toggle}
              label="testimonials"
              className="absolute bottom-3.5 right-8 sm:right-12 border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/80 hover:bg-emerald-500/25 focus-visible:ring-emerald-400/70"
            />
          )}
        </div>
      </div>

      <TestimonialPanel item={openLetter} onClose={close} />
    </div>
  );
};

export default Testimonials;
