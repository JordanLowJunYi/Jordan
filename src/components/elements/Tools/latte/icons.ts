// Pixel maps for the menu icons (rendered by PixelIcon).
import { FOOD_ICONS, FOOD_PAL } from './scene';
import type { FoodId } from './content';

export interface PixelArt {
  rows: string[];
  pal: Record<string, string>;
}

export const foodArt = (id: FoodId): PixelArt => ({ rows: FOOD_ICONS[id], pal: FOOD_PAL });

export const ICONS: Record<'pet' | 'play' | 'clean' | 'nap' | 'wake', PixelArt> = {
  pet: {
    rows: ['.pp.pp.', 'pwppppp', 'ppppppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...'],
    pal: { p: '#f472b6', w: '#ffd6ea' },
  },
  play: {
    rows: ['..ccc..', '.cwcbc.', 'cccbccc', 'cbbbbbc', 'cccbccc', '.ccbcc.', '..ccc..'],
    pal: { c: '#22d3ee', b: '#0e7490', w: '#e0fbff' },
  },
  clean: {
    rows: ['...y...', '...y...', '..yWy..', 'yyWWWyy', '..yWy..', '...y...', '...y...'],
    pal: { y: '#fbbf24', W: '#fff6c2' },
  },
  nap: {
    rows: ['..mmm..', '.mm....', 'mm.....', 'mm.....', 'mm.....', '.mm...m', '..mmmm.'],
    pal: { m: '#c4b5fd' },
  },
  wake: {
    rows: ['y..y..y', '.yyyyy.', '.yoooy.', 'yyoooyy', '.yoooy.', '.yyyyy.', 'y..y..y'],
    pal: { y: '#fbbf24', o: '#fde68a' },
  },
};
