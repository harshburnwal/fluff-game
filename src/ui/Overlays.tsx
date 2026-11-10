import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { css, FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { playLevel } from '../navigation/flow';
import { useNav } from '../navigation/nav';
import { CARDS } from '../content/cards';
import { goalText, levelFor } from '../content/levels';
import { RULES } from '../config/tuning';
import { useHud, type GameController } from '../game/controller';
import { CRYSTAL_SPRITES, IMG } from '../render/assets';
import { haptic, play } from '../services/feedback';
import { useProfile } from '../store/profile';
import { Panel, WideButton } from './components';
import { COLORS, CURVE, FONT } from './theme';

function Scrim({ children }: { children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.scrim}>
      {children}
    </Animated.View>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <Animated.View entering={SlideInDown.duration(220).easing(CURVE.drawer as never)} style={styles.sheetWrap}>
      <Panel style={styles.sheet}>{children}</Panel>
    </Animated.View>
  );
}

export function PauseOverlay({ ctrl, onRestart }: { ctrl: GameController; onRestart: () => void }) {
  const sound = useProfile((p) => p.settings.sound);
  const setSetting = useProfile((p) => p.setSetting);
  return (
    <Scrim>
      <Sheet>
        <Text style={styles.title}>Paused</Text>
        <Text style={styles.body}>Your jar is saved. Nothing is lost.</Text>
        <View style={styles.col}>
          <WideButton title="Resume" onPress={() => ctrl.setPaused(false)} />
          <WideButton title={sound ? 'Sound: on' : 'Sound: off'} tone="violet" onPress={() => setSetting('sound', !sound)} />
          <WideButton title="Restart" tone="violet" onPress={onRestart} />
          <WideButton
            title="Map"
            tone="violet"
            onPress={() => {
              ctrl.save();
              useNav.getState().go({ name: 'map' });
            }}
          />
        </View>
      </Sheet>
    </Scrim>
  );
}

/** Last Chance (file 01 section 10): one Fluff Save per run, paid with coins or gems. */
export function LastChanceOverlay({ ctrl }: { ctrl: GameController }) {
  const { coins, gems } = useProfile(useShallow((p) => ({ coins: p.coins, gems: p.gems })));
  const reviveUsed = useHud((s) => s.reviveUsed);
  const canOffer = !reviveUsed;
  return (
    <Scrim>
      <Sheet>
        <Text style={styles.title}>The jar is full</Text>
        {canOffer ? (
          <>
            <Text style={styles.body}>Fluff Save: the 6 smallest ghosts hop out and you keep going. Once per run.</Text>
            <View style={styles.col}>
              <WideButton title={`Save for ${RULES.reviveCoins} coins`} sub={`You have ${coins}`} tone="gold" disabled={coins < RULES.reviveCoins} onPress={() => ctrl.revive('coins')} />
              <WideButton title={`Save for ${RULES.reviveGems} gems`} sub={`You have ${gems}`} tone="violet" disabled={gems < RULES.reviveGems} onPress={() => ctrl.revive('gems')} />
              <WideButton title="No thanks" tone="violet" onPress={() => ctrl.giveUp()} />
            </View>
          </>
        ) : (
          <View style={styles.col}>
            <WideButton title="See result" onPress={() => ctrl.giveUp()} />
          </View>
        )}
      </Sheet>
    </Scrim>
  );
}

const starPop = css.keyframes({
  '0%': { transform: [{ scale: 0.6 }], opacity: 0 },
  '60%': { transform: [{ scale: 1.15 }], opacity: 1 },
  '100%': { transform: [{ scale: 1 }], opacity: 1 },
});

function Stars({ count }: { count: number }) {
  useEffect(() => {
    const timers = [0, 1, 2].filter((i) => i < count).map((i) => setTimeout(() => {
      play(i === 0 ? 'star1' : i === 1 ? 'star2' : 'star3');
      haptic('light');
    }, 350 + i * 150));
    return () => timers.forEach(clearTimeout);
  }, [count]);
  return (
    <View style={styles.stars}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.starSlot, i === 1 && { marginTop: -14 }]}>
          <Image source={IMG.starEmpty} style={styles.starImg} />
          {i < count ? (
            <Animated.Image
              source={IMG.star}
              style={[styles.starImg, StyleSheet.absoluteFill, { animationName: starPop, animationDuration: 200, animationDelay: 350 + i * 150, animationFillMode: 'both', animationTimingFunction: CURVE.out }]}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function LevelCompleteOverlay() {
  const result = useHud((s) => s.result);
  const [door, setDoor] = useState(false);
  if (!result || result.mode !== 'journey' || !result.levelId) return null;
  const next = levelFor(result.levelId + 1);
  const reward = result.reward;
  if (door) return <DoorTransition onDone={() => playLevel(next.id)} />;
  return (
    <Scrim>
      <Sheet>
        <Text style={styles.kicker}>Level {result.levelId}</Text>
        <Text style={styles.title}>Level complete!</Text>
        <Stars count={result.stars ?? 1} />
        <Text style={styles.body}>Score {result.score.toLocaleString('en-US')}</Text>
        <View style={styles.rewards}>
          {reward?.coins ? (
            <View style={styles.reward}>
              <Image source={IMG.coin} style={styles.rewardImg} />
              <Text style={styles.rewardText}>+{reward.coins}</Text>
            </View>
          ) : null}
          {reward?.gems ? (
            <View style={styles.reward}>
              <Image source={IMG.gem} style={styles.rewardImg} />
              <Text style={styles.rewardText}>+{reward.gems}</Text>
            </View>
          ) : null}
        </View>
        {reward?.card ? (
          <View style={styles.gift}>
            {CARDS[reward.card].crystal ? <Image source={CRYSTAL_SPRITES[CARDS[reward.card].crystal!]} style={styles.giftImg} /> : null}
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.giftTitle}>New card: {CARDS[reward.card].name}</Text>
              <Text style={styles.giftBody}>{CARDS[reward.card].blurb}</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.nextGoal}>Next: {goalText(next.goal)}</Text>
        <View style={styles.col}>
          <WideButton
            title="Next level"
            onPress={() => {
              play('door');
              setDoor(true);
            }}
          />
          <WideButton title="Map" tone="violet" onPress={() => useNav.getState().go({ name: 'map' })} />
        </View>
      </Sheet>
    </Scrim>
  );
}

const doorIn = css.keyframes({
  from: { transform: [{ translateY: 60 }, { scale: 0.92 }], opacity: 0 },
  to: { transform: [{ translateY: 0 }, { scale: 1 }], opacity: 1 },
});

const flash = css.keyframes({
  '0%': { opacity: 0 },
  '60%': { opacity: 1 },
  '100%': { opacity: 1 },
});

const pushIn = css.keyframes({
  from: { transform: [{ scale: 1 }] },
  to: { transform: [{ scale: 1.6 }] },
});

/**
 * The magical door between levels (assets/ASSET-LIST section 3): the door rises closed,
 * opens, light spills, the camera pushes through, a white flash, then the next level.
 */
export function DoorTransition({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 520),
      setTimeout(() => {
        setPhase(2);
        haptic('medium');
      }, 860),
      setTimeout(() => setPhase(3), 1250),
      setTimeout(onDone, 1550),
    ];
    return () => t.forEach(clearTimeout);
  }, [onDone]);
  const src = phase === 0 ? IMG.doorClosed : phase === 1 ? IMG.doorOpening : IMG.doorOpen;
  return (
    <View style={styles.doorScrim}>
      <Animated.View style={[styles.doorWrap, { animationName: doorIn, animationDuration: 320, animationTimingFunction: CURVE.out }]}>
        <Animated.Image
          source={src}
          resizeMode="contain"
          style={[styles.door, phase >= 2 ? { animationName: pushIn, animationDuration: 600, animationFillMode: 'forwards', animationTimingFunction: CURVE.inOut } : null]}
        />
      </Animated.View>
      {phase === 3 ? <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { animationName: flash, animationDuration: 300, animationFillMode: 'forwards' }]} /> : null}
    </View>
  );
}

export function RunOverOverlay({ onAgain }: { onAgain: () => void }) {
  const result = useHud((s) => s.result);
  const best = useProfile((p) => p.bestEndless);
  if (!result || result.mode === 'journey') return null;
  return (
    <Scrim>
      <Sheet>
        <Text style={styles.kicker}>{result.mode === 'daily' ? 'Daily Jar' : 'Endless Jar'}</Text>
        <Text style={styles.title}>{result.best ? 'New best!' : 'Nice run!'}</Text>
        <Text style={styles.bigScore}>{result.score.toLocaleString('en-US')}</Text>
        {result.mode === 'endless' ? <Text style={styles.body}>Best {Math.max(best, result.score).toLocaleString('en-US')}</Text> : null}
        <View style={styles.rewards}>
          {result.coins ? (
            <View style={styles.reward}>
              <Image source={IMG.coin} style={styles.rewardImg} />
              <Text style={styles.rewardText}>+{result.coins}</Text>
            </View>
          ) : null}
          {result.gems ? (
            <View style={styles.reward}>
              <Image source={IMG.gem} style={styles.rewardImg} />
              <Text style={styles.rewardText}>+{result.gems}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.col}>
          <WideButton title="Play again" onPress={onAgain} />
          <WideButton title="Map" tone="violet" onPress={() => useNav.getState().go({ name: 'map' })} />
        </View>
      </Sheet>
    </Scrim>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.scrim, justifyContent: 'center', alignItems: 'center', padding: 18 },
  sheetWrap: { width: '100%', maxWidth: 420 },
  sheet: { alignItems: 'center' },
  col: { alignSelf: 'stretch', gap: 10, marginTop: 14 },
  kicker: { color: COLORS.gold, fontFamily: FONT.bold, fontSize: 15 },
  title: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 28, textAlign: 'center' },
  body: { color: COLORS.textDim, fontFamily: FONT.regular, fontSize: 16, textAlign: 'center', marginTop: 6 },
  bigScore: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 44, marginTop: 4 },
  stars: { flexDirection: 'row', gap: 6, marginVertical: 10 },
  starSlot: { width: 64, height: 64 },
  starImg: { width: 64, height: 64 },
  rewards: { flexDirection: 'row', gap: 18, marginTop: 10 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardImg: { width: 34, height: 34 },
  rewardText: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 20 },
  gift: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 10 },
  giftImg: { width: 48, height: 48 },
  giftTitle: { color: COLORS.gold, fontFamily: FONT.bold, fontSize: 16 },
  giftBody: { color: COLORS.textDim, fontFamily: FONT.regular, fontSize: 13 },
  nextGoal: { color: COLORS.lilac, fontFamily: FONT.semi, fontSize: 14, marginTop: 12 },
  doorScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,4,24,0.88)', alignItems: 'center', justifyContent: 'center' },
  doorWrap: { width: '86%', maxWidth: 420, aspectRatio: 0.62 },
  door: { width: '100%', height: '100%' },
  flash: { backgroundColor: '#fffaf0' },
});
