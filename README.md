# 🟤 Pyttpytt

A cozy, non-violent real-time strategy game about mud people — a mobile-first
PWA recreation of **Mudcraft** (The LlamaPad, 2008), optimized for the
iPhone SE (3rd gen) in landscape. All art, sound, and code are original.

**Play:** https://eventyrlauget.github.io/pyttpytt/ — add it to your home
screen for fullscreen offline play.

## How it works

- Mud people gather **dirt** 🟤 and **water** 💧 and haul it to the **mud pit**.
- **15 dirt + 15 water** at the pit automatically creates a new mud person.
- 🌧 **Rain melts** exposed mud people (revive the puddle with dirt);
  ☀️ **sun dries** them (revive with water).
- Carrying the opposite resource **shields** you: a mud person hauling
  💧 water shrugs off the sun, and one hauling 🟤 dirt won't melt in the rain.
- ⛺ **Huts** (8 dirt + 8 water, built by workers in three stages) shelter
  5 mud people each. Rain damages unfinished huts.
- Reach each level's population/hut goal to advance. Levels are **procedurally
  generated** with escalating weather — endless, no paywall.

## Controls (touch)

| Gesture | Action |
| --- | --- |
| Tap mud person | Select |
| Long-press + drag | Box-select a group |
| Tap pond / dirt hole / pit / hut | Command selection (gather, deposit, build/enter) |
| Tap fallen friend | Revive |
| Tap ground | Move |
| Drag ground | Pan camera |
| Pinch | Zoom |
| Minimap tap | Jump camera |

Desktop niceties: original Mudcraft hotkeys (`s d w g r h x f i a`, Enter,
Space), mouse wheel zoom, right-click to command.

## Not yet implemented (from the original)

Frogs & turtles, torches/weather steering, sticks, flower beds and the
beauty score, dead/revivable landmarks (dried ponds, dead pits), and the
five-part scoring. The level-complete screen tracks time/growth/losses.

## Development

Plain ES modules, no build step — serve the repo root with any static
server (`python3 -m http.server`) and open `http://localhost:8000`.
Deployed to GitHub Pages by `.github/workflows/deploy.yml` on push to `main`.
When releasing a change, bump `CACHE` in `sw.js` so installed PWAs pick it up.
