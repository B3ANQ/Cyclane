import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Dimensions, StatusBar } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const { width, height } = Dimensions.get('window');

const BORDEAUX_REGION = {
  latitude: 44.837789,
  longitude: -0.57918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Clé API OpenRouteService (gratuite jusqu'à 2000 req/jour)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjQxNDNmODQ5NGQ2OTRiNWFhNmRjOWU2ZmUxN2M5OTkzIiwiaCI6Im11cm11cjY0In0=';

function MapComponent() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const mapRef = useRef(null);

  // Fonction pour récupérer l'itinéraire vélo via OpenRouteService
  const getRoute = async (start, end) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/cycling-regular?` +
        `api_key=${ORS_API_KEY}&start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}&format=geojson`
      );
      
      if (!response.ok) {
        throw new Error('Erreur API OpenRouteService');
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const coordinates = data.features[0].geometry.coordinates.map(coord => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        
        const properties = data.features[0].properties.segments[0];
        const distance = (properties.distance / 1000).toFixed(1); // km
        const duration = Math.round(properties.duration / 60); // minutes
        
        setRouteCoordinates(coordinates);
        setRouteInfo({ distance, duration });
        
        // Ajuster la vue pour montrer tout l'itinéraire
        if (mapRef.current) {
          mapRef.current.fitToCoordinates(coordinates, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de calculer l\'itinéraire');
      console.error('Erreur ORS:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Gestion du tap sur la carte
  const handleMapPress = (event) => {
    const coordinate = event.nativeEvent.coordinate;
    
    if (!startPoint) {
      setStartPoint(coordinate);
    } else if (!endPoint) {
      setEndPoint(coordinate);
      // Calculer l'itinéraire automatiquement
      getRoute(startPoint, coordinate);
    } else {
      // Reset pour un nouvel itinéraire
      resetRoute();
      setStartPoint(coordinate);
    }
  };

  const resetRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteCoordinates([]);
    setRouteInfo(null);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={BORDEAUX_REGION}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {/* Marqueur de départ */}
        {startPoint && (
          <Marker
            coordinate={startPoint}
            title="Départ"
            pinColor="green"
          />
        )}
        
        {/* Marqueur d'arrivée */}
        {endPoint && (
          <Marker
            coordinate={endPoint}
            title="Arrivée"
            pinColor="red"
          />
        )}
        
        {/* Tracé de l'itinéraire */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#2196F3"
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Interface utilisateur */}
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>🚴 Vélo Bordeaux</Text>
          {routeInfo && (
            <View style={styles.routeInfo}>
              <Text style={styles.routeText}>
                📍 {routeInfo.distance} km • ⏱️ {routeInfo.duration} min
              </Text>
            </View>
          )}
        </View>

        <View style={styles.instructions}>
          {!startPoint && (
            <Text style={styles.instructionText}>
              📍 Touchez la carte pour choisir votre point de départ
            </Text>
          )}
          {startPoint && !endPoint && (
            <Text style={styles.instructionText}>
              🎯 Touchez la carte pour choisir votre destination
            </Text>
          )}
          {startPoint && endPoint && (
            <Text style={styles.instructionText}>
              ✅ Itinéraire calculé ! Touchez pour recommencer
            </Text>
          )}
        </View>

        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Calcul de l'itinéraire...</Text>
          </View>
        )}

        <TouchableOpacity style={styles.resetButton} onPress={resetRoute}>
          <Text style={styles.resetButtonText}>🔄 Nouveau trajet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: width,
    height: height,
  },
  map: {
    flex: 1,
    width: width,
    height: height,
  },
  overlay: {
    position: 'absolute',
    top: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 50,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    backdropFilter: 'blur(10px)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#2196F3',
  },
  routeInfo: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 5,
  },
  routeText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#1976D2',
    fontWeight: '600',
  },
  instructions: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  instructionText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
  loading: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  resetButton: {
    backgroundColor: '#FF5722',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MapComponent;