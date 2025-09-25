import React, { useState } from 'react';
import SplashScreen from './SplashScreen';
import HomeScreen from './HomeScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  return <HomeScreen />;
}


