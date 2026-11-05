# Glitch Runner

A browser game collection with three games, sound effects and music, local accounts, and three levels per game. No install or server needed.

## Games

**Glitch Runner.** A jungle platformer. Glitch tiles flip gravity, scramble your controls, or invert the colors. Stack two glitches at the same time to open the gate and find the hidden bug. Clear the level for points.

**Vibe Heist.** A stealth game. Sneak past guards whose vision cones show in green, and steal three gems. Get caught and you lose a heart.

**Spirit Café.** A cozy serving game. Ghost customers order Latte, Mocha, or Tea. Tap a customer, then tap the right drink before their patience runs out.

## Features

- Landing page with an animated logo and falling leaves
- Local sign-up and log-in with a username and password, stored on the device
- Three playable characters: Vine Runner, Spirit Runner, and Hill Sprinter
- Three levels per game, with harder settings in each
- Live points, hearts for lives, and a level indicator during play
- Sound effects and a background track for each game, with a sound on/off button
- Exit page during play (press Esc or the ✕ Exit button), with Resume

## How to play

1. Press **Play** on the landing page and sign up or log in.
2. Pick a game, a character, and a level.
3. Press **Start run**.
4. When the run ends, the screen shows your points.

### Controls

| Action | Keyboard | Phone |
| --- | --- | --- |
| Move left / right | ← → or A / D | On-screen ◀ ▶ buttons |
| Jump (Glitch Runner) | Space, ↑, or W | On-screen JUMP button |
| Move up / down (Vibe Heist) | ↑ ↓ or W / S | Tap the screen (limited) |
| Select a customer and serve (Spirit Café) | Click or tap | Tap |
| Restart a run in Glitch Runner | R | — |
| Open the exit page | Esc | ✕ Exit button |

## Run it on your computer

No install needed. Download or clone this repository, then open **index.html** in any modern browser.

For the best experience in VS Code, install the **Live Server** extension, right-click **index.html**, and choose **Open with Live Server**.

## Project files

- **index.html**: the page layout
- **style.css**: all styling and animations
- **game.js**: all game logic, levels, sound, and accounts

## Publish it

**GitHub Pages:** go to **Settings → Pages**, choose the **main** branch and **/ (root)**, then save. Your game will be at `https://<your-username>.github.io/glitch-runner/`.

**Netlify:** drag the project folder onto https://app.netlify.com/drop.

## Notes

- Accounts and scores are saved in each player's browser. They are not sent to a server, so they don't sync between devices.
- All art and sound is generated in code. The game doesn't use copyrighted characters, songs, or images.

## License

Add a license here before you share the code publicly, for example MIT.
