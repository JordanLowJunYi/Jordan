// Original pixel sprites for Jordan's Room, drawn as text maps.
// Each character is one pixel; '.' is transparent. `makeSprite` turns a map
// into a small canvas once, and the game draws those canvases scaled up.

export type Palette = Record<string, string>;

const cache = new Map<string, HTMLCanvasElement>();

export function makeSprite(key: string, rows: string[], palette: Palette, flip = false): HTMLCanvasElement {
  const id = `${key}${flip ? ':f' : ''}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  });
  cache.set(id, c);
  return c;
}

// ---------------------------------------------------------------------------
// Jordan, from his profile photo: black hair with a side-swept fringe,
// rectangular black glasses (heavy top rim), dark suit, white shirt, grey tie.
// 14×21.
// ---------------------------------------------------------------------------
export const PLAYER_W = 14;
export const PLAYER_H = 21;

export const PLAYER_PALETTE: Palette = {
  k: '#16121c', // outline
  h: '#17131b', // hair
  H: '#3a3346', // hair shine
  s: '#f1c9a5', // skin
  S: '#d9a27c', // skin shade, ears
  g: '#0f0d14', // glasses frame (top rim)
  G: '#4a4458', // glasses frame (thin lower rim)
  l: '#dfeaf2', // lens glint
  e: '#2a2230', // eyes
  m: '#c47a6a', // mouth
  w: '#f5f3ef', // shirt
  t: '#8d919c', // tie
  j: '#262b3b', // suit
  J: '#3d4459', // suit lapel / pocket
  p: '#262b3b', // trousers
  b: '#141018', // shoes
};

const HEAD_DOWN = [
  '....kkkkkk....',
  '...khhhhHhkk..',
  '..khhhhhhhhhk.',
  '.khhhhhhhhhhhk',
  '.khhhhhhhhhhhk',
  '.khhsssshhhhhk',
  '.khssssssshhk.',
  'SkggggggggggkS',
  'SkglegssgelgkS',
  '.kGGGGssGGGGk.',
  '..ksssmmsssk..',
  '...kSssssSk...',
];
const HEAD_UP = [
  '....kkkkkk....',
  '...khhhhhhkk..',
  '..khhhhHhhhhk.',
  '.khhhhhhhhhhhk',
  '.khhhhhhhhhhhk',
  '.khhhhhhhhhhhk',
  '.khhhhhhhhhhhk',
  'SkhhhhhhhhhhkS',
  '.khhhhhhhhhhk.',
  '..khhhhhhhhk..',
  '...khhhhhhk...',
  '...kSssssSk...',
];
const HEAD_SIDE = [
  '....kkkkkk....',
  '...khhhhHhkk..',
  '..khhhhhhhhhk.',
  '.khhhhhhhhhhhk',
  '.khhhhhhhhhhhk',
  '.khhhhhhhhshhk',
  '.khhhhhhssssk.',
  '.khhhhggggggk.',
  '.khhhSssglegk.',
  '.khhhsssGGGGk.',
  '..khhsssssmk..',
  '...kkSsssSk...',
];
const BODY_FRONT = [
  '..kjjwwwwjjk..',
  '.kjjjwwtwjjjk.',
  'kjjjJwwtwJjjjk',
  'kjjjjwwtwjjjjk',
  'ksjjjjwwjjjjsk',
  '.kjjjjjjjjjjk.',
];
const BODY_BACK = [
  '..kjjjjjjjjk..',
  '.kjjjjjjjjjjk.',
  'kjjjjJJjjjjjjk',
  'kjjjjjjjjjjjjk',
  'ksjjjjjjjjjjsk',
  '.kjjjjjjjjjjk.',
];
const BODY_SIDE = [
  '...kjjwwjjk...',
  '..kjjjjwtjjk..',
  '..kjjjJjtjjk..',
  '..kjjjsjjjjk..',
  '..kjjjjjjjjk..',
  '...kjjjjjjk...',
];
const LEGS_STAND = ['.kppppkkppppk.', '.kppk....kppk.', '.kbbk....kbbk.'];
const LEGS_STEP_A = ['.kppppkkppppk.', '.kbbk....kppk.', '.........kbbk.'];
const LEGS_STEP_B = ['.kppppkkppppk.', '.kppk....kbbk.', '.kbbk.........'];
const LEGS_SIDE_STAND = ['...kppkkppk...', '...kppkkppk...', '...kbbkkbbbk..'];
const LEGS_SIDE_A = ['...kppkkppk...', '..kppk..kppk..', '..kbbk..kbbbk.'];
const LEGS_SIDE_B = ['....kppppk....', '....kppppk....', '....kbbbbbk...'];

export type Facing = 'down' | 'up' | 'left' | 'right';

/** frame 0 = standing, 1 and 2 = walking steps */
export function playerSprite(facing: Facing, frame: 0 | 1 | 2): HTMLCanvasElement {
  const side = facing === 'left' || facing === 'right';
  const head = facing === 'down' ? HEAD_DOWN : facing === 'up' ? HEAD_UP : HEAD_SIDE;
  const body = facing === 'down' ? BODY_FRONT : facing === 'up' ? BODY_BACK : BODY_SIDE;
  const legs = side
    ? [LEGS_SIDE_STAND, LEGS_SIDE_A, LEGS_SIDE_B][frame]
    : [LEGS_STAND, LEGS_STEP_A, LEGS_STEP_B][frame];
  return makeSprite(`player-${side ? 'side' : facing}-${frame}`, [...head, ...body, ...legs], PLAYER_PALETTE, facing === 'left');
}

// ---------------------------------------------------------------------------
// Latte: a small version (24×14) of the sprite in the Latte game
// (latte/sprite.ts), same calico colours: ginger head with a white blaze and
// muzzle, black saddle, ginger rump, white collar and belly, pink ears and
// feet. Faces right.
// ---------------------------------------------------------------------------
export const LATTE_PALETTE: Palette = {
  o: '#22171a', // outline
  k: '#433839', // black fur
  K: '#2f2729', // black fur shadow
  n: '#665a5b', // black fur sheen
  r: '#e08a43', // ginger
  R: '#b8642c', // ginger shadow, ears
  y: '#f3ae6e', // ginger highlight
  w: '#fffaf2', // white
  W: '#e3d9cd', // white shadow
  e: '#120c0e', // eye
  p: '#f19aa9', // pink ear, nose, feet
};

const LATTE_STAND = [
  '........................',
  '.......ooooo.o..........',
  '....ooonkkwwoRooooo.....',
  '...oynkknkwwRpryywwoo...',
  '..oyrkkkkkwwpRrrrrwwwo..',
  '.oyrrkknkkwwrrrrrrrwwo..',
  'orrrkkkkKwwwrrrrrreewwo.',
  'orrRwKKKwwwwrrrrrrerwwo.',
  'orRwwwwwwwwwrrrrwwwwwp..',
  '.oRwwwwwwwwwrrwwwwwwWo..',
  '..oRWwwWwwWwwWwwWwwWo...',
  '...oRWwWWwWWwWWwWWWo....',
  '....ooWWWWWWWoooooo.....',
  '.....ppoooooo..pp.......',
];
// mid-step: front and back feet swap
const LATTE_STEP = [...LATTE_STAND.slice(0, 13), '......ppooooo.pp........'];

/** frame 0 = standing, 1 = mid-step (used while walking) */
export function latteSprite(frame: 0 | 1, faceRight: boolean): HTMLCanvasElement {
  return makeSprite(`latte-${frame}`, frame === 0 ? LATTE_STAND : LATTE_STEP, LATTE_PALETTE, !faceRight);
}

// ---------------------------------------------------------------------------
// Small icons
// ---------------------------------------------------------------------------
export const ICON_PALETTE: Palette = {
  k: '#1b1626',
  r: '#f472b6',
  R: '#db2777',
  w: '#fff',
  g: '#86efac',
  G: '#22c55e',
  d: '#15803d',
  y: '#fbbf24',
  Y: '#f59e0b',
};

export const HEART = makeSpriteLazy('heart', [
  '.kk.kk.',
  'krrkrrk',
  'krwrrRk',
  'krrrrRk',
  '.krrRk.',
  '..kRk..',
  '...k...',
]);

export const LETTUCE = makeSpriteLazy('lettuce', [
  '...kkk...',
  '..kgggk..',
  '.kgGgGgk.',
  'kgGgggGgk',
  'kgggGgggk',
  '.kGgdgGk.',
  '..kgdgk..',
  '...kdk...',
  '....k....',
]);

export const NOTE = makeSpriteLazy('note', [
  '..kkk',
  '..kyk',
  '..kyk',
  'kkkyk',
  'kyyyk',
  'kyyk.',
  '.kk..',
]);

export const BANG = makeSpriteLazy('bang', [
  '.kkkkk.',
  'kwwwwwk',
  'kwwkwwk',
  'kwwkwwk',
  'kwwkwwk',
  'kwwwwwk',
  'kwwkwwk',
  'kwwwwwk',
  '.kkwkk.',
  '...k...',
]);

// Icons are built on first use (document must exist).
function makeSpriteLazy(key: string, rows: string[]): () => HTMLCanvasElement {
  return () => makeSprite(key, rows, ICON_PALETTE);
}
