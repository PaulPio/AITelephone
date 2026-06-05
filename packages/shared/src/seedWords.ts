export const SEED_WORDS = [
  "a cat astronaut",
  "haunted lighthouse",
  "robot chef",
  "a dragon eating spaghetti",
  "surfing grandma",
  "pizza submarine",
  "disco cactus",
  "wizard on a skateboard",
  "emotional toaster",
  "giraffe in a tuxedo",
  "underwater library",
  "time-traveling snail",
  "breakdancing potato",
  "cloud sheep",
  "vampire barista",
  "flying pig bank",
  "jazz-playing octopus",
  "cursed garden gnome",
  "moonlight raccoon",
  "banana king",
  "haunted vacuum",
  "space cowboy frog",
  "melting clock tower",
  "detective rubber duck",
  "alien pen pal",
  "tap-dancing skeleton",
  "origami whale",
  "sleepy volcano",
  "neon flamingo",
  "pirate hamster",
  "upside-down treehouse",
  "glitchy rainbow",
  "sock puppet president",
  "tiny kraken",
  "bubble bath yeti",
  "clockwork butterfly",
  "mushroom city",
  "grumpy sun",
  "paper airplane dragon",
  "cosmic hot dog",
  "ghost librarian",
  "arm wrestling cactus",
  "sneezing dragon",
  "train made of cheese",
  "invisible dog parade",
  "storm in a teacup",
  "breakfast on the moon",
  "knight with a balloon sword",
  "singing cactus choir",
  "lost UFO keys",
] as const;

export function pickSeedWords(count: number): string[] {
  const pool = [...SEED_WORDS];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked;
}
