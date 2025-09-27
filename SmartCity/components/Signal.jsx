import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Animated,
  PanResponder,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const BORDEAUX_REGION = {
  latitude: 44.837789,
  longitude: -0.57918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Clé API OpenRouteService
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.ORS_API_KEY;

// Types de signalements
const SIGNAL_TYPES = {
  BLOCKED_ROAD: {
    id: 'blocked_road',
    title: '🚧 Route bloquée',
    icon: 'warning',
    color: '#FF5722',
    backgroundColor: '#FFEBEE'
  },
  DEGRADED_PATH: {
    id: 'degraded_path',
    title: '⚠️ Piste dégradée',
    icon: 'alert-circle',
    color: '#FF9800',
    backgroundColor: '#FFF3E0'
  },
  BIKE_OBSTRUCTION: {
    id: 'bike_obstruction',
    title: '🚲 Voie cyclable obstruée',
    icon: 'bicycle',
    color: '#F44336',
    backgroundColor: '#FFEBEE'
  }
};

function Signal() {
  const [userLocation, setUserLocation] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchType, setSearchType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const mapRef = useRef(null);

  // Adresses prédéfinies
  const [homeAddress, setHomeAddress] = useState(null);
  const [workAddress, setWorkAddress] = useState(null);

  // États pour la navigation
  const [navigationInstructions, setNavigationInstructions] = useState([]);
  const [currentInstruction, setCurrentInstruction] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);

  // États pour les signalements
  const [showSignalModal, setShowSignalModal] = useState(false);
  const [selectedSignalType, setSelectedSignalType] = useState(null);
  const [isPlacingSignal, setIsPlacingSignal] = useState(false);
  const [signals, setSignals] = useState([]);
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Animation pour le modal de signalement
  useEffect(() => {
    if (showSignalModal) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: height,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    }
  }, [showSignalModal]);

  // PanResponder pour fermer le modal en glissant vers le bas
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return gestureState.dy > 0 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
    },
    onPanResponderMove: (evt, gestureState) => {
      if (gestureState.dy > 0) {
        slideAnim.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dy > 100) {
        closeSignalModal();
      } else {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  // Demander les permissions et obtenir la localisation
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        setLocationPermission(true);
        getUserLocation();
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

  // Obtenir la localisation de l'utilisateur
  const getUserLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const userCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      setUserLocation(userCoords);
      
      // Centrer la carte sur l'utilisateur
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...userCoords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    } catch (error) {
      console.error('Erreur localisation:', error);
      Alert.alert('Erreur', 'Impossible d\'obtenir votre localisation');
    }
  };

  // Fonction de recherche d'adresses
  const searchAddress = async (query) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&lat=44.837789&lon=-0.57918`
      );
      
      const data = await response.json();
      
      if (data && data.features && Array.isArray(data.features)) {
        const results = data.features.map(feature => ({
          id: feature.properties.id,
          label: feature.properties.label,
          coordinates: {
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0],
          }
        }));
        
        setSearchResults(results);
      } else {
        console.warn('Aucun résultat trouvé ou format de réponse invalide');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Sélectionner une adresse depuis la recherche
  const selectAddress = (result) => {
    if (searchType === 'start') {
      setStartPoint(result.coordinates);
    } else if (searchType === 'end') {
      setEndPoint(result.coordinates);
    } else if (searchType === 'home') {
      setHomeAddress(result.coordinates);
      Alert.alert('✅ Domicile enregistré', 'Votre adresse de domicile a été sauvegardée');
    } else if (searchType === 'work') {
      setWorkAddress(result.coordinates);
      Alert.alert('✅ Travail enregistré', 'Votre adresse de travail a été sauvegardée');
    }
    
    setShowSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
    
    // Si on a les deux points, calculer l'itinéraire et fermer la search bar
    if (searchType === 'end' && startPoint) {
      getRoute(startPoint, result.coordinates);
      setIsSearchExpanded(false);
    } else if (searchType === 'start' && endPoint) {
      getRoute(result.coordinates, endPoint);
      setIsSearchExpanded(false);
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

  // Calculer l'itinéraire avec instructions de navigation
  const getRoute = async (start, end) => {
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
        const distance = (properties.distance / 1000).toFixed(1);
        const duration = Math.round(properties.duration / 60);
        
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
            edgePadding: { top: 100, right: 50, bottom: 200, left: 50 },
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
      
      // Recentrer la carte sur l'utilisateur
      if (userLocation && mapRef.current) {
        mapRef.current.animateToRegion({
          ...userLocation,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }, 1000);
      }
      
      Alert.alert('🚴‍♂️ Navigation démarrée', 'Suivez les instructions pour arriver à destination');
    }
  };

  // Arrêter la navigation
  const stopNavigation = () => {
    setIsNavigating(false);
    setCurrentInstruction(null);
    
    // Reset complet du trajet
    setStartPoint(null);
    setEndPoint(null);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavigationInstructions([]);
    
    // Recentrer la carte sur l'utilisateur
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
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
        Alert.alert('🎉 Félicitations !', 'Vous êtes arrivé à destination !');
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

  // Gestion des signalements
  const openSignalModal = () => {
    setShowSignalModal(true);
  };

  const closeSignalModal = () => {
    setShowSignalModal(false);
    setSelectedSignalType(null);
    setIsPlacingSignal(false);
  };

  const selectSignalType = (type) => {
    setSelectedSignalType(type);
    setIsPlacingSignal(true);
    setShowSignalModal(false);
    Alert.alert(
      '📍 Placer le signalement',
      `Appuyez sur la carte à l'endroit où vous voulez placer le signalement "${type.title}"`
    );
  };

  const handleMapPress = (event) => {
    if (isPlacingSignal && selectedSignalType) {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      
      const newSignal = {
        id: Date.now().toString(),
        type: selectedSignalType.id,
        coordinate: { latitude, longitude },
        timestamp: new Date().toISOString(),
        title: selectedSignalType.title,
        icon: selectedSignalType.icon,
        color: selectedSignalType.color,
      };

      setSignals([...signals, newSignal]);
      setIsPlacingSignal(false);
      setSelectedSignalType(null);
      
      Alert.alert(
        '✅ Signalement ajouté',
        `Votre signalement "${selectedSignalType.title}" a été placé sur la carte.`
      );
    }
  };

  // Définir l'adresse de la maison
  const setAsHome = () => {
    if (!homeAddress) {
      setSearchType('home');
      setShowSearchModal(true);
    } else {
      Alert.alert(
        '🏠 Redéfinir le domicile ?',
        'Voulez-vous changer votre adresse de domicile ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Redéfinir', 
            onPress: () => {
              setSearchType('home');
              setShowSearchModal(true);
            }
          }
        ]
      );
    }
  };

  // Définir l'adresse du travail
  const setAsWork = () => {
    if (!workAddress) {
      setSearchType('work');
      setShowSearchModal(true);
    } else {
      Alert.alert(
        '💼 Redéfinir le travail ?',
        'Voulez-vous changer votre adresse de travail ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Redéfinir', 
            onPress: () => {
              setSearchType('work');
              setShowSearchModal(true);
            }
          }
        ]
      );
    }
  };

  // Aller à la maison
  const goHome = () => {
    if (!homeAddress) {
      Alert.alert('❌', 'Aucune adresse de maison enregistrée');
      return;
    }
    
    const start = userLocation || BORDEAUX_REGION;
    setStartPoint(start);
    setEndPoint(homeAddress);
    getRoute(start, homeAddress);
  };

  // Aller au travail
  const goToWork = () => {
    if (!workAddress) {
      Alert.alert('❌', 'Aucune adresse de travail enregistrée');
      return;
    }
    
    const start = userLocation || BORDEAUX_REGION;
    setStartPoint(start);
    setEndPoint(workAddress);
    getRoute(start, workAddress);
  };

  const resetRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavigationInstructions([]);
    stopNavigation();
    
    // Recentrer la carte sur l'utilisateur
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  const openSearchModal = (type) => {
    setSearchType(type);
    setShowSearchModal(true);
  };

  const toggleSearchBar = () => {
    setIsSearchExpanded(!isSearchExpanded);
    if (!isSearchExpanded) {
      setSearchQuery('');
      setSearchResults([]);
    }
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
        showsUserLocation={locationPermission}
        showsMyLocationButton={false}
        followsUserLocation={isNavigating}
        showsCompass={true}
        onPress={handleMapPress}
      >
        {/* Marqueur de départ */}
        {startPoint && (
          <Marker
            coordinate={startPoint}
            title="Départ"
          >
            <View style={styles.startMarker}>
              <Ionicons name="play" size={16} color="white" />
            </View>
          </Marker>
        )}
        
        {/* Marqueur d'arrivée */}
        {endPoint && (
          <Marker
            coordinate={endPoint}
            title="Arrivée"
          >
            <View style={styles.endMarker}>
              <Ionicons name="flag" size={16} color="white" />
            </View>
          </Marker>
        )}

        {/* Marqueurs de signalements */}
        {signals.map((signal) => (
          <Marker
            key={signal.id}
            coordinate={signal.coordinate}
            title={signal.title}
            description={`Signalé le ${new Date(signal.timestamp).toLocaleDateString()}`}
          >
            <View style={[styles.signalMarker, { backgroundColor: signal.color }]}>
              <Ionicons name={signal.icon} size={16} color="white" />
            </View>
          </Marker>
        ))}
        
        {/* Tracé de l'itinéraire */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#1A8D5B"
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Interface utilisateur - masquée pendant la navigation */}
      {!isNavigating && (
        <View style={styles.overlay}>
          {/* Header avec infos route */}
          {routeInfo && (
            <View style={styles.header}>
              <View style={styles.routeInfo}>
                <Text style={styles.routeText}>
                  📍 {routeInfo.distance} km • ⏱️ {routeInfo.duration} min
                </Text>
                {/* Bouton de navigation supprimé */}
              </View>
            </View>
          )}

          {/* Search bar déroulante */}
          <View style={styles.searchContainer}>
            <TouchableOpacity style={styles.searchBarToggle} onPress={toggleSearchBar}>
              <Ionicons name="search" size={20} color="#666" />
              <Text style={styles.searchBarText}>Rechercher une destination</Text>
              <Ionicons 
                name={isSearchExpanded ? "chevron-up" : "chevron-down"} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>

            {isSearchExpanded && (
              <View style={styles.expandedSearch}>
                <TouchableOpacity
                  style={[styles.searchOption, startPoint && styles.searchOptionActive]}
                  onPress={() => openSearchModal('start')}
                >
                  <Ionicons name="play-circle" size={18} color={startPoint ? "#1A8D5B" : "#666"} />
                  <Text style={[styles.searchOptionText, startPoint && styles.searchOptionTextActive]}>
                    {startPoint ? "Départ défini ✓" : "Choisir le départ"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.searchOption, endPoint && styles.searchOptionActive]}
                  onPress={() => openSearchModal('end')}
                >
                  <Ionicons name="flag" size={18} color={endPoint ? "#1A8D5B" : "#666"} />
                  <Text style={[styles.searchOptionText, endPoint && styles.searchOptionTextActive]}>
                    {endPoint ? "Arrivée définie ✓" : "Choisir l'arrivée"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Bulles simples pour domicile et travail */}
          <View style={styles.simpleBubbles}>
            <TouchableOpacity 
              style={[styles.simpleBubble, homeAddress && styles.simpleBubbleActive]} 
              onPress={homeAddress ? goHome : setAsHome}
              onLongPress={homeAddress ? setAsHome : undefined}
            >
              <Ionicons name="home" size={24} color={homeAddress ? "#1A8D5B" : "#666"} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.simpleBubble, workAddress && styles.simpleBubbleActive]} 
              onPress={workAddress ? goToWork : setAsWork}
              onLongPress={workAddress ? setAsWork : undefined}
            >
              <Ionicons name="briefcase" size={24} color={workAddress ? "#1A8D5B" : "#666"} />
            </TouchableOpacity>
          </View>

          {isLoading && (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#1A8D5B" />
              <Text style={styles.loadingText}>Calcul de l'itinéraire...</Text>
            </View>
          )}
        </View>
      )}

      {/* Bulles fixes pendant la navigation */}
      {/* Bulle Ma position en bas à gauche - toujours visible */}
      <TouchableOpacity 
        style={styles.locationBubble} 
        onPress={getUserLocation}
      >
        <Ionicons name="locate" size={24} color="#1A8D5B" />
      </TouchableOpacity>

      {/* Bulle Signalement en bas à droite - toujours visible */}
      <TouchableOpacity 
        style={styles.signalBubble} 
        onPress={openSignalModal}
      >
        <Ionicons name="warning" size={24} color="#FF5722" />
      </TouchableOpacity>

      {/* Bouton lancer le trajet en bas - seulement quand pas en navigation */}
      {routeInfo && !isNavigating && (
        <TouchableOpacity style={styles.startJourneyButtonBottom} onPress={startNavigation}>
          <Ionicons name="navigate" size={24} color="white" />
          <Text style={styles.startJourneyText}>Lancer le trajet</Text>
        </TouchableOpacity>
      )}

      {/* Carte de navigation flottante pendant la navigation - au centre */}
      {isNavigating && currentInstruction && (
        <View style={styles.navigationCard}>
          <View style={styles.navigationHeader}>
            <TouchableOpacity style={styles.stopNavButtonSmall} onPress={stopNavigation}>
              <Ionicons name="stop" size={16} color="white" />
              <Text style={styles.stopNavButtonText}>Stop</Text>
            </TouchableOpacity>
            <Text style={styles.navigationTitle}>Navigation en cours</Text>
            <View style={styles.navigationDistance}>
              <Text style={styles.distanceText}>
                {getDistanceToCurrentInstruction()}
              </Text>
            </View>
          </View>
          <View style={styles.navigationContent}>
            <Text style={styles.navigationInstructionText}>
              {currentInstruction.instruction}
            </Text>
          </View>
        </View>
      )}

      {/* Modal de signalements */}
      {showSignalModal && (
        <Modal
          visible={showSignalModal}
          transparent={true}
          animationType="none"
          onRequestClose={closeSignalModal}
        >
          <View style={styles.signalModalOverlay}>
            <Animated.View 
              style={[
                styles.signalModalContent,
                {
                  transform: [{ translateY: slideAnim }]
                }
              ]}
              {...panResponder.panHandlers}
            >
              {/* Handle bar pour glisser */}
              <View style={styles.modalHandle} />
              
              <View style={styles.signalModalHeader}>
                <Text style={styles.signalModalTitle}>🚨 Faire un signalement</Text>
                <TouchableOpacity onPress={closeSignalModal}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.signalTypesContainer}>
                {Object.values(SIGNAL_TYPES).map((signalType) => (
                  <TouchableOpacity
                    key={signalType.id}
                    style={[styles.signalTypeButton, { backgroundColor: signalType.backgroundColor }]}
                    onPress={() => selectSignalType(signalType)}
                  >
                    <View style={styles.signalTypeContent}>
                      <View style={[styles.signalTypeIcon, { backgroundColor: signalType.color }]}>
                        <Ionicons name={signalType.icon} size={24} color="white" />
                      </View>
                      <Text style={styles.signalTypeText}>{signalType.title}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.signalInstructions}>
                Sélectionnez le type de signalement, puis appuyez sur la carte à l'endroit souhaité.
              </Text>
            </Animated.View>
          </View>
        </Modal>
      )}

      {/* Modal de recherche */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSearchModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {searchType === 'start' ? '📍 Choisir le départ' : 
                 searchType === 'end' ? '🎯 Choisir l\'arrivée' :
                 searchType === 'home' ? '🏠 Définir le domicile' :
                 searchType === 'work' ? '💼 Définir le travail' : 'Rechercher'}
              </Text>
              <TouchableOpacity onPress={() => setShowSearchModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher une adresse..."
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                searchAddress(text);
              }}
              autoFocus
            />

            {/* Bouton pour utiliser ma position actuelle */}
            {userLocation && searchType === 'start' && (
              <TouchableOpacity
                style={styles.currentLocationButton}
                onPress={() => {
                  setStartPoint(userLocation);
                  setShowSearchModal(false);
                }}
              >
                <Ionicons name="locate" size={20} color="#1A8D5B" />
                <Text style={styles.currentLocationText}>Utiliser ma position actuelle</Text>
              </TouchableOpacity>
            )}

            <ScrollView style={styles.searchResultsContainer}>
              {isSearching ? (
                <ActivityIndicator size="small" color="#1A8D5B" style={{ marginTop: 20 }} />
              ) : (
                searchResults.map((result) => (
                  <TouchableOpacity
                    key={result.id}
                    style={styles.searchResultItem}
                    onPress={() => selectAddress(result)}
                  >
                    <Ionicons name="location" size={20} color="#1A8D5B" />
                    <Text style={styles.searchResultText}>{result.label}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFDF3',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 30 : 70,
    left: 15,
    right: 15,
    zIndex: 1000,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  routeInfo: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#E8F5E8',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1A8D5B',
  },
  routeText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#1A8D5B',
    fontWeight: '600',
  },
  startNavButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  startNavButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  stopNavButton: {
    backgroundColor: '#F44336',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  stopNavButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  searchContainer: {
    marginBottom: 10,
  },
  searchBarToggle: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBarText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#666',
  },
  expandedSearch: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    marginTop: 5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchOptionActive: {
    backgroundColor: 'rgba(26, 141, 91, 0.05)',
  },
  searchOptionText: {
    marginLeft: 10,
    fontSize: 15,
    color: '#666',
  },
  searchOptionTextActive: {
    color: '#1A8D5B',
    fontWeight: '600',
  },
  simpleBubbles: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  simpleBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 50,
    marginHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 60,
    height: 60,
  },
  simpleBubbleActive: {
    backgroundColor: 'rgba(26, 141, 91, 0.1)',
    borderColor: '#1A8D5B',
  },
  locationBubble: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 60,
    height: 60,
    zIndex: 1000,
  },
  signalBubble: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#FF5722',
    width: 60,
    height: 60,
    zIndex: 1000,
  },
  startJourneyButtonBottom: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#1A8D5B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 1000,
  },
  startJourneyText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  // Carte de navigation flottante redessinée
  navigationCard: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
    borderLeftWidth: 4,
    borderLeftColor: '#1A8D5B',
  },
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  stopNavButtonSmall: {
    backgroundColor: '#F44336',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navigationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A8D5B',
    flex: 1,
    textAlign: 'center',
  },
  navigationDistance: {
    backgroundColor: '#E8F5E8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  distanceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A8D5B',
  },
  navigationContent: {
    padding: 16,
  },
  navigationInstructionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  loading: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 20,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#1A8D5B',
    fontWeight: '600',
  },
  startMarker: {
    backgroundColor: '#1A8D5B',
    borderRadius: 20,
    padding: 8,
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  endMarker: {
    backgroundColor: '#FF5722',
    borderRadius: 20,
    padding: 8,
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  signalMarker: {
    borderRadius: 20,
    padding: 8,
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  // Styles du modal de signalement
  signalModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  signalModalContent: {
    backgroundColor: '#FAFDF3',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: height * 0.4,
    maxHeight: height * 0.7,
    paddingBottom: 34, // Pour l'espace en bas
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#CCC',
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  signalModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  signalModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A8D5B',
  },
  signalTypesContainer: {
    padding: 20,
  },
  signalTypeButton: {
    borderRadius: 15,
    marginBottom: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  signalTypeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  signalTypeIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  signalTypeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  signalInstructions: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    paddingBottom: 10,
    fontStyle: 'italic',
  },
  // Styles du modal de recherche (existants)
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.8,
    minHeight: height * 0.4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A8D5B',
  },
  searchInput: {
    margin: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: '#F5F5F5',
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 20,
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    marginBottom: 10,
  },
  currentLocationText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#1A8D5B',
    fontWeight: '600',
  },
  searchResultsContainer: {
    maxHeight: height * 0.4,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 5,
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
  },
  searchResultText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});

export default Signal;