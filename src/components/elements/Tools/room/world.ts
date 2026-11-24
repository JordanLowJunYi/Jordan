// Room geometry for Jordan's Room, in low-res pixels (16 px per tile).
// `walk` is the floor area the player's feet may occupy, `solids` are
// furniture footprints, `things` are what you can look at, and `doors`
// are edges that lead somewhere.
import { HALL_H, HALL_W, STUDY_H, STUDY_W } from './art';

export type RoomId = 'study' | 'hall';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ThingId =
  | 'bookshelf'
  | 'fireplace'
  | 'window'
  | 'desk'
  | 'notebook'
  | 'planter'
  | 'exit'
  | 'letters'
  | 'trophies'
  | 'heart'
  | 'poster'
  | 'latte'
  | 'radio'
  | 'mailbox';

export interface Thing {
  id: ThingId;
  rect: Rect; // the area your "look" probe has to touch
  counts?: boolean; // part of the "found N / M" tally (the exit doesn't count)
}

export interface Door {
  rect: Rect; // feet entering this area trigger the door
  to: RoomId;
  arrive: { x: number; y: number; facing: 'left' | 'right' };
}

export interface RoomDef {
  id: RoomId;
  name: string;
  w: number;
  h: number;
  walk: Rect;
  solids: Rect[];
  things: Thing[];
  doors: Door[];
}

export const ROOMS: Record<RoomId, RoomDef> = {
  study: {
    id: 'study',
    name: 'The Study',
    w: STUDY_W,
    h: STUDY_H,
    walk: { x: 16, y: 56, w: 288, h: 118 },
    solids: [
      { x: 32, y: 52, w: 48, h: 12 }, // bookshelf
      { x: 124, y: 52, w: 56, h: 8 }, // fireplace
      { x: 246, y: 52, w: 52, h: 22 }, // desk + chair
      { x: 112, y: 108, w: 80, h: 22 }, // table
      { x: 98, y: 112, w: 14, h: 14 }, // chairs
      { x: 192, y: 112, w: 14, h: 14 },
      { x: 22, y: 158, w: 26, h: 18 }, // planter
      { x: 286, y: 134, w: 18, h: 10 }, // lamp base
    ],
    things: [
      { id: 'bookshelf', rect: { x: 30, y: 8, w: 52, h: 62 }, counts: true },
      { id: 'fireplace', rect: { x: 124, y: 14, w: 56, h: 50 }, counts: true },
      { id: 'window', rect: { x: 194, y: 6, w: 52, h: 56 }, counts: true },
      { id: 'desk', rect: { x: 244, y: 26, w: 56, h: 52 }, counts: true },
      { id: 'notebook', rect: { x: 108, y: 98, w: 88, h: 40 }, counts: true },
      { id: 'planter', rect: { x: 18, y: 144, w: 34, h: 34 }, counts: true },
      { id: 'exit', rect: { x: 140, y: 172, w: 40, h: 20 } },
    ],
    doors: [{ rect: { x: 300, y: 96, w: 20, h: 32 }, to: 'hall', arrive: { x: 23, y: 107, facing: 'right' } }],
  },
  hall: {
    id: 'hall',
    name: 'The Hall',
    w: HALL_W,
    h: HALL_H,
    walk: { x: 16, y: 64, w: HALL_W - 32, h: 86 },
    solids: [
      { x: 110, y: 62, w: 52, h: 12 }, // trophy cabinet
      { x: 332, y: 84, w: 104, h: 64 }, // Latte's pen
      { x: 478, y: 62, w: 36, h: 12 }, // radio table
      { x: 448, y: 132, w: 20, h: 18 }, // plant
      { x: 534, y: 126, w: 24, h: 16 }, // mailbox post
    ],
    things: [
      { id: 'letters', rect: { x: 44, y: 8, w: 48, h: 60 }, counts: true },
      { id: 'trophies', rect: { x: 108, y: 12, w: 56, h: 66 }, counts: true },
      { id: 'heart', rect: { x: 188, y: 8, w: 40, h: 60 }, counts: true },
      { id: 'poster', rect: { x: 252, y: 4, w: 56, h: 64 }, counts: true },
      { id: 'latte', rect: { x: 326, y: 78, w: 116, h: 76 }, counts: true },
      { id: 'radio', rect: { x: 474, y: 26, w: 44, h: 52 }, counts: true },
      { id: 'mailbox', rect: { x: 530, y: 96, w: 32, h: 50 }, counts: true },
    ],
    doors: [{ rect: { x: 0, y: 96, w: 18, h: 32 }, to: 'study', arrive: { x: 279, y: 99, facing: 'left' } }],
  },
};

export const TOTAL_THINGS = Object.values(ROOMS).reduce(
  (n, room) => n + room.things.filter((t) => t.counts).length,
  0,
);

/** Interior of Latte's pen, where Latte wanders. */
export const PEN = { x: 342, y: 94, w: 56, h: 40 };

export function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function contains(r: Rect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
