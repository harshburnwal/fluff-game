import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, Image, StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playDaily, playEndless, playLevel } from '../navigation/flow';
import { GameController, useHud, type RunSpec } from '../game/controller';
import { IMG, useSceneImages } from '../render/assets';
import { recordScene, type SceneFonts } from '../render/drawScene';
import { computeLayout, JAR_HEIGHT, toUnits } from '../render/layout';
import { initSound } from '../services/feedback';
import { clearRun } from '../store/runSave';
import { useProfile } from '../store/profile';
import { BannerView, CardRow, ScoreAndNext, TipView, TopBar } from './Hud';
import { LastChanceOverlay, LevelCompleteOverlay, PauseOverlay, RunOverOverlay } from './Overlays';
import { COLORS } from './theme';

/** Release in this band (jar units below the rim) still counts as the drop zone. */
const ZONE_GRACE = 6;
const TAP_MS = 250;
const TAP_MOVE = 10;

type Gesture = { kind: 'aim' } | { kind: 'tap'; t0: number; x: number; y: number } | { kind: 'none' };

function emptyPicture(): SkPicture {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
}

export function GameScreen({ spec }: { spec: RunSpec }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => computeLayout(width, height, insets), [width, height, insets]);
  const images = useSceneImages();
  const fonts = useMemo<SceneFonts | null>(
    () =>
      images
        ? { small: Skia.Font(images.typeface, 15), mid: Skia.Font(images.typeface, 22), big: Skia.Font(images.typeface, 34) }
        : null,
    [images],
  );
  const ctrlRef = useRef<GameController | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new GameController(spec, layout);
  const ctrl = ctrlRef.current;
  ctrl.layout = layout;

  const picture = useSharedValue<SkPicture>(useMemo(emptyPicture, []));
  const systemReduced = useReducedMotion();
  const settings = useProfile((p) => p.settings);
  const live = useRef({ reduced: false, guide: true, sumBubble: true });
  live.current = { reduced: systemReduced || settings.reduceMotion, guide: settings.guide, sumBubble: settings.sumBubble };

  const status = useHud((s) => s.status);
  const paused = useHud((s) => s.paused);

  // the frame loop: rules and physics on a fixed step, then one recorded picture per frame
  useEffect(() => {
    if (!images || !fonts) return;
    initSound();
    let raf = 0;
    let alive = true;
    const loop = (ts: number): void => {
      if (!alive) return;
      ctrl.frame(ts / 1000);
      picture.set(
        recordScene({
          game: ctrl.game,
          layout: ctrl.layout,
          img: images,
          fonts,
          fx: ctrl.fx,
          now: ctrl.now,
          aim: ctrl.aim,
          reduced: live.current.reduced,
          guide: live.current.guide,
          sumBubble: live.current.sumBubble,
        }),
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [images, fonts, ctrl, picture]);

  // a phone call or the home button pauses silently and saves (file 01, edge cases)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && useHud.getState().status === 'playing') ctrl.setPaused(true);
    });
    return () => {
      sub.remove();
      ctrl.dispose();
    };
  }, [ctrl]);

  const gesture = useRef<Gesture>({ kind: 'none' });

  const unitsOf = (e: GestureResponderEvent): { x: number; y: number } => toUnits(layout, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const inZone = (y: number): boolean => y < ZONE_GRACE;

  const onGrant = (e: GestureResponderEvent): void => {
    if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) return;
    const u = unitsOf(e);
    if (u.y < 0 && e.nativeEvent.pageY > layout.sceneTop) {
      gesture.current = { kind: 'aim' };
      ctrl.aimAt(u.x, true);
    } else if (u.y >= 0 && u.y <= JAR_HEIGHT + 4 && u.x >= -4 && u.x <= 104) {
      gesture.current = { kind: 'tap', t0: Date.now(), x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    } else {
      gesture.current = { kind: 'none' };
    }
  };

  const onMove = (e: GestureResponderEvent): void => {
    if (gesture.current.kind !== 'aim') return;
    const u = unitsOf(e);
    ctrl.aimAt(u.x, inZone(u.y));
  };

  const onRelease = (e: GestureResponderEvent): void => {
    const g = gesture.current;
    gesture.current = { kind: 'none' };
    const u = unitsOf(e);
    if (g.kind === 'aim') {
      ctrl.release(u.x, inZone(u.y));
    } else if (g.kind === 'tap') {
      const moved = Math.hypot(e.nativeEvent.pageX - g.x, e.nativeEvent.pageY - g.y);
      if (Date.now() - g.t0 <= TAP_MS && moved < TAP_MOVE) ctrl.tapJar(u.x, u.y);
    }
  };

  const onTerminate = (): void => {
    gesture.current = { kind: 'none' };
    ctrl.cancelAim();
  };

  const restart = (): void => {
    clearRun();
    if (spec.mode === 'journey' && spec.level) playLevel(spec.level.id);
    else if (spec.mode === 'daily') playDaily();
    else playEndless();
  };

  return (
    <View style={styles.root}>
      <Image source={IMG.bgGame} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.veil} pointerEvents="none" />
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Picture picture={picture} />
      </Canvas>
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onTerminate}
        accessibilityLabel="Jar. Drag above the jar to aim, release to drop. Tap ghosts inside the jar to hug."
      />
      <ScoreAndNext layout={layout} />
      <TopBar layout={layout} ctrl={ctrl} onPause={() => ctrl.setPaused(true)} />
      <CardRow layout={layout} ctrl={ctrl} />
      <BannerView layout={layout} />
      <TipView layout={layout} ctrl={ctrl} />
      {paused && status === 'playing' ? <PauseOverlay ctrl={ctrl} onRestart={restart} /> : null}
      {status === 'lost' ? <LastChanceOverlay ctrl={ctrl} /> : null}
      {status === 'won' ? <LevelCompleteOverlay /> : null}
      {status === 'over' ? <RunOverOverlay onAgain={restart} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.nightDeep, overflow: 'hidden' },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 6, 32, 0.25)' },
});
