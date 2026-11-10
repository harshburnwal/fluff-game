import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import Animated, { css, FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { playDaily, playEndless, playLevel } from '../app/flow';
import { useNav } from '../app/nav';
import { CARD_ORDER, CARDS, type CardId } from '../content/cards';
import { GHOSTS } from '../content/ghosts';
import { goalText, levelFor, regionName } from '../content/levels';
import { ECONOMY } from '../config/tuning';
import { CRYSTAL_SPRITES, GHOST_SPRITES, IMG } from '../render/assets';
import { UNLOCKS, useProfile, utcDay } from '../store/profile';
import { Counter, ImageButton, Panel, PressableScale, WideButton } from './components';
import { COLORS, CURVE, FONT } from './theme';

const STEP = 118;
const NODE = 84;

const pulse = css.keyframes({
  from: { transform: [{ scale: 1 }] },
  to: { transform: [{ scale: 1.08 }] },
});

const hop = css.keyframes({
  '0%': { transform: [{ translateY: 0 }] },
  '50%': { transform: [{ translateY: -10 }] },
  '100%': { transform: [{ translateY: 0 }] },
});

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const { coins, gems, seenCoins, seenGems } = useProfile(useShallow((p) => ({ coins: p.coins, gems: p.gems, seenCoins: p.seenCoins, seenGems: p.seenGems })));
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      {onBack ? <ImageButton source={IMG.btnHome} size={44} onPress={onBack} label="Back to map" /> : <View style={{ width: 4 }} />}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.counters}>
        {seenCoins ? <Counter icon={IMG.coin} value={coins} bumpKey={0} /> : null}
        {seenGems ? <Counter icon={IMG.gem} value={gems} bumpKey={0} /> : null}
      </View>
    </View>
  );
}

export function MapScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { current, stars } = useProfile(useShallow((p) => ({ current: p.journey.current, stars: p.journey.stars })));
  const [preview, setPreview] = useState<number | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const colW = Math.min(width, 520);
  const shown = Math.max(current + 12, 20);
  const contentH = shown * STEP + 260;
  const pos = (i: number): { x: number; y: number } => ({
    x: colW / 2 + Math.sin(i * 0.85) * colW * 0.27,
    y: contentH - 170 - (i - 1) * STEP,
  });
  const cur = pos(current);
  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, cur.y - 420), animated: false }), 0);
    return () => clearTimeout(id);
  }, [cur.y]);
  const bgTiles = Math.ceil(contentH / (colW * 1.5));
  const levels = useMemo(() => Array.from({ length: shown }, (_, k) => k + 1), [shown]);

  return (
    <View style={styles.root}>
      <ScrollView ref={scroll} contentContainerStyle={{ height: contentH, width: colW, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        {Array.from({ length: bgTiles }, (_, i) => (
          <Image key={i} source={IMG.bgMap} style={{ position: 'absolute', left: 0, top: i * colW * 1.5, width: colW, height: colW * 1.5, transform: i % 2 ? [{ scaleY: -1 }] : [] }} resizeMode="cover" />
        ))}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,6,32,0.25)' }]} />
        {levels.slice(0, -1).map((i) => {
          const a = pos(i);
          const b = pos(i + 1);
          return [1, 2, 3, 4].map((k) => (
            <View
              key={`d${i}-${k}`}
              style={[styles.dot, { left: a.x + ((b.x - a.x) * k) / 5 - 4, top: a.y + ((b.y - a.y) * k) / 5 - 4, opacity: i < current ? 0.9 : 0.35 }]}
            />
          ));
        })}
        {levels.map((i) => {
          if ((i - 1) % 20 !== 0) return null;
          const p = pos(i);
          return (
            <View key={`r${i}`} style={[styles.region, { top: p.y + 46 }]}>
              <Text style={styles.regionText}>
                Region {Math.floor((i - 1) / 20) + 1} - {regionName(Math.floor((i - 1) / 20))}
              </Text>
            </View>
          );
        })}
        {levels.map((i) => {
          const p = pos(i);
          const done = (stars[i] ?? 0) > 0;
          const isCur = i === current;
          const locked = i > current;
          const boss = i % 20 === 0;
          const gem = i % 5 === 0;
          const src = done ? IMG.nodeDone : isCur ? IMG.nodeCurrent : locked ? (boss ? IMG.nodeBoss : gem ? IMG.nodeGem : IMG.nodeLocked) : IMG.nodeOpen;
          const size = boss ? NODE + 18 : NODE;
          return (
            <View key={i} style={{ position: 'absolute', left: p.x - size / 2, top: p.y - size / 2, width: size, alignItems: 'center' }}>
              <PressableScale label={`Level ${i}${locked ? ', locked' : ''}`} disabled={locked} onPress={() => setPreview(i)} style={{ width: size, height: size }}>
                <Animated.Image
                  source={src}
                  style={[{ width: size, height: size, opacity: locked ? 0.7 : 1 }, isCur ? { animationName: pulse, animationDuration: 900, animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out' } : null]}
                  resizeMode="contain"
                />
                <Text style={[styles.nodeNum, locked && { color: COLORS.textDim }]}>{i}</Text>
              </PressableScale>
              {done ? (
                <View style={styles.nodeStars}>
                  {[1, 2, 3].map((k) => (
                    <Image key={k} source={k <= stars[i] ? IMG.star : IMG.starEmpty} style={styles.nodeStar} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        <Animated.Image
          source={GHOST_SPRITES[0]}
          style={[styles.avatar, { left: cur.x - 30, top: cur.y - NODE / 2 - 54 }, { animationName: hop, animationDuration: 1000, animationIterationCount: 'infinite', animationTimingFunction: CURVE.inOut }]}
          resizeMode="contain"
          accessibilityLabel="You are here"
        />
      </ScrollView>
      <View style={styles.headerFloat} pointerEvents="box-none">
        <Header title="Ghostly Fluffs" />
      </View>
      <BottomBar bottom={insets.bottom} current={current} />
      {preview ? <LevelPreview id={preview} onClose={() => setPreview(null)} /> : null}
    </View>
  );
}

function BottomBar({ bottom, current }: { bottom: number; current: number }) {
  const go = useNav((n) => n.go);
  const dailyBest = useProfile((p) => (p.daily.day === utcDay() ? p.daily.best : 0));
  const endlessOpen = current > UNLOCKS.endless;
  const dailyOpen = current > UNLOCKS.daily;
  const items = [
    { key: 'play', label: `Play ${current}`, icon: IMG.btnPlay, onPress: () => playLevel(current), open: true },
    { key: 'endless', label: endlessOpen ? 'Endless' : `Lvl ${UNLOCKS.endless}`, icon: IMG.jar, onPress: playEndless, open: endlessOpen },
    { key: 'daily', label: dailyOpen ? (dailyBest ? `Best ${dailyBest}` : 'Daily') : `Lvl ${UNLOCKS.daily}`, icon: IMG.star, onPress: playDaily, open: dailyOpen },
    { key: 'album', label: 'Album', icon: GHOST_SPRITES[3], onPress: () => go({ name: 'album' }), open: true },
    { key: 'settings', label: 'Settings', icon: IMG.btnSettings, onPress: () => go({ name: 'settings' }), open: true },
  ];
  return (
    <View style={[styles.bottomBar, { paddingBottom: bottom + 6 }]}>
      {items.map((it) => (
        <PressableScale key={it.key} label={it.label} disabled={!it.open} onPress={it.onPress} style={styles.tab}>
          <Image source={it.icon} style={[styles.tabIcon, !it.open && { opacity: 0.35 }]} resizeMode="contain" />
          <Text style={styles.tabText} numberOfLines={1}>
            {it.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

function LevelPreview({ id, onClose }: { id: number; onClose: () => void }) {
  const level = levelFor(id);
  const { owned, loadout, setLoadout, stars } = useProfile(useShallow((p) => ({ owned: p.ownedCards, loadout: p.loadout, setLoadout: p.setLoadout, stars: p.journey.stars[id] ?? 0 })));
  const toggle = (c: CardId): void => {
    if (loadout.includes(c)) setLoadout(loadout.filter((x) => x !== c));
    else if (loadout.length < 3) setLoadout([...loadout, c]);
  };
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.scrim}>
      <PressableScale label="Close" onPress={onClose} silent style={StyleSheet.absoluteFill}>
        <View />
      </PressableScale>
      <Animated.View entering={SlideInDown.duration(220)} style={{ width: '100%', maxWidth: 420 }}>
        <Panel>
          <Text style={styles.kicker}>{regionName(level.region)}</Text>
          <Text style={styles.title}>Level {id}{level.isBoss ? ' - Boss' : ''}</Text>
          <Text style={styles.goal}>{goalText(level.goal)}</Text>
          <View style={styles.chips}>
            <Text style={styles.chip}>{level.hugsOn ? `Group Hug: make ${level.hugNumber ?? 10}` : 'Hugs off'}</Text>
            <Text style={styles.chip}>{level.cardsAllowed ? 'Cards allowed' : 'No cards'}</Text>
            {stars ? <Text style={styles.chip}>Best {'★'.repeat(stars)}</Text> : null}
          </View>
          <View style={styles.rewardRow}>
            <Image source={IMG.coin} style={styles.rIcon} />
            <Text style={styles.rText}>
              {ECONOMY.levelCoins[1]}-{ECONOMY.levelCoins[3]}
            </Text>
            {level.gems ? (
              <>
                <Image source={IMG.gem} style={styles.rIcon} />
                <Text style={styles.rText}>{level.gems}{level.bossBonusGems ? ` (+${level.bossBonusGems} for 3 stars)` : ''}</Text>
              </>
            ) : null}
            {level.cardGift ? <Text style={styles.rText}>+ card: {CARDS[level.cardGift].name}</Text> : null}
          </View>
          {level.cardsAllowed && owned.length ? (
            <>
              <Text style={styles.sub}>Your cards (up to 3)</Text>
              <View style={styles.loadout}>
                {CARD_ORDER.filter((c) => owned.includes(c)).map((c) => {
                  const on = loadout.includes(c);
                  const crystal = CARDS[c].crystal;
                  return (
                    <PressableScale key={c} label={`${CARDS[c].name}${on ? ', equipped' : ''}`} onPress={() => toggle(c)} style={[styles.loadCard, on && styles.loadCardOn]}>
                      {crystal ? <Image source={CRYSTAL_SPRITES[crystal]} style={{ width: 30, height: 30 }} /> : <Text style={styles.glyph}>{c === 'shake' ? '〰' : '⇄'}</Text>}
                      <Text style={styles.loadName}>{CARDS[c].name}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </>
          ) : null}
          <View style={{ marginTop: 14, gap: 10 }}>
            <WideButton title="Play" onPress={() => playLevel(id)} />
          </View>
        </Panel>
      </Animated.View>
    </Animated.View>
  );
}

export function AlbumScreen() {
  const go = useNav((n) => n.go);
  const album = useProfile((p) => p.album);
  const [open, setOpen] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colW = Math.min(width, 520);
  const cell = (colW - 16 * 2 - 10 * 3) / 4;
  const met = GHOSTS.filter((g) => album[g.tier]).length;
  const sel = open ? GHOSTS[open - 1] : null;
  return (
    <View style={styles.root}>
      <Image source={IMG.bgMap} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,6,32,0.6)' }]} />
      <Header title={`Album ${met} of ${GHOSTS.length}`} onBack={() => go({ name: 'map' })} />
      <ScrollView contentContainerStyle={{ width: colW, alignSelf: 'center', padding: 16, paddingBottom: insets.bottom + 24, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {GHOSTS.map((g) => {
          const seen = album[g.tier];
          return (
            <PressableScale key={g.tier} label={seen ? `${g.name}, ${g.value}` : 'Not met yet'} disabled={!seen} onPress={() => setOpen(g.tier)} style={[styles.albumCell, { width: cell, height: cell * 1.3 }]}>
              <Image source={GHOST_SPRITES[g.tier - 1]} style={{ width: cell * 0.85, height: cell * 0.85, tintColor: seen ? undefined : '#1c1240', opacity: seen ? 1 : 0.85 }} resizeMode="contain" />
              <Text style={styles.albumName} numberOfLines={1}>
                {seen ? g.name : '?'}
              </Text>
              <Text style={styles.albumValue}>{seen ? g.value : ''}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      {sel ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.scrim}>
          <Panel style={{ alignItems: 'center', width: '100%', maxWidth: 380 }}>
            <Image source={GHOST_SPRITES[sel.tier - 1]} style={{ width: 160, height: 160 }} resizeMode="contain" />
            <Text style={styles.title}>{sel.name}</Text>
            <Text style={styles.kicker}>{sel.title}</Text>
            <Text style={styles.goal}>{sel.value.toLocaleString('en-US')} - {sel.rarity}</Text>
            <Text style={styles.sub}>Met {new Date(album[sel.tier].first).toLocaleDateString()} - made {album[sel.tier].count} times</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
              <WideButton title="Close" tone="violet" onPress={() => setOpen(null)} />
            </View>
          </Panel>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: COLORS.hotPink, false: '#3a2d7a' }} thumbColor="#ffffff" accessibilityLabel={label} />
    </View>
  );
}

export function SettingsScreen() {
  const go = useNav((n) => n.go);
  const insets = useSafeAreaInsets();
  const { settings, setSetting, reset, ledger } = useProfile(useShallow((p) => ({ settings: p.settings, setSetting: p.setSetting, reset: p.reset, ledger: p.ledger })));
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={styles.root}>
      <Image source={IMG.bgMap} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,6,32,0.7)' }]} />
      <Header title="Settings" onBack={() => go({ name: 'map' })} />
      <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 520, alignSelf: 'center', padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <Panel style={{ gap: 4 }}>
          <Row label="Sound effects" value={settings.sound} onChange={(v) => setSetting('sound', v)} />
          <Row label="Haptics" value={settings.haptics} onChange={(v) => setSetting('haptics', v)} />
          <Row label="Reduce motion" value={settings.reduceMotion} onChange={(v) => setSetting('reduceMotion', v)} />
          <Row label="Guide line and landing ghost" value={settings.guide} onChange={(v) => setSetting('guide', v)} />
          <Row label="Group Hug sum bubble" value={settings.sumBubble} onChange={(v) => setSetting('sumBubble', v)} />
        </Panel>
        <Panel>
          <Text style={styles.title}>Pieces are pure luck. Always.</Text>
          <Text style={styles.sub}>
            The next ghost comes from a seeded random queue that never looks at your jar. As your run grows, tiny ghosts visit less often. A game only ends when a resting ghost stays above the line for 2 seconds.
          </Text>
        </Panel>
        <Panel>
          <Text style={styles.title}>Wallet</Text>
          {ledger.slice(-6).reverse().map((e, i) => (
            <Text key={i} style={styles.sub}>
              {new Date(e.at).toLocaleDateString()} {e.why}: {e.coins ? `${e.coins > 0 ? '+' : ''}${e.coins} coins ` : ''}
              {e.gems ? `${e.gems > 0 ? '+' : ''}${e.gems} gems` : ''}
            </Text>
          ))}
          {ledger.length === 0 ? <Text style={styles.sub}>Nothing yet.</Text> : null}
        </Panel>
        <WideButton
          title={confirm ? 'Tap again to reset all progress' : 'Reset progress'}
          tone="violet"
          onPress={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            reset();
            setConfirm(false);
          }}
        />
        <Text style={[styles.sub, { textAlign: 'center' }]}>Ghostly Fluffs v0.1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.nightDeep },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 8, width: '100%', maxWidth: 520, alignSelf: 'center' },
  headerFloat: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerTitle: { flex: 1, color: COLORS.text, fontFamily: FONT.bold, fontSize: 22, textShadowColor: 'rgba(143,123,255,0.9)', textShadowRadius: 10 },
  counters: { flexDirection: 'row', gap: 6 },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffe9a8' },
  region: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  regionText: { color: COLORS.gold, fontFamily: FONT.bold, fontSize: 15, backgroundColor: 'rgba(20,12,54,0.75)', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14, overflow: 'hidden' },
  nodeNum: { position: 'absolute', left: 0, right: 0, top: '34%', textAlign: 'center', color: COLORS.text, fontFamily: FONT.bold, fontSize: 20, textShadowColor: 'rgba(10,6,32,0.9)', textShadowRadius: 6 },
  nodeStars: { flexDirection: 'row', marginTop: -10 },
  nodeStar: { width: 22, height: 22 },
  avatar: { position: 'absolute', width: 60, height: 60 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 8, backgroundColor: 'rgba(14, 8, 40, 0.92)', borderTopWidth: 1.5, borderTopColor: 'rgba(170,150,255,0.45)' },
  tab: { width: 72, alignItems: 'center', paddingVertical: 2 },
  tabIcon: { width: 38, height: 38 },
  tabText: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 12, marginTop: 2 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.scrim, justifyContent: 'center', alignItems: 'center', padding: 18 },
  kicker: { color: COLORS.gold, fontFamily: FONT.bold, fontSize: 14 },
  title: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 24 },
  goal: { color: COLORS.pink, fontFamily: FONT.bold, fontSize: 19, marginTop: 4 },
  sub: { color: COLORS.textDim, fontFamily: FONT.regular, fontSize: 14, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  rIcon: { width: 26, height: 26 },
  rText: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 14, marginRight: 8 },
  loadout: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  loadCard: { width: 88, height: 70, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: 'rgba(170,150,255,0.4)' },
  loadCardOn: { borderColor: COLORS.gold, backgroundColor: 'rgba(255,215,106,0.14)' },
  loadName: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 11, marginTop: 2 },
  glyph: { color: COLORS.mint, fontFamily: FONT.bold, fontSize: 24 },
  albumCell: { borderRadius: 16, backgroundColor: 'rgba(28,18,72,0.85)', borderWidth: 1.5, borderColor: 'rgba(170,150,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  albumName: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 13 },
  albumValue: { color: COLORS.lilac, fontFamily: FONT.semi, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  rowText: { color: COLORS.text, fontFamily: FONT.semi, fontSize: 16, flexShrink: 1 },
});
