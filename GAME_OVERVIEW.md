# Gartic AI Game Overview

This game is a cursed, AI-powered twist on Gartic Phone.

Players take turns drawing a prompt, but before the drawing moves to the next player, the game runs it through an image-to-image AI model. The AI tries to turn the rough sketch into something more realistic while preserving the original idea. The result should look recognizable, but unsettling, absurd, or accidentally horrifying.

For example, a player might draw a cursed stick figure, a weird dog, or a lopsided face. The AI then transforms that drawing into a realistic version of the same subject, creating something that feels like the sketch came to life in the worst possible way.

## How The Game Works

1. A game room is created and players join.
2. Each round starts with a prompt.
3. A player draws their interpretation of the prompt.
4. The drawing is submitted as an image.
5. The server sends that image to an image-to-image AI pipeline.
6. The AI returns a realistic but cursed version of the drawing.
7. The transformed image is passed to the next player.
8. The next player guesses, redraws, or continues the chain depending on the round rules.
9. At the end, everyone sees the full chain from prompt to drawings to AI mutations.

The fun comes from the gap between the player's messy drawing and the AI's overly serious attempt to make it real.

## Architecture Overview

The implementation can be thought of as four main parts:

## Client

The client is the player's browser experience. It handles joining rooms, showing prompts, drawing on a canvas, submitting drawings, and viewing the final reveal.

Key responsibilities:

- Drawing canvas and brush controls
- Room and player UI
- Prompt, guess, and reveal screens
- Uploading the finished drawing to the server
- Displaying the AI-transformed result

## Game Server

The game server owns the multiplayer state. It tracks rooms, players, turns, prompts, drawings, generated images, and reveal chains.

Key responsibilities:

- Creating and joining rooms
- Assigning prompts and turns
- Receiving drawing submissions
- Moving each chain to the next player
- Broadcasting state updates to connected clients
- Storing the history needed for the final reveal

## AI Image Pipeline

The AI image pipeline takes a player's submitted drawing and runs image-to-image generation on it.

Key responsibilities:

- Accepting the raw drawing image
- Building a prompt that asks for a realistic but cursed interpretation
- Calling the image generation model
- Returning the generated image URL or file path
- Handling failures so the game can continue if generation breaks

The prompt should preserve the subject of the drawing while pushing the style toward realistic, uncanny, and funny-horrible rather than polished or cute.

## Storage

Storage keeps the game artifacts available during and after a match.

Key responsibilities:

- Original player drawings
- AI-transformed images
- Prompt and guess history
- Room state, if games need to survive refreshes or reconnects

For a small prototype, this can be local files plus in-memory room state. For a deployed version, drawings and generated images should live in object storage, while room and turn state should live in a database or fast key-value store.

## Data Flow

```text
Player draws
  -> Client exports canvas image
  -> Server receives submission
  -> Server sends image to AI pipeline
  -> AI returns cursed realistic image
  -> Server saves both images
  -> Server advances the chain
  -> Next player receives the transformed image
```

## Design Goal

The game should feel simple to play and chaotic to watch. The technology should stay mostly invisible: players draw, submit, laugh at the cursed AI result, and keep the chain moving.
