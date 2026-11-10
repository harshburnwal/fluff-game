import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

/**
 * Entry. On native, Skia is ready at once. On the web, React Native Skia needs CanvasKit
 * (WebAssembly) loaded before any Skia module runs, so the game is imported lazily
 * after CanvasKit resolves.
 */
function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#ff9ed8" size="large" />
    </View>
  );
}

let Root: () => React.JSX.Element;

if (Platform.OS === 'web') {
  const { WithSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  Root = function WebRoot() {
    return (
      <WithSkiaWeb
        getComponent={() => import('./src/AppRoot')}
        fallback={<Loading />}
        opts={{ locateFile: (file: string) => new URL(file, document.baseURI).href }}
      />
    );
  };
} else {
  Root = require('./src/AppRoot').default;
}

export default function App() {
  return <Root />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0620' },
});
