import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold, useFonts } from '@expo-google-fonts/fredoka';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { routeAtLaunch } from './app/flow';
import { useNav } from './app/nav';
import { IMG, loadSceneImages } from './render/assets';
import { useProfile } from './store/profile';
import { GameScreen } from './ui/GameScreen';
import { AlbumScreen, MapScreen, SettingsScreen } from './ui/MenuScreens';
import { COLORS } from './ui/theme';

function Screens() {
  const screen = useNav((n) => n.screen);
  const key = screen.name === 'game' ? `game-${screen.key}` : screen.name;
  return (
    // screens crossfade in 180 ms (file 03, #34); tabs never slide
    <Animated.View key={key} entering={FadeIn.duration(180)} style={styles.fill}>
      {screen.name === 'game' ? <GameScreen spec={screen.spec} /> : null}
      {screen.name === 'map' ? <MapScreen /> : null}
      {screen.name === 'album' ? <AlbumScreen /> : null}
      {screen.name === 'settings' ? <SettingsScreen /> : null}
    </Animated.View>
  );
}

export default function AppRoot() {
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      await Promise.all([useProfile.getState().hydrate(), loadSceneImages()]);
      await routeAtLaunch();
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.fill}>
        <StatusBar style="light" />
        {fontsLoaded && ready ? (
          <Screens />
        ) : (
          <View style={styles.loading}>
            <Image source={IMG.bgGame} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <ActivityIndicator color={COLORS.pink} size="large" />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.nightDeep },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.nightDeep },
});
