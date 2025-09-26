import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import MapComponent from '../components/MapComponent';
import SplashScreen from '../components/SplashScreen.jsx';

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  return (
    <View style={styles.container}>
      <MapComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});