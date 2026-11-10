import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css } from 'react-native-reanimated';

import { play } from '../services/feedback';
import { COLORS, CURVE, FONT } from './theme';

interface PressProps {
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  label: string;
  silent?: boolean;
  hitSlop?: number;
}

/**
 * Press feedback from the animate-expo skill: scale 0.97 on press-in in 120 ms with a CSS
 * transition, commit on release, 44 pt minimum target through hitSlop.
 */
export function PressableScale({ onPress, onLongPress, delayLongPress, disabled, style, children, label, silent, hitSlop = 8 }: PressProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      pressRetentionOffset={16}
      delayLongPress={delayLongPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (!silent) play('tap');
        onPress?.();
      }}
      onLongPress={onLongPress}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: pressed ? 0.95 : 1 }],
            opacity: disabled ? 0.45 : 1,
            transitionProperty: 'transform',
            transitionDuration: 120,
            transitionTimingFunction: CURVE.out,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function ImageButton({ source, size, onPress, label }: { source: ImageSourcePropType; size: number; onPress: () => void; label: string }) {
  return (
    <PressableScale onPress={onPress} label={label} style={{ width: size, height: size }}>
      <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
    </PressableScale>
  );
}

export function WideButton({ title, onPress, tone = 'pink', disabled, sub }: { title: string; onPress: () => void; tone?: 'pink' | 'violet' | 'gold'; disabled?: boolean; sub?: string }) {
  const bg = tone === 'pink' ? COLORS.hotPink : tone === 'gold' ? '#f4b740' : '#6a52e8';
  return (
    <PressableScale onPress={onPress} label={title} disabled={disabled} style={[styles.wide, { backgroundColor: bg }]}>
      <Text style={styles.wideText}>{title}</Text>
      {sub ? <Text style={styles.wideSub}>{sub}</Text> : null}
    </PressableScale>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

const bump = css.keyframes({
  '0%': { transform: [{ scale: 1 }] },
  '40%': { transform: [{ scale: 1.12 }] },
  '100%': { transform: [{ scale: 1 }] },
});

/** Coin or gem counter; `bump` changes when an icon lands, which replays the bump. */
export function Counter({ icon, value, bumpKey }: { icon: ImageSourcePropType; value: number; bumpKey: number }) {
  return (
    <Animated.View
      key={bumpKey}
      style={[
        styles.counter,
        bumpKey > 0 && { animationName: bump, animationDuration: 180, animationTimingFunction: CURVE.out },
      ]}
      accessibilityLabel={`${value}`}
    >
      <Image source={icon} style={styles.counterIcon} resizeMode="contain" />
      <Text style={styles.counterText}>{value.toLocaleString('en-US')}</Text>
    </Animated.View>
  );
}

export const styles = StyleSheet.create({
  wide: {
    minHeight: 54,
    paddingHorizontal: 28,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#ff6fb5',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  wideText: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 22 },
  wideSub: { color: 'rgba(255,255,255,0.85)', fontFamily: FONT.regular, fontSize: 13, marginTop: -2 },
  panel: {
    backgroundColor: 'rgba(34, 22, 90, 0.94)',
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(170, 150, 255, 0.75)',
    padding: 20,
    shadowColor: '#8f7bff',
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 12, 54, 0.78)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(170, 150, 255, 0.6)',
    paddingLeft: 4,
    paddingRight: 12,
    height: 36,
    minWidth: 76,
  },
  counterIcon: { width: 28, height: 28, marginRight: 4 },
  counterText: { color: COLORS.text, fontFamily: FONT.bold, fontSize: 16 },
});
