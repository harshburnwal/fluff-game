import { StyleSheet } from 'react-native';
import Animated, { css } from 'react-native-reanimated';

import { useHud } from '../game/controller';
import { IMG } from '../render/assets';
import { JAR_IMAGE, type Layout } from '../render/layout';
import { CURVE } from './theme';

const rock = css.keyframes({
  '0%': { transform: [{ rotate: '0deg' }] },
  '20%': { transform: [{ rotate: '3deg' }] },
  '45%': { transform: [{ rotate: '-3deg' }] },
  '70%': { transform: [{ rotate: '2deg' }] },
  '100%': { transform: [{ rotate: '0deg' }] },
});

/**
 * The glass jar as two static images: the full jar behind the ghost canvas and a faint copy
 * in front of it, which reads as glass reflections over the ghosts. Gentle Shake rocks both
 * (file 03, #18: 3 degrees, 500 ms).
 */
export function JarLayer({ layout, front, reduced }: { layout: Layout; front?: boolean; reduced: boolean }) {
  const shakeKey = useHud((s) => s.shakeKey);
  const style = {
    left: layout.ox + JAR_IMAGE.left * layout.s,
    top: layout.oy + JAR_IMAGE.top * layout.s,
    width: JAR_IMAGE.width * layout.s,
    height: JAR_IMAGE.height * layout.s,
    opacity: front ? 0.2 : 1,
  };
  return (
    <Animated.Image
      key={shakeKey}
      source={IMG.jar}
      pointerEvents="none"
      resizeMode="stretch"
      style={[
        styles.jar,
        style,
        shakeKey > 0 && !reduced ? { animationName: rock, animationDuration: 500, animationTimingFunction: CURVE.inOut } : null,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  jar: { position: 'absolute' },
});
