import React from 'react';import { registerRootComponent } from 'expo';

import { View } from 'react-native';

import MapComponent from '../components/MapComponent';



export default function Home() {// registerRootComponent calls AppRegistry.registerComponent('main', () => App);

  return (// It also ensures that whether you load the app in Expo Go or in a native build,

    <View style={{ flex: 1 }}>// the environment is set up appropriately

      <MapComponent />registerRootComponent(App);

    </View>
  );
}