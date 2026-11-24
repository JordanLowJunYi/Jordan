// ============================================================================
// siteContent.tsx — SINGLE SOURCE OF TRUTH for the whole homepage.
//
// Everything the page shows lives here: the hero, every project card, the
// "Beyond Research" highlights, the section ORDER, and the side-menu links.
// To change wording, swap a photo, add a card, or reorder sections, edit THIS
// file only — the components read from it.
//
//   • Reorder sections ......... move entries in the `sections` array (order = render order).
//   • Add / remove a card ...... edit a section's `cards` array.
//   • Change a photo ........... set `image` to a path under /public, e.g. `${BASE}images/Showcase/x.png`.
//   • Rename / recolour a nav .. edit that section's `nav` block (also drives the menu).
//   • New section .............. add a `{ kind: 'projects' | 'highlights', ... }` object; it renders
//                                and gets a menu entry automatically.
// ============================================================================

import type { DateSpan } from '../lib/dates';

const BASE = import.meta.env.BASE_URL;

// This site's own address, read at runtime so it stays correct wherever it is
// deployed (localhost, GitHub Pages, a custom domain) without being hardcoded.
const SELF_URL = typeof window === 'undefined' ? '' : `${window.location.origin}${BASE}`;
const SELF_DISPLAY =
  typeof window === 'undefined' ? '' : `${window.location.host}${BASE}`.replace(/\/$/, '');

export type BackgroundKey = 'standard' | 'dna' | 'semiconductor' | 'aurora' | 'none';

export interface ContactLink {
  label: string;      // left-hand tag, e.g. "Email"
  display: string;    // clickable text
  href: string;
  external?: boolean; // opens in a new tab when true
}

export interface HeroContent {
  name: string;
  tagline: string;
  majors: string;
  contacts: ContactLink[];
}

export interface ProjectCard {
  id: number;
  title: string;
  subtitle: string;
  features: string[];
  gradient: string;                 // Tailwind gradient, e.g. "from-pink-500 to-purple-600"
  image?: string;                   // optional photo; omit to show the gradient placeholder
  // CSS colour: show the image whole (never cropped) against this backdrop. Only safe
  // when the image's own edges are that flat colour, else the seam shows.
  imagePlate?: string;
  visual?: 'manhattan';             // optional animated visual shown instead of a photo
  link?: { label: string; href: string };
  todo?: boolean;                   // true while the copy is still a placeholder
}

export interface HighlightEntry {
  title: string;
  meta?: string;                    // date range, venue, grade, etc.
  note?: string;                    // one-line description
  href?: string;                    // optional external link
  doi?: string;                     // bare DOI, e.g. "10.1136/heartjnl-2026-1234"; links to doi.org
}

// A single role held at an organisation. Several of these under one `ExperienceOrg`
// render as a connected stack, the way LinkedIn shows multiple roles at one employer.
// Dates are 'YYYY-MM' months. The page writes "Apr 2021 – Jan 2022 · 10 mos" from them,
// and a role with no `end` reads "– Present" with its duration counted up to today.
export interface ExperienceRole extends DateSpan {
  title: string;
  location?: string;                // e.g. "MD6"; joins the dates on one subheader line
  testimonial?: { label: string; href: string };
  href?: string;                    // optional link out (e.g. work produced in the role)
}

export interface ExperienceOrg {
  org: string;
  // With two or more roles, the total time at the organisation is computed and shown
  // under its name. `note` is extra text appended after it, e.g. the office ("Curie").
  note?: string;
  roles: ExperienceRole[];
}

export interface HighlightGroup {
  heading: string;
  wide?: boolean;                   // span the full grid width (entries flow in two columns)
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;            // explicit width out of 12; overrides `wide`. Lets a tall
                                    // group take extra width so a row ends level.
  entries?: HighlightEntry[];
  experience?: ExperienceOrg[];     // rendered as a grouped timeline instead of `entries`
}

export interface NavStyle {
  label: string;                    // shown on the menu "book"
  color: string;
  glow: string;
}

// One excerpt for the testimonials carousel. `quote` must be copied word for word
// from the letter at `letter.href`; the slide links to that letter so readers can
// check the context.
export interface TestimonialQuote {
  quote: string;
  name: string;
  role: string;                     // job title, as written in the letter or on LinkedIn
  org: string;
  letter: { label: string; href: string };
}

export type Section =
  | {
      kind: 'projects';
      id: string;                   // scroll anchor + menu target
      nav: NavStyle;
      title: string;
      background: BackgroundKey;
      featuresLabel?: string;       // heading above the bullet list (default "Key Features")
      cards: ProjectCard[];
    }
  | {
      kind: 'highlights';
      id: string;
      nav: NavStyle;
      title: string;
      background: BackgroundKey;
      groups: HighlightGroup[];
    }
  | {
      kind: 'testimonials';
      id: string;
      nav: NavStyle;
      title: string;
      subtitle?: string;
      quotes: TestimonialQuote[];
    };

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------
export const hero: HeroContent = {
  name: 'Jordan Low Jun Yi',
  tagline: 'Biomedical Engineering Student at NUS',
  majors: 'Second Major in Computing • Specialization in Tissue Engineering • Minor in AI • Minor in Innovation & Design',
  contacts: [
    {
      label: 'Email',
      display: 'jordanljy@u.nus.edu',
      href: 'mailto:jordanljy@u.nus.edu?subject=Contact%20from%20Website&body=Hi%20Jordan,',
    },
    {
      label: 'LinkedIn',
      display: 'linkedin.com/in/jordan-low-jun-yi',
      href: 'https://linkedin.com/in/jordan-low-jun-yi',
      external: true,
    },
    {
      label: 'Google Scholar',
      display: 'Google Scholar profile',
      href: 'https://scholar.google.com/citations?hl=en&user=O6M8clAAAAAJ',
      external: true,
    },
    {
      label: 'GitHub',
      display: 'github.com/doux124',
      href: 'https://github.com/doux124',
      external: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// TESTIMONIAL LETTERS  (PDFs in public/testimonials; used by Experience and
// by the testimonials carousel, so each is defined once)
// ---------------------------------------------------------------------------
const LETTERS = {
  astar: {
    label: 'Testimonial by David Sher, Deputy Director, Venture Creation & Market Access',
    href: `${BASE}testimonials/ASTAR_Testimonial_Jordan_Low.pdf`,
  },
  kosmode: {
    label: 'Testimonial by Florence Leong, Founder & Director',
    href: `${BASE}testimonials/Kosmode_Testimonial_Jordan_Low.pdf`,
  },
  mds: {
    label: 'Testimonial by Lim Eng Seng, Founder & Principal Engineer',
    href: `${BASE}testimonials/MDesign_Testimonial_Jordan_Low.pdf`,
  },
};

// ---------------------------------------------------------------------------
// SECTIONS  (array order === on-page order === menu order)
// ---------------------------------------------------------------------------
export const sections: Section[] = [
  // ===================== BIOMEDICAL ENGINEERING =====================
  {
    kind: 'projects',
    id: 'bme-section',
    title: 'Biomedical Engineering Projects',
    background: 'dna',
    nav: { label: 'BIOMEDICAL ENGINEERING', color: '#ec4899', glow: '#f472b6' },
    cards: [
      {
        id: 1,
        title: 'Sirolimus Efficacy in Liver Organoids',
        subtitle: 'Liver-organoid models revealing MASH-clearing effects of an atherosclerosis drug',
        features: [
          'Grew 3D liver organoids as a disease model for metabolic liver disease (MASH)',
          'Found a class of atherosclerosis drugs cleared MASH features in diseased cells',
          'Restored the actin cytoskeleton and mitochondrial count in diseased hepatocytes',
          'Reduced intracellular lipid (fat) volume',
        ],
        image: `${BASE}images/Showcase/Organoid.png`,
        gradient: 'from-pink-500 to-purple-600',
        link: {
          label: 'Paper in Atherosclerosis (2026)',
          href: 'https://doi.org/10.1016/j.atherosclerosis.2026.120762',
        },
      },
      {
        id: 2,
        title: 'Minimally Invasive Annuloplasty using Shape-Memory Materials',
        subtitle: 'Shape-memory, biodegradable rings for minimally invasive cardiac surgery',
        features: [
          'Shape-memory rings from Nitinol and MMA-PEGDMA that expand at body temperature',
          '94.3% smaller incision for cardiac surgery',
          '48% reduction in mitral valve regurgitation',
          'Biodegradable options tailored for pediatric hearts',
        ],
        image: `${BASE}images/Showcase/polymer_ring.png`,
        gradient: 'from-cyan-500 to-blue-600',
      },
      {
        id: 3,
        title: 'KneedIt: Smart Knee Sleeve for Osteoarthritis',
        subtitle: 'A sensor-packed knee sleeve and app that turn screen time into knee care for older adults',
        features: [
          'Smart compression sleeve tracking knee range of motion, muscle activity (EMG), and tissue health (PPG), with on-sleeve LED feedback',
          'Companion app locks the phone past a screen-time threshold until the sleeve verifies a guided exercise session is genuinely done',
          'Caregiver dashboard lets family track mobility trends and receive alerts, closing the accountability loop',
          'Targets knee osteoarthritis in older adults (~40% of Singaporeans over 70), with a working app prototype live',
        ],
        image: `${BASE}images/Showcase/kneedit.jpg`,
        gradient: 'from-teal-500 to-emerald-600',
        link: { label: 'Live app prototype', href: 'https://kneed-it2.vercel.app/' },
      },
      {
        id: 4,
        title: 'FreeStryde: Lymphedema Therapy Device',
        subtitle: 'A wearable that recreates manual lymphatic drainage to make gold-standard lymphedema care accessible',
        features: [
          'Began at IDEATE 2025 as a portable alternative to bulky intermittent pneumatic compression (IPC) devices',
          'Pivoted to replicating manual lymphatic drainage (MLD), the clinical gold standard, after therapist and patient validation',
          'A dual-plane pneumatic mechanism recreates the tangential skin stretch of MLD for patients priced out of it (up to S$200/session, rarely insured)',
          'Validated in stages: sponge, then ballistic-gel phantom with FITC-dextran, then user testing (SUS/QUEST)',
          'IDEATE 2025 Champion (S$10,000 NUS VIP Grant) and EDIC INSPIRE 2026 Most Impactful Project',
        ],
        // Prototype 2 on the bench: sleeve, bellows actuator and suction cup on a
        // forearm model, driven from the phone pump-controller app.
        image: `${BASE}images/Showcase/freestryde_prototype.jpg`,
        gradient: 'from-sky-500 to-indigo-600',
        link: {
          label: 'Our lymphedema network meta-analysis (Supportive Care in Cancer, 2026)',
          href: 'https://doi.org/10.1007/s00520-026-11494-0',
        },
      },
    ],
  },

  // ========================= COMPUTER SCIENCE =========================
  {
    kind: 'projects',
    id: 'cs-section',
    title: 'Computer Science Projects',
    background: 'semiconductor',
    nav: { label: 'COMPUTER SCIENCE', color: '#8b5cf6', glow: '#a78bfa' },
    cards: [
      {
        id: 1,
        title: 'Virtual Arm with Multimodal Biased Feedback',
        subtitle: 'Brain-computer interface training with a virtual robotic arm',
        features: [
          'Built a BCI training system using a virtual robotic arm to teach motor imagery',
          'Classified EEG motor imagery with SVMs at >97% accuracy using FFT and CSP features',
          'Showed biased feedback improves classification accuracy and cuts training time',
          'Aimed at more accessible prosthetics and rehabilitation for stroke patients and amputees',
        ],
        image: `${BASE}images/Showcase/eeg_cap.jpg`,
        gradient: 'from-cyan-500 to-blue-600',
      },
      {
        id: 2,
        title: 'Staging Liver Disease from Ultrasound',
        subtitle: 'Deep learning that stages fatty-liver disease from ultrasound, no FibroScan needed',
        features: [
          'Trained EfficientNet-B6 models to predict CAP and liver stiffness from B-mode ultrasound images',
          'Fed predictions into the FAST and Agile-3 scores to flag at-risk MASH and advanced fibrosis',
          'Trained on four Japanese centers and externally validated on an independent Chinese cohort',
          'Reached AUCs up to 0.98 (rule-out MASH) and 0.91 (rule-out advanced fibrosis)',
        ],
        image: `${BASE}images/Showcase/liver_ultrasound.png`,
        imagePlate: '#ffffff',
        gradient: 'from-emerald-500 to-teal-600',
        link: {
          label: 'Co-first-author paper in J Gastroenterol Hepatol (2026)',
          href: 'https://doi.org/10.1111/jgh.70763',
        },
      },
      {
        id: 3,
        // Rendered with the animated Manhattan-plot canvas instead of a photo.
        title: 'Genome-Wide Association Study',
        subtitle: 'Mapping the genetics of the TG:HDL ratio across 424,032 UK Biobank participants',
        features: [
          'Ran a GWAS of the triglyceride-to-HDL ratio, a marker of insulin resistance and cardiovascular risk',
          'Mapped 221 genomic risk loci with FUMA and MAGMA, recovering known lipid genes (LPL, CETP, APOA5)',
          'Uncovered enrichment of hepatocellular-carcinoma pathways, tying dyslipidemia to liver-cancer risk',
          'Linked significant variants to incident myocardial infarction with Cox proportional-hazards models',
          'Presented as a first-author poster at the APASL 2026 Annual Meeting',
        ],
        visual: 'manhattan',
        gradient: 'from-emerald-500 to-teal-600',
      },
      {
        id: 4,
        title: 'Rover-X: Payload Design for a Surveillance Robot',
        subtitle: 'Simulation-led payload design balancing heat dissipation, waterproofing and surveillance function',
        features: [
          'Used SolidWorks simulations to work out how to construct the payload for Rover-X, the HomeTeam robotic surveillance dog',
          'Balanced two constraints that pull against each other: shedding heat while keeping the payload waterproof',
          'Kept the payload able to carry out its surveillance function under both of those constraints',
          'Improved heat dissipation through iterative design enhancements',
        ],
        image: `${BASE}images/Showcase/RoverX.jpeg`,
        gradient: 'from-lime-500 to-emerald-600',
      },
      {
        id: 5,
        title: 'CARE-Liver: Fibrosis Staging on MRI',
        subtitle: 'A segmentation-to-staging deep-learning cascade for liver fibrosis on multi-vendor MRI',
        features: [
          'Built a two-stage pipeline for the MICCAI CARE-Liver challenge in the Digital Heart Lab, funded by a CDE REx Fellows\' Grant',
          'Fine-tuned TotalSegmentator-MRI in nnU-Net to segment the liver from just 30 scans (Dice 0.97)',
          'Staged fibrosis with per-sequence 3D ResNets and missing-modality-robust late fusion, validated with nested cross-validation',
          'Stayed self-contained at inference across heterogeneous vendors and missing sequences',
          'First-author paper in press, MICCAI 2026 Satellite Events (Lecture Notes in Computer Science)',
        ],
        // Graphic built from the paper's own LiSeg overlays (case 0888-A-S1).
        image: `${BASE}images/Showcase/care_liver.jpg`,
        gradient: 'from-orange-500 to-rose-600',
        link: { label: 'Digital Heart Lab', href: 'https://digitalheartlab.com/people/jordan_low' },
      },
    ],
  },

  // ========================== MORE ABOUT ME ==========================
  {
    kind: 'highlights',
    id: 'about-section',
    title: 'More about me',
    background: 'aurora',
    nav: { label: 'MORE ABOUT ME', color: '#f59e0b', glow: '#fbbf24' },
    groups: [
      {
        heading: 'Publications',
        wide: true,
        entries: [
          {
            title: 'Manual lymphatic drainage and pneumatic compression for breast-cancer-related lymphedema: a component network meta-analysis',
            meta: 'Supportive Care in Cancer · 2026',
            doi: '10.1007/s00520-026-11494-0',
            note: 'First author',
          },
          {
            title: 'Plain 2D ultrasound and clinical data for identifying at-risk MASH: a multicenter proof-of-concept study',
            meta: 'Journal of Gastroenterology and Hepatology · 2026',
            doi: '10.1111/jgh.70763',
            note: 'Co-first author',
          },
          {
            title: 'A transfer-learned segmentation-to-staging cascade for liver fibrosis staging on multi-vendor MRI',
            meta: 'MICCAI 2026 Satellite Events (LNCS) · in press',
            note: 'First author',
          },
          {
            title: 'Prognosis of STEMI patients presenting to the ED without chest pain: a nationwide cohort study',
            meta: 'Heart · 2026',
            doi: '10.1136/heartjnl-2025-327601',
          },
          {
            title: 'Diversity in MASLD: a framework for precision medicine',
            meta: 'npj Gut and Liver · 2026',
            doi: '10.1038/s44355-026-00061-3',
            note: 'Co-first author',
          },
          {
            title: 'Fibro-inflammatory liver injury, not steatosis, predicts neuropsychiatric events and mortality (UK Biobank)',
            meta: 'Metabolism · 2026',
            doi: '10.1016/j.metabol.2026.156635',
          },
          {
            title: 'Organoid models reveal sirolimus efficacy in liver-vascular steatosis and foam-cell formation',
            meta: 'Atherosclerosis · 2026',
            doi: '10.1016/j.atherosclerosis.2026.120762',
          },
        ],
      },
      {
        heading: 'UI/UX & Web Design',
        wide: true,
        entries: [
          { title: 'This Portfolio', meta: SELF_DISPLAY, href: SELF_URL },
          {
            title: 'Kosmode Health',
            meta: 'kosmodehealth.com',
            href: 'https://kosmodehealth.com/',
          },
          {
            title: 'NUS DE-Scholars',
            meta: 'nusdescholars.com',
            href: 'https://www.nusdescholars.com/',
          },
          {
            title: 'KneedIt',
            meta: 'kneed-it2.vercel.app',
            href: 'https://kneed-it2.vercel.app/',
          },
          {
            title: 'Previous Portfolio',
            meta: 'doux124.github.io/jordan',
            href: 'https://doux124.github.io/jordan/',
          },
        ],
      },
      {
        heading: 'Awards & Honours',
        wide: true,
        entries: [
          { title: 'EDIC INSPIRE 2026 — Most Impactful Project (FreeStryde)', meta: 'NUS College of Design and Engineering · Nov 2026' },
          { title: "REx Fellow — CDE Undergraduate Research Experience Fellows' Grant (S$5,000)", meta: 'NUS College of Design and Engineering · Aug 2026' },
          { title: 'Innovation & Research Award 2026 (High Achievement)', meta: 'NUS · Jun 2026' },
          { title: 'IDEATE 2025 — Champion (FreeStryde)', meta: 'NUS · Oct 2025', note: 'Out of 80+ teams; prize includes a S$10,000 NUS VIP Grant' },
          { title: 'WorldQuant BRAIN Alphathon 2024 — 6th Place', meta: 'WorldQuant · Sep 2024' },
          { title: 'Triple Distinction with Honours (Chemistry, Biology, Physics)', meta: 'NUS High School · 2022', note: 'The only student in the cohort to earn it' },
          { title: "Tan Kah Kee Young Inventors' Award (TKKYIA) — Silver", meta: 'Tan Kah Kee Foundation · Jul 2022' },
          { title: 'Global Youth Science & Technology Bowl (GYSTB) — Grand Prize (Gold)', meta: 'HK Federation of Youth Groups · May 2022' },
          { title: 'Japan Super Science Fair — Invitation (shape-memory annuloplasty)', meta: '2022' },
          { title: 'International Elementz Fair (IEF) — Gold', meta: 'NTU · Apr 2022' },
          { title: 'Singapore Science & Engineering Fair (SSEF) — Gold', meta: 'SSEF · Mar 2022' },
          { title: 'Singapore Science & Engineering Fair (SSEF) — Silver', meta: 'SSEF · Mar 2022' },
          { title: 'A*STAR Young Researcher Award', meta: 'A*STAR Singapore · Jan 2022' },
          { title: 'National Robotics Competition — 2nd Runner Up', meta: 'Science Centre Singapore · Sep 2021' },
          { title: 'International Chemistry Tournament (IChTo) — Champion', meta: 'IChTo · Aug 2021' },
          { title: 'Singapore Chemistry Olympiad (SChO) — Gold', meta: 'Singapore National Institute of Chemistry · Jul 2021' },
          { title: 'NUS Chemical Engineering Challenge — 2nd Runner-Up', meta: 'NUS · 2021' },
          { title: 'A*STAR Science Award (Junior College)', meta: 'A*STAR Singapore · Jan 2021' },
          { title: 'UK Intermediate Biology Olympiad — Gold', meta: 'UK Biology Competitions · Mar 2020' },
          { title: 'International Science Youth Forum — Invitation (graphene biosensing)', meta: '2020' },
          { title: 'Singapore Junior Biology Olympiad (SJBO) — Gold', meta: 'May 2019' },
          { title: 'Singapore Junior Chemistry Olympiad (SJChO) — Gold', meta: 'May 2019' },
          { title: 'UK Biology Challenge — Gold', meta: 'UK Biology Competitions · Mar 2019' },
        ],
      },
      {
        heading: 'Experience',
        span: 9,
        experience: [
          {
            org: 'National University of Singapore',
            roles: [
              {
                title: 'Machine Learning Researcher (REx Fellow)',
                start: '2026-05',
                location: 'Digital Heart Lab, NUS Biomedical Engineering',
                href: 'https://digitalheartlab.com/people/jordan_low',
              },
            ],
          },
          {
            org: 'NUS Yong Loo Lin School of Medicine',
            roles: [
              { title: 'Research Staff', start: '2024-06', location: 'MD1, E7' },
              { title: 'Cardiothoracic and Vascular Surgery Intern', start: '2022-05', end: '2022-05', location: 'National University Hospital (NUH)' },
              { title: 'Research Intern', start: '2021-07', end: '2022-05', location: 'MD6' },
            ],
          },
          {
            org: 'Agency for Science, Technology and Research (A*STAR)',
            roles: [
              {
                title: 'Innovation and Enterprise Intern',
                start: '2026-05', end: '2026-08',
                location: 'Kinesis, Innovis',
                testimonial: LETTERS.astar,
              },
              { title: 'Institute of Molecular and Cell Biology Intern', start: '2026-05', end: '2026-08', location: 'Proteos' },
            ],
          },
          {
            org: 'KosmodeHealth Singapore',
            note: 'Curie',
            roles: [
              { title: 'UI/UX Designer & Front-End Developer', start: '2025-03', end: '2025-10', href: 'https://kosmodehealth.com/' },
              {
                title: 'Business Development Intern',
                start: '2025-02', end: '2025-03',
                testimonial: LETTERS.kosmode,
              },
            ],
          },
          {
            org: 'MDS-Plus',
            roles: [
              {
                title: 'Mechanical Designer Intern',
                start: '2024-12', end: '2025-02',
                location: '79 Ayer Rajah Crescent',
                testimonial: LETTERS.mds,
              },
            ],
          },
          {
            org: 'Singapore Army',
            roles: [
              { title: 'Combat Medic', start: '2023-01', end: '2024-11', location: 'Nee Soon Camp' },
            ],
          },
          {
            org: 'Raven Parthenon Education',
            roles: [
              { title: 'Olympiad Tutor', start: '2022-10', end: '2023-01' },
            ],
          },
          {
            org: 'National University of Singapore',
            roles: [
              { title: 'Nanofabrication Intern', start: '2022-05', end: '2022-09', location: 'E6 Nanofab' },
            ],
          },
          {
            org: 'Nanyang Technological University Singapore',
            roles: [
              { title: 'Machine Learning Intern', start: '2021-04', end: '2022-01', location: 'Centre for Brain Computing Research' },
              { title: 'Engineering Intern', start: '2019-03', end: '2020-03', location: 'Plasma Engineering and Applied Research Laboratory' },
            ],
          },
          {
            org: 'Minmed Group Pte Ltd',
            roles: [
              { title: 'Clinical Assistant', start: '2021-11', end: '2021-12', location: 'JEM' },
            ],
          },
          {
            org: 'Sport Singapore',
            roles: [
              { title: 'Lifeguard', start: '2019-01', end: '2020-01', location: 'Tampines Swimming Complex' },
            ],
          },
        ],
      },
      {
        heading: 'Leadership & Community',
        span: 3,
        entries: [
          { title: 'Founder of KneedIt' },
          { title: 'Project Director of E-Scholars Senior-Teach-Junior Programme' },
          { title: 'Programmes Committee, House of Aquila', meta: 'Residential College 4 (RC4) · 2025 – 2026', note: 'Co-led Prank Week' },
          { title: 'Vice Head of RC4 Tea', meta: '2026 – present' },
          { title: 'Treasurer of Orcabakes (RC4)', meta: '2026 – present' },
          { title: 'Orientation Group Leader at BME Camp' },
          { title: "Overall I/C, Project i'mPAC", meta: '2021 – 2022', note: 'Led humanitarian relief for Cambodian students and raised $3,400' },
          { title: 'Team Lead at Lions Befrienders', meta: '2021' },
          { title: 'Volunteer at NUS Toddycats (nature conservation)', meta: '2024 – 2025' },
          { title: 'Volunteer at Active Aging Advocates', meta: '2023' },
          { title: 'Volunteer at Ling Kwang Home & All Saints Home', meta: '2022' },
          { title: 'Volunteer at Fei Yue', meta: '2024 – 2025' },
          { title: 'Student Volunteer at SHINE Children & Youth Services', meta: '2021' },
        ],
      },
    ],
  },

  // =========================== TESTIMONIALS ===========================
  // Excerpts are verbatim from the letters in public/testimonials.
  {
    kind: 'testimonials',
    id: 'testimonials-section',
    title: 'Testimonials',
    subtitle: "Excerpts from letters by people I've worked with. Open one to read it in full.",
    nav: { label: 'TESTIMONIALS', color: '#10b981', glow: '#34d399' },
    quotes: [
      {
        quote:
          'Taking on dual roles is demanding for anyone, and Jordan handled both well beyond what I expect from an intern.',
        name: 'David Sher',
        role: 'Deputy Director, Venture Creation & Market Access',
        org: 'A*STAR',
        letter: LETTERS.astar,
      },
      {
        quote:
          'He demonstrated an exceptional ability to tackle complex engineering challenges with creativity, precision, and dedication.',
        name: 'Lim Eng Seng',
        role: 'Founder & Principal Engineer',
        org: 'MDS-Plus',
        letter: LETTERS.mds,
      },
      {
        quote:
          'Throughout the internship, Jordan demonstrated a ‘Can-do’ mentality, the courage to undertake challenges and resolve problems, a sense of purpose. In short - a maturity beyond his age.',
        name: 'Florence Leong',
        role: 'Founder & Director',
        org: 'KosmodeHealth',
        letter: LETTERS.kosmode,
      },
      {
        quote:
          'A self-motivated and efficient individual, Jordan managed his responsibilities with minimal supervision.',
        name: 'Lim Eng Seng',
        role: 'Founder & Principal Engineer',
        org: 'MDS-Plus',
        letter: LETTERS.mds,
      },
      {
        quote:
          "Working with no financial budget and tight time constraints during academic term, Jordan successfully revamped KosmodeHealth's corporate website.",
        name: 'Florence Leong',
        role: 'Founder & Director',
        org: 'KosmodeHealth',
        letter: LETTERS.kosmode,
      },
      {
        quote:
          'Any team would be fortunate to have him, and I expect him to make a real contribution wherever he lands next.',
        name: 'David Sher',
        role: 'Deputy Director, Venture Creation & Market Access',
        org: 'A*STAR',
        letter: LETTERS.astar,
      },
    ],
  },
];
