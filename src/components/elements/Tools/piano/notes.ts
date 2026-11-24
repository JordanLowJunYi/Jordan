// Note maths shared by every piano mode. Notes are MIDI numbers (60 = middle C = C4).

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MIDDLE_C = 60;

export function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** "C#4" style name. */
export function noteName(midi: number): string {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${octaveOf(midi)}`;
}

/** Name for screen readers: "C sharp 4". */
export function spokenName(midi: number): string {
  return noteName(midi).replace('#', ' sharp ').replace(/(\D)(\d)/, '$1 $2').replace(/\s+/g, ' ');
}

export function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** All MIDI numbers from low to high inclusive. */
export function range(low: number, high: number): number[] {
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}

// Computer keyboard: the home row plays white keys, the row above plays the
// black keys, like a piano laid on its back. Physical key codes, so it works
// whatever the keyboard layout; labels show the QWERTY letters.
export const KEY_CODES = [
  'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY',
  'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote',
] as const;
export const KEY_LABELS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];

/** Letter printed on a key when the computer-keyboard map starts at `base`. */
export function letterFor(midi: number, base: number): string | undefined {
  return KEY_LABELS[midi - base];
}

export const INTERVAL_NAMES = [
  'unison',
  'minor 2nd',
  'major 2nd',
  'minor 3rd',
  'major 3rd',
  'perfect 4th',
  'tritone',
  'perfect 5th',
  'minor 6th',
  'major 6th',
  'minor 7th',
  'major 7th',
  'octave',
];

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
