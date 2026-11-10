# Ghostly Fluffs v0.1

Cozy ghost-merging jar game. Expo SDK 58, React Native 0.88, TypeScript (strict).

## Run

    npm install            # also copies CanvasKit into public/ (postinstall)
    npx expo start         # press w = web, a = Android, scan the QR with Expo Go on iPhone/Android

- Web build: `npm run build:web` -> `dist/` (static, serve with any SPA host)
- Android/iOS: Expo Go (SDK 58) runs it as-is; store builds go through `eas build`.

## Checks

    npm run typecheck      # tsc --noEmit, strict
    npm test               # jest: rules, queue, overflow, merges, chains, hugs, cards, saves

## Layout

    src/config/tuning.ts        every gameplay number in one place
    src/physics/world.ts        deterministic position-based circle solver (no physics lib)
    src/rules/                  pure rules: game loop, seeded queue, overflow timer
    src/content/                ghosts, cards, levels (data only)
    src/render/                 Skia scene recorded once per frame + fx timeline
    src/game/controller.ts      bridges Game events to fx, sound, haptics, HUD store, saves
    src/ui/                     React Native screens and overlays (Reanimated animations)
    src/store/                  persisted profile and run save (AsyncStorage, backup slot)
    scripts/assets/             art + sound pipelines (`npm run assets`, needs uv)

## Notes

- The piece queue is seeded and never looks at the jar (design rule: "pieces are pure luck").
- A run ends only when a resting ghost stays above the line for 2 s.
- Web test hook: open with `?e2e` to expose `globalThis.__gf` (the live controller) for automation.
- SFX are procedurally generated placeholders; judge them on a real phone.
