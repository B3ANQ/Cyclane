import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Dimensions,
  TextInput,
  SafeAreaView
} from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

const { width, height } = Dimensions.get('window');

const HomeScreen = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const initialRegion = {
        latitude: 44.8378,
        longitude: -0.5792,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsCompass={true}
        showsScale={true}
        mapType="standard"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default HomeScreen;
