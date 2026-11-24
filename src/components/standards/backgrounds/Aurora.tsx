// A pure-CSS colour wash for tall text sections, where an animated canvas would
// be heavy. Soft glows in the site's accent colours sit on a deep purple-navy
// base and drift slowly; reduced-motion users get the same colours, still.
const Aurora: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
    <style>{`
      @keyframes aurora-drift {
        0%   { transform: translate3d(0, 0, 0) scale(1); }
        50%  { transform: translate3d(2%, -1.5%, 0) scale(1.04); }
        100% { transform: translate3d(-2%, 1%, 0) scale(1.02); }
      }
      .aurora-glow { animation: aurora-drift 28s ease-in-out infinite alternate; will-change: transform; }
      .aurora-glow.slow { animation-duration: 40s; animation-direction: alternate-reverse; }
      @media (prefers-reduced-motion: reduce) { .aurora-glow { animation: none; } }
    `}</style>

    {/* Base: deep violet at the top easing into navy */}
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(165deg, #1d1038 0%, #140c2c 35%, #0d1028 70%, #0a0f1f 100%)' }}
    />

    {/* Warm glows (amber, pink) */}
    <div
      className="aurora-glow absolute -inset-[10%]"
      style={{
        backgroundImage: [
          'radial-gradient(ellipse 45% 22% at 18% 6%, rgba(245,158,11,0.32), transparent 70%)',
          'radial-gradient(ellipse 40% 20% at 88% 30%, rgba(236,72,153,0.30), transparent 70%)',
          'radial-gradient(ellipse 45% 18% at 25% 92%, rgba(244,114,182,0.24), transparent 70%)',
        ].join(','),
      }}
    />

    {/* Cool glows (violet, cyan) */}
    <div
      className="aurora-glow slow absolute -inset-[10%]"
      style={{
        backgroundImage: [
          'radial-gradient(ellipse 50% 22% at 8% 52%, rgba(139,92,246,0.30), transparent 70%)',
          'radial-gradient(ellipse 42% 20% at 92% 72%, rgba(6,182,212,0.24), transparent 70%)',
          'radial-gradient(ellipse 38% 16% at 60% 18%, rgba(168,85,247,0.18), transparent 70%)',
        ].join(','),
      }}
    />
  </div>
);

export default Aurora;
