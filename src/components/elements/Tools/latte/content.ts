// Words for Latte: true guinea pig facts for the thought bubbles, the food
// menu, and what Latte says about each need.
import type { StatKey, Stats } from './model';

export const FACTS: string[] = [
  'Happy guinea pigs "popcorn": they leap straight up and twist in mid-air.',
  'A loud "wheek wheek!" usually means a guinea pig thinks food is coming.',
  "Guinea pigs can't make their own vitamin C, so it has to come from food.",
  "A guinea pig's teeth never stop growing. Chewing hay keeps them short.",
  'Hay should be most of what a guinea pig eats, every single day.',
  'Guinea pigs are social and are happiest living with a guinea pig friend.',
  'In Switzerland it is against the law to keep just one guinea pig.',
  'A low, rumbly purr means a guinea pig is feeling content.',
  'Baby guinea pigs are born with fur and open eyes, and can run within hours.',
  "Guinea pigs come from the Andes. They aren't from Guinea, and they aren't pigs!",
  'Guinea pigs can sleep with their eyes open, in lots of short naps.',
  'Guinea pigs have 20 teeth.',
  'A group of guinea pigs is called a herd.',
  'Guinea pigs have four toes on each front foot and three on each back foot.',
  'Guinea pigs like a hidey house. Somewhere to hide helps them feel safe.',
  'A soft "chut chut" means a guinea pig is happily exploring.',
  'Long-haired guinea pigs, like me, need regular brushing.',
];

export type FoodId = 'lettuce' | 'pepper' | 'hay' | 'carrot';

export interface Food {
  id: FoodId;
  name: string;
  note: string;
  gain: Partial<Stats>;
  treat?: boolean;
  says: string[];
}

export const FOODS: Food[] = [
  {
    id: 'hay',
    name: 'Hay',
    note: 'everyday',
    gain: { fullness: 22, happiness: 3 },
    says: ['Munch munch munch! Fresh hay!', 'Hay is most of my diet, and chewing it keeps my teeth nice and short.'],
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    note: 'romaine',
    gain: { fullness: 14, happiness: 5 },
    says: ['Crunchy romaine! Munch munch.', 'Leafy greens, yes please. (Not iceberg, though. It has hardly any nutrients.)'],
  },
  {
    id: 'pepper',
    name: 'Bell pepper',
    note: 'vitamin C',
    gain: { fullness: 12, happiness: 7 },
    says: ['Bell pepper! Crunch crunch!', "It's packed with vitamin C, which guinea pigs can't make for themselves."],
  },
  {
    id: 'carrot',
    name: 'Carrot',
    note: 'treat',
    treat: true,
    gain: { fullness: 7, happiness: 13 },
    says: ['A carrot! Wheek wheek!', "Carrots are sugary, so they're a little treat, not a meal."],
  },
];

export const NEED_LINES: Record<StatKey, string> = {
  fullness: 'My tummy is rumbling. Some hay or veggies, please?',
  happiness: "I'm feeling a bit lonely. Pet me, or let's play?",
  energy: "I'm so sleepy... a nap would be lovely.",
  cleanliness: 'My cage is getting messy. Could you tidy it up?',
};

export const MOOD_WORD: Record<StatKey, string> = {
  fullness: 'Hungry',
  happiness: 'Lonely',
  energy: 'Sleepy',
  cleanliness: 'Grumpy',
};

export const PET_LINES = [
  'Purrrr... (A low purr means a happy guinea pig.)',
  'Wheek! More chin scratches, please.',
  'Chut chut chut... (my happy exploring noise)',
  'Purr... right behind the ears. Perfect.',
];
