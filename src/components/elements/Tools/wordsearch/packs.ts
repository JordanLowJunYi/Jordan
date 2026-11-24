// Word packs themed on Jordan's work: biomedical engineering, code, the liver
// lab, plus one cosy pack for fun. Each word has a one-line field note that
// shows up when it's found (a nod to the old game's dictionary definitions).

export interface Pack {
  id: string;
  name: string;
  words: Record<string, string>;
}

export const PACKS: Pack[] = [
  {
    id: 'biomed',
    name: 'Biomed',
    words: {
      SCAFFOLD: 'A porous 3D frame that cells grow on to build new tissue.',
      STENT: 'A small mesh tube that props open a narrowed vessel or duct.',
      ORGANOID: 'A tiny lab-grown cluster of cells that mimics a real organ.',
      ULTRASOUND: 'Imaging with high-frequency sound echoes, no radiation needed.',
      SENSOR: 'Turns pressure, heat or light into a signal a device can read.',
      IMPLANT: 'A device placed inside the body to replace or support a part.',
      HYDROGEL: 'A water-swollen polymer network, soft and squishy like tissue.',
      CATHETER: 'A thin flexible tube threaded into the body to deliver or drain fluid.',
      LYMPHEDEMA: 'Swelling when lymph fluid cannot drain, often in an arm or leg.',
      ELECTRODE: 'A conductor that picks up or delivers electrical signals.',
      POLYMER: 'A long chain of repeating units, the stuff most plastics are made of.',
      PROSTHESIS: 'An artificial replacement for a missing body part.',
    },
  },
  {
    id: 'code',
    name: 'Code',
    words: {
      REACT: 'A JavaScript library for building user interfaces, like this one.',
      PYTHON: 'The go-to language for data science and machine learning.',
      ARRAY: 'An ordered list of values, usually counted from zero.',
      TENSOR: 'A multi-dimensional array, the basic currency of deep learning.',
      VECTOR: 'A one-dimensional list of numbers, or an arrow with size and direction.',
      KERNEL: 'A small filter slid across an image in a convolution.',
      BOOLEAN: 'A value that can only ever be true or false.',
      VOXEL: 'A 3D pixel, the building block of CT and MRI volumes.',
      COMPILER: 'Translates source code into something a machine can run.',
      PIPELINE: 'A chain of steps that data flows through, start to finish.',
      GRADIENT: 'The slope a model follows downhill to shrink its loss.',
      RECURSION: 'When a function solves a problem by calling itself.',
    },
  },
  {
    id: 'liver',
    name: 'Liver lab',
    words: {
      HEPATOCYTE: "The liver's main working cell, making up most of its mass.",
      FIBROSIS: 'Build-up of scar tissue after long-term injury.',
      STEATOSIS: 'Fat collecting inside liver cells, better known as fatty liver.',
      CIRRHOSIS: "Late-stage scarring that distorts the liver's structure.",
      BILIRUBIN: 'A yellow pigment left over when old red blood cells are broken down.',
      SINUSOID: 'A leaky little capillary where blood bathes the hepatocytes.',
      STELLATE: 'Star-shaped liver cells that lay down scar tissue when activated.',
      GLYCOGEN: 'Stored sugar that the liver releases between meals.',
      ALBUMIN: 'The most abundant protein in blood plasma, made by the liver.',
      LOBULE: 'A small six-sided unit of liver tissue around a central vein.',
      BIOPSY: 'A small tissue sample taken to study under the microscope.',
      BILE: 'A fluid made by the liver that helps digest fats.',
    },
  },
  {
    id: 'cosy',
    name: 'Cosy',
    words: {
      LATTE: 'Espresso topped with plenty of steamed milk.',
      PIANO: 'Eighty-eight keys, black and white.',
      PIXEL: 'One tiny square of a picture, like the ones this page is drawn with.',
      ARCADE: 'A room full of games. You are standing in one.',
      LANTERN: 'A little light in a case, for carrying through the dark.',
      BLANKET: 'Essential equipment for any rainy afternoon.',
      COOKIE: 'A small baked treat, best eaten warm.',
      TEAPOT: 'The centrepiece of any good tea party.',
      PUZZLE: 'Like this one. You are doing great.',
      CANDLE: 'Wax and a wick for a warm, flickering glow.',
      MARSHMALLOW: 'A squishy sweet, best toasted over a fire.',
      STARLIGHT: 'The faint glow of distant stars, like the sky behind this page.',
    },
  },
];

export const SIZES = [8, 10, 12] as const;
export type GridSize = (typeof SIZES)[number];

/** Smaller grids get fewer (and, by the length cap, shorter) words. */
export const WORD_COUNT: Record<GridSize, number> = { 8: 6, 10: 8, 12: 10 };

export function packById(id: string): Pack {
  return PACKS.find((p) => p.id === id) ?? PACKS[0];
}
