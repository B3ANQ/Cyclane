import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, PermissionsAndroid, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

const BORDEAUX_REGION = {
  latitude: 44.837789,
  longitude: -0.57918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Récupération de la clé API depuis les variables d'environnement
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.ORS_API_KEY;

function MapComponent() {
  const [endPoint, setEndPoint] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);
  // Nouveaux états pour les instructions
  const [navigationInstructions, setNavigationInstructions] = useState([]);
  const [currentInstruction, setCurrentInstruction] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const mapRef = useRef(null);

  // Demander les permissions et obtenir la localisation
  useEffect(() => {
    // Vérifier que la clé API est disponible
    if (!ORS_API_KEY) {
      Alert.alert('Erreur', 'Clé API OpenRouteService manquante');
      console.error('ORS_API_KEY non trouvée dans les variables d\'environnement');
      return;
    }
    
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        setLocationPermission(true);
        getCurrentLocation();
      } else {
        Alert.alert(
          'Permission refusée',
          'L\'application a besoin de votre localisation pour fonctionner correctement.'
        );
      }
    } catch (error) {
      console.error('Erreur permission localisation:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const userCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      setUserLocation(userCoords);
      
      // Centrer la carte sur la position de l'utilisateur
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...userCoords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      }
    } catch (error) {
      console.error('Erreur obtention localisation:', error);
      Alert.alert('Erreur', 'Impossible d\'obtenir votre localisation');
    }
  };

  // Fonction pour calculer la distance entre deux points (en mètres)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const getRoute = async (start, end) => {
    if (!ORS_API_KEY) {
      Alert.alert('Erreur', 'Clé API non configurée');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/cycling-regular?` +
        `api_key=${ORS_API_KEY}&start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}&format=geojson&instructions=true&units=m`
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
        
        // Extraire les instructions de navigation
        const instructions = properties.steps.map((step, index) => ({
          id: index,
          instruction: step.instruction,
          distance: step.distance,
          type: step.type,
          coordinate: {
            latitude: coordinates[step.way_points[0]]?.latitude || start.latitude,
            longitude: coordinates[step.way_points[0]]?.longitude || start.longitude,
          }
        }));
        
        setRouteCoordinates(coordinates);
        setRouteInfo({ distance, duration });
        setNavigationInstructions(instructions);
        
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

  // Démarrer la navigation
  const startNavigation = () => {
    if (navigationInstructions.length > 0) {
      setIsNavigating(true);
      setCurrentInstruction(navigationInstructions[0]);
    }
  };

  // Arrêter la navigation
  const stopNavigation = () => {
    setIsNavigating(false);
    setCurrentInstruction(null);
  };

  // Surveiller la position pendant la navigation
  useEffect(() => {
    let locationSubscription;

    if (isNavigating && locationPermission) {
      const watchPosition = async () => {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 15,
          },
          (location) => {
            const newUserLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };
            setUserLocation(newUserLocation);
            updateCurrentInstruction(newUserLocation);
          }
        );
      };
      
      watchPosition();
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isNavigating, locationPermission, navigationInstructions]);

  // Mettre à jour l'instruction courante
  const updateCurrentInstruction = (userPos) => {
    if (!currentInstruction || navigationInstructions.length === 0) return;

    const distanceToInstruction = calculateDistance(
      userPos.latitude,
      userPos.longitude,
      currentInstruction.coordinate.latitude,
      currentInstruction.coordinate.longitude
    );

    // Passer à l'instruction suivante si on est proche (25m)
    if (distanceToInstruction < 25) {
      const currentIndex = navigationInstructions.findIndex(inst => inst.id === currentInstruction.id);
      if (currentIndex < navigationInstructions.length - 1) {
        setCurrentInstruction(navigationInstructions[currentIndex + 1]);
      } else {
        // Arrivée
        stopNavigation();
        Alert.alert('Navigation', 'Vous êtes arrivé à destination !');
      }
    }
  };

  // Calculer la distance jusqu'à la prochaine instruction
  const getDistanceToCurrentInstruction = () => {
    if (!currentInstruction || !userLocation) return null;

    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      currentInstruction.coordinate.latitude,
      currentInstruction.coordinate.longitude
    );

    if (distance < 100) {
      return `${Math.round(distance)}m`;
    } else if (distance < 1000) {
      return `${Math.round(distance / 10) * 10}m`;
    } else {
      return `${(distance / 1000).toFixed(1)}km`;
    }
  };

  const handleMapPress = (event) => {
    const coordinate = event.nativeEvent.coordinate;
    
    // Vérifier que la localisation utilisateur est disponible
    if (!userLocation) {
      Alert.alert('Erreur', 'Position utilisateur non disponible');
      return;
    }
    
    // Définir le point d'arrivée et calculer l'itinéraire
    setEndPoint(coordinate);
    getRoute(userLocation, coordinate);
  };

  const resetRoute = () => {
    setEndPoint(null);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavigationInstructions([]);
    stopNavigation();
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={userLocation ? {
          ...userLocation,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : BORDEAUX_REGION}
        onPress={handleMapPress}
        showsUserLocation={locationPermission}
        showsMyLocationButton={locationPermission}
        followsUserLocation={isNavigating}
        showsCompass={true}
      >
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
          {routeInfo && (
            <View style={styles.routeInfo}>
              <Text style={styles.routeText}>
                📍 {routeInfo.distance} km • ⏱️ {routeInfo.duration} min
              </Text>
              {!isNavigating && navigationInstructions.length > 0 && (
                <TouchableOpacity style={styles.startNavButton} onPress={startNavigation}>
                  <Text style={styles.startNavButtonText}>🧭 Démarrer la navigation</Text>
                </TouchableOpacity>
              )}
              {isNavigating && (
                <TouchableOpacity style={styles.stopNavButton} onPress={stopNavigation}>
                  <Text style={styles.stopNavButtonText}>⏹️ Arrêter</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={styles.instructions}>
          {!locationPermission && (
            <Text style={styles.instructionText}>
              📍 Permission de localisation requise
            </Text>
          )}
          {locationPermission && !userLocation && (
            <Text style={styles.instructionText}>
              📍 Obtention de votre position...
            </Text>
          )}
          {userLocation && !endPoint && (
            <Text style={styles.instructionText}>
              🎯 Touchez la carte pour choisir votre destination
            </Text>
          )}
          {userLocation && endPoint && (
            <Text style={styles.instructionText}>
              ✅ Itinéraire calculé depuis votre position ! Touchez pour changer de destination
            </Text>
          )}
        </View>

        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Calcul de l'itinéraire...</Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.resetButton} onPress={resetRoute}>
            <Text style={styles.resetButtonText}>🔄 Nouveau trajet</Text>
          </TouchableOpacity>
          
          {locationPermission && (
            <TouchableOpacity style={styles.locationButton} onPress={getCurrentLocation}>
              <Text style={styles.locationButtonText}>📍 Ma position</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Carte flottante de navigation en bas */}
      {isNavigating && currentInstruction && (
        <View style={styles.navigationCard}>
          <View style={styles.navigationContent}>
            <Text style={styles.distanceText}>
              {getDistanceToCurrentInstruction()}
            </Text>
            <Text style={styles.instructionText}>
              {currentInstruction.instruction}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 50,
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
  startNavButton: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  startNavButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
  stopNavButton: {
    backgroundColor: '#F44336',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  stopNavButtonText: {
    color: 'white',
    textAlign: 'center',
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
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  resetButton: {
    backgroundColor: '#FF5722',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  locationButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  locationButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Styles pour la carte de navigation flottante
  navigationCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  navigationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distanceText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
    minWidth: 80,
  },
  instructionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    marginLeft: 16,
    fontWeight: '500',
  },
});

export default MapComponent;