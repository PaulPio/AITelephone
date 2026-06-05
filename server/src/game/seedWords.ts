export const SEED_WORDS = [
  "a cat astronaut",
  "haunted lighthouse",
  "robot chef",
  "a dragon eating spaghetti",
  "surfing grandma",
  "angry toaster",
  "mushroom castle",
  "sad disco ball",
  "wizard raccoon",
  "a fish driving a taxi",
  "haunted vending machine",
  "cowboy octopus",
  "sleepy volcano",
  "alien dentist",
  "banana knight",
  "ghost on a skateboard",
  "tiny kaiju",
  "pirate pigeon",
  "cactus ballerina",
  "frog detective",
  "moon made of cheese",
  "spider DJ",
  "nervous yeti",
  "zombie wedding cake",
  "snail race car"
];

export function pickSeedWords(count: number, source = SEED_WORDS): string[] {
  if (count > source.length) {
    throw new Error("not enough seed words");
  }
  return [...source].sort(() => Math.random() - 0.5).slice(0, count);
}
