import { loadData, Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { CRYSTALS, GHOSTS } from '../content/ghosts';

/* Static requires so Metro bundles every image. Order of GHOST_SPRITES follows the tiers. */
export const GHOST_SPRITES = [
  require('../../assets/game/ghosts/01_wisp.webp'),
  require('../../assets/game/ghosts/02_boo.webp'),
  require('../../assets/game/ghosts/03_puff.webp'),
  require('../../assets/game/ghosts/04_momo.webp'),
  require('../../assets/game/ghosts/05_choco.webp'),
  require('../../assets/game/ghosts/06_dizzy.webp'),
  require('../../assets/game/ghosts/07_frosti.webp'),
  require('../../assets/game/ghosts/08_zuzu.webp'),
  require('../../assets/game/ghosts/09_nova.webp'),
  require('../../assets/game/ghosts/10_pixel.webp'),
  require('../../assets/game/ghosts/11_lumi.webp'),
  require('../../assets/game/ghosts/12_ember.webp'),
  require('../../assets/game/ghosts/13_mira.webp'),
  require('../../assets/game/ghosts/14_rori.webp'),
  require('../../assets/game/ghosts/15_cosmo.webp'),
  require('../../assets/game/ghosts/16_halo.webp'),
] as const;

export const POP_SPRITES: Record<number, number> = {
  1: require('../../assets/game/ghosts/pop_01_wisp.webp'),
  2: require('../../assets/game/ghosts/pop_02_boo.webp'),
  3: require('../../assets/game/ghosts/pop_03_puff.webp'),
  4: require('../../assets/game/ghosts/pop_04_momo.webp'),
};

export const CRYSTAL_SPRITES: Record<keyof typeof CRYSTALS, number> = {
  onyx: require('../../assets/game/crystals/onyx.webp'),
  nox: require('../../assets/game/crystals/nox.webp'),
  vanta: require('../../assets/game/crystals/vanta.webp'),
  magni: require('../../assets/game/crystals/magni.webp'),
  astra: require('../../assets/game/crystals/astra.webp'),
  hush: require('../../assets/game/crystals/hush.webp'),
};

export const IMG = {
  bgGame: require('../../assets/game/bg/bg_game_night_world.webp'),
  bgMap: require('../../assets/game/bg/bg_map_ghost_path.webp'),
  jar: require('../../assets/game/jar/jar.webp'),
  doorClosed: require('../../assets/game/door/door_closed.webp'),
  doorOpening: require('../../assets/game/door/door_opening.webp'),
  doorOpen: require('../../assets/game/door/door_open.webp'),
  mergeSpark: require('../../assets/game/fx/merge_spark.webp'),
  glowRing: require('../../assets/game/fx/glow_ring.webp'),
  glitter: require('../../assets/game/fx/glitter.webp'),
  stars: require('../../assets/game/fx/stars.webp'),
  sparkle: require('../../assets/game/fx/sparkle.webp'),
  heart: require('../../assets/game/fx/heart.webp'),
  lightOrb: require('../../assets/game/fx/light_orb.webp'),
  shootingStar: require('../../assets/game/fx/shooting_star.webp'),
  coin: require('../../assets/game/currency/coin.webp'),
  coinStack: require('../../assets/game/currency/coin_stack.webp'),
  gem: require('../../assets/game/currency/gem.webp'),
  star: require('../../assets/game/currency/star.webp'),
  starEmpty: require('../../assets/game/currency/star_empty.webp'),
  hugTag: require('../../assets/game/ui/hug_tag.webp'),
  counterPill: require('../../assets/game/ui/counter_pill.webp'),
  panel: require('../../assets/game/ui/panel.webp'),
  btnPlay: require('../../assets/game/ui/btn_play.webp'),
  btnPause: require('../../assets/game/ui/btn_pause.webp'),
  btnSettings: require('../../assets/game/ui/btn_settings.webp'),
  btnHome: require('../../assets/game/ui/btn_home.webp'),
  btnRetry: require('../../assets/game/ui/btn_retry.webp'),
  btnStore: require('../../assets/game/ui/btn_store.webp'),
  nodeOpen: require('../../assets/game/map/node_open.webp'),
  nodeCurrent: require('../../assets/game/map/node_current.webp'),
  nodeLocked: require('../../assets/game/map/node_locked.webp'),
  nodeDone: require('../../assets/game/map/node_done.webp'),
  nodeGem: require('../../assets/game/map/node_gem.webp'),
  nodeBoss: require('../../assets/game/map/node_boss_door.webp'),
} as const;

export const FONT_BOLD = require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf');

/** Every Skia image the jar scene draws, plus the canvas font. */
export interface SceneImages {
  ghosts: SkImage[];
  pops: Record<number, SkImage>;
  jar: SkImage;
  mergeSpark: SkImage;
  glowRing: SkImage;
  sparkle: SkImage;
  heart: SkImage;
  lightOrb: SkImage;
  stars: SkImage;
  coin: SkImage;
  gem: SkImage;
  magni: SkImage;
  hush: SkImage;
  hugTag: SkImage;
  typeface: SkTypeface;
}

function image(mod: number): Promise<SkImage> {
  return loadData(mod, (d) => Skia.Image.MakeImageFromEncoded(d)).then((img) => {
    if (!img) throw new Error('image failed to decode');
    return img;
  });
}

let cache: Promise<SceneImages> | null = null;

/** Decodes every scene image once (parallel), then serves the cached set. */
export function loadSceneImages(): Promise<SceneImages> {
  cache ??= (async () => {
    const [ghosts, pops, rest, typeface] = await Promise.all([
      Promise.all(GHOST_SPRITES.map(image)),
      Promise.all([1, 2, 3, 4].map((t) => image(POP_SPRITES[t]))),
      Promise.all([
        IMG.jar, IMG.mergeSpark, IMG.glowRing, IMG.sparkle, IMG.heart, IMG.lightOrb,
        IMG.stars, IMG.coin, IMG.gem, CRYSTAL_SPRITES.magni, CRYSTAL_SPRITES.hush, IMG.hugTag,
      ].map(image)),
      loadData(FONT_BOLD, (d) => Skia.Typeface.MakeFreeTypeFaceFromData(d)),
    ]);
    if (!typeface) throw new Error('font failed to load');
    const [jar, mergeSpark, glowRing, sparkle, heart, lightOrb, stars, coin, gem, magni, hush, hugTag] = rest;
    return {
      ghosts,
      pops: { 1: pops[0], 2: pops[1], 3: pops[2], 4: pops[3] },
      jar, mergeSpark, glowRing, sparkle, heart, lightOrb, stars, coin, gem, magni, hush, hugTag,
      typeface,
    };
  })();
  return cache;
}

export function useSceneImages(): SceneImages | null {
  const [images, setImages] = useState<SceneImages | null>(null);
  useEffect(() => {
    let live = true;
    loadSceneImages().then((imgs) => live && setImages(imgs));
    return () => {
      live = false;
    };
  }, []);
  return images;
}

export const GHOST_COUNT = GHOSTS.length;
