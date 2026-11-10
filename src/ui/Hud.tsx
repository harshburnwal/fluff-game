import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { css, FadeOut, SlideInUp, SlideOutUp, FadeIn } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { CARDS, type CardId } from '../content/cards';
import { ghost } from '../content/ghosts';
import { useHud, type GameController } from '../game/controller';
import { CARD_ROW, TOP_BAR, type Layout } from '../render/layout';
import { CRYSTAL_SPRITES, GHOST_SPRITES, IMG } from '../render/assets';
import { useProfile } from '../store/profile';
import { Counter, ImageButton, PressableScale } from './components';
import { COLORS, CURVE, FONT } from './theme';

export function TopBar({ layout, ctrl, onPause }: { layout: Layout; ctrl: GameController; onPause: () => void }) {
  const { goal, progress, target, pendingCoins, pendingGems, coinBump, gemBump } = useHud(
    useShallow((s) => ({ goal: s.goal, progress: s.progress, target: s.target, pendingCoins: s.pendingCoins, pendingGems: s.pendingGems, coinBump: s.coinBump, gemBump: s.gemBump })),
  );
  const { coins, gems, seenCoins, seenGems } = useProfile(useShallow((p) => ({ coins: p.coins, gems: p.gems, seenCoins: p.seenCoins, seenGems: p.seenGems })));
  const level = ctrl.spec.level;
  const reach = level?.goal.kind === 'reach';
  const progressText = target ? (reach ? (progress >= target ? 'Done!' : '') : `${Math.min(progress, target).toLocaleString('en-US')} / ${target.toLocaleString('en-US')}`) : '';
  return (
    <View style={[styles.topBar, { top: layout.insets.top, left: layout.colX, width: layout.colW, height: TOP_BAR }]} pointerEvents="box-none">
      <ImageButton source={IMG.btnPause} size={46} onPress={onPause} label="Pause" />
      <View style={styles.goalChip} accessibilityLabel={`Goal: ${goal}`}>
        <Text style={styles.goalLevel} numberOfLines={1}>
          {level ? `Level ${level.id}` : goal}
        </Text>
        {level ? (
          <Text style={styles.goalText} numberOfLines={1}>
            {goal} {progressText ? <Text style={styles.goalProgress}>{progressText}</Text> : null}
          </Text>
        ) : null}
      </View>
      <View style={styles.counters} pointerEvents="none">
        {seenCoins ? <Counter icon={IMG.coin} value={coins - pendingCoins} bumpKey={coinBump} /> : null}
        {seenGems ? <Counter icon={IMG.gem} value={gems - pendingGems} bumpKey={gemBump} /> : null}
      </View>
    </View>
  );
}

export function ScoreAndNext({ layout }: { layout: Layout }) {
  const { score, next } = useHud(useShallow((s) => ({ score: s.score, next: s.next })));
  return (
    <>
      <Text style={[styles.score, { top: layout.sceneTop + 2, left: layout.colX, width: layout.colW }]} pointerEvents="none" accessibilityLabel={`Score ${score}`}>
        {score.toLocaleString('en-US')}
      </Text>
      <View style={[styles.next, { top: layout.sceneTop + 6, left: layout.colX + layout.colW - 74 }]} pointerEvents="none" accessibilityLabel={`Next ${ghost(next).name} ${ghost(next).value}`}>
        <Text style={styles.nextLabel}>Next</Text>
        <Image source={GHOST_SPRITES[next - 1]} style={styles.nextImg} resizeMode="contain" />
      </View>
    </>
  );
}

const readyGlow = css.keyframes({
  from: { opacity: 0.45 },
  to: { opacity: 1 },
});

const readyBounce = css.keyframes({
  '0%': { transform: [{ scale: 1 }] },
  '45%': { transform: [{ scale: 1.08 }] },
  '100%': { transform: [{ scale: 1 }] },
});

function CardIcon({ id }: { id: CardId }) {
  const crystal = CARDS[id].crystal;
  if (crystal) return <Image source={CRYSTAL_SPRITES[crystal]} style={styles.cardImg} resizeMode="contain" />;
  return <Text style={styles.cardGlyph}>{id === 'shake' ? '〰' : '⇄'}</Text>;
}

export function CardRow({ layout, ctrl }: { layout: Layout; ctrl: GameController }) {
  const cards = useHud((s) => s.cards);
  if (!cards.length) return null;
  return (
    <View style={[styles.cardRow, { bottom: layout.insets.bottom + 6, left: layout.colX, width: layout.colW, height: CARD_ROW - 10 }]} pointerEvents="box-none">
      {cards.map((c, i) => {
        const spent = c.uses >= c.max;
        const ready = !spent && c.charge >= c.need;
        const fill = spent ? 0 : Math.min(1, c.charge / c.need);
        return (
          <PressableScale
            key={c.id}
            label={`${CARDS[c.id].name}${ready ? ', ready, hold to use' : `, ${c.charge} of ${c.need}`}`}
            onLongPress={() => ready && ctrl.useCard(i)}
            delayLongPress={150}
            disabled={spent}
            silent
            style={styles.card}
          >
            {ready ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  styles.cardReadyGlow,
                  { animationName: readyGlow, animationDuration: 800, animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out' },
                ]}
              />
            ) : null}
            <Animated.View style={ready ? { animationName: readyBounce, animationDuration: 250, animationTimingFunction: CURVE.out } : undefined}>
              <CardIcon id={c.id} />
            </Animated.View>
            <Text style={styles.cardName} numberOfLines={1}>
              {CARDS[c.id].name}
            </Text>
            <View style={styles.cardBar}>
              <View style={[styles.cardBarFill, { width: `${fill * 100}%`, backgroundColor: ready ? COLORS.gold : COLORS.lilac }]} />
            </View>
            <Text style={styles.cardUses}>{spent ? 'used' : ready ? 'hold' : `${c.max - c.uses} left`}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function BannerView({ layout }: { layout: Layout }) {
  const banner = useHud((s) => s.banner);
  if (!banner) return null;
  return (
    <Animated.View
      key={banner.id}
      entering={SlideInUp.duration(200)}
      exiting={SlideOutUp.duration(150)}
      style={[styles.banner, { top: layout.sceneTop + 40, left: layout.colX + 24, width: layout.colW - 48 }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      {banner.tier ? <Image source={GHOST_SPRITES[banner.tier - 1]} style={styles.bannerImg} resizeMode="contain" /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.bannerText}>{banner.text}</Text>
        {banner.sub ? <Text style={styles.bannerSub}>{banner.sub}</Text> : null}
      </View>
    </Animated.View>
  );
}

const slide = css.keyframes({
  '0%': { transform: [{ translateX: -60 }] },
  '100%': { transform: [{ translateX: 60 }] },
});

const tap = css.keyframes({
  '0%': { transform: [{ scale: 1 }], opacity: 0.9 },
  '50%': { transform: [{ scale: 0.8 }], opacity: 1 },
  '100%': { transform: [{ scale: 1 }], opacity: 0.9 },
});

const TIP_TEXT: Record<string, string> = {
  drag: 'Drag and drop',
  merge: 'Same friends merge',
  hug: 'Tap friends that make 10',
  danger: 'Keep friends below the line, or hug them out',
};

/** One idea at a time, shown not told (file 03): a ghost finger plus three words. */
export function TipView({ layout, ctrl }: { layout: Layout; ctrl: GameController }) {
  const tip = useHud((s) => s.tip);
  useEffect(() => {
    if (tip !== 'hug') return;
    const id = setTimeout(() => useHud.getState().tip === 'hug' && useHud.setState({ tip: null }), 9000);
    return () => clearTimeout(id);
  }, [tip]);
  if (!tip) return null;
  let finger: { x: number; y: number } | null = null;
  if (tip === 'drag') finger = { x: layout.ox + 50 * layout.s, y: layout.oy - 20 * layout.s };
  if (tip === 'hug') {
    const bodies = ctrl.game.world.bodies;
    if (bodies[0]) finger = { x: layout.ox + bodies[0].x * layout.s, y: layout.oy + bodies[0].y * layout.s };
  }
  return (
    <>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.tip, { top: layout.oy + 30 * layout.s, left: layout.colX + 20, width: layout.colW - 40 }]} pointerEvents="none">
        <Text style={styles.tipText}>{TIP_TEXT[tip]}</Text>
      </Animated.View>
      {finger ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.finger,
            { left: finger.x - 18, top: finger.y - 18 },
            tip === 'drag'
              ? { animationName: slide, animationDuration: 1400, animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: CURVE.inOut }
              : { animationName: tap, animationDuration: 900, animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
          ]}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 },
  goalChip: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(20, 12, 54, 0.78)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(170, 150, 255, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  goalLevel: { color: COLORS.gold, fontFamily: FONT.bold, fontSize: 13 },
  goalText: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 14 },
  goalProgress: { color: COLORS.lilac, fontFamily: FONT.bold },
  counters: { flexDirection: 'row', gap: 6 },
  score: {
    position: 'absolute',
    textAlign: 'center',
    color: COLORS.text,
    fontFamily: FONT.bold,
    fontSize: 30,
    textShadowColor: 'rgba(143, 123, 255, 0.9)',
    textShadowRadius: 12,
  },
  next: {
    position: 'absolute',
    width: 62,
    height: 70,
    borderRadius: 18,
    backgroundColor: 'rgba(20, 12, 54, 0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(170, 150, 255, 0.55)',
    alignItems: 'center',
    paddingTop: 2,
  },
  nextLabel: { color: COLORS.textDim, fontFamily: FONT.semi, fontSize: 11 },
  nextImg: { width: 46, height: 46 },
  cardRow: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  card: {
    width: 96,
    height: 76,
    borderRadius: 18,
    backgroundColor: 'rgba(28, 18, 72, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(170, 150, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardReadyGlow: { borderRadius: 18, borderWidth: 2.5, borderColor: COLORS.gold, backgroundColor: 'rgba(255, 215, 106, 0.12)' },
  cardImg: { width: 34, height: 34 },
  cardGlyph: { color: COLORS.mint, fontFamily: FONT.bold, fontSize: 26, height: 34, lineHeight: 34 },
  cardName: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 11, marginTop: 1 },
  cardBar: { width: 70, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 3, overflow: 'hidden' },
  cardBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  cardUses: { color: COLORS.textDim, fontFamily: FONT.regular, fontSize: 10 },
  banner: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(34, 22, 90, 0.95)',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.pink,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bannerImg: { width: 44, height: 44 },
  bannerText: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 18 },
  bannerSub: { color: COLORS.lilac, fontFamily: FONT.regular, fontSize: 13 },
  tip: { position: 'absolute', alignItems: 'center' },
  tipText: {
    color: COLORS.text,
    fontFamily: FONT.bold,
    fontSize: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(10, 6, 32, 0.95)',
    textShadowRadius: 10,
  },
  finger: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 3,
    borderColor: 'rgba(255,158,216,0.9)',
  },
});
