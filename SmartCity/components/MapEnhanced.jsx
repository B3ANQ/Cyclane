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
  Image,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import proj4 from 'proj4';
import PompeIcon from './PompeIcon';
import TotemIcon from './TotemIcon';

proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const { width, height } = Dimensions.get('window');

const BORDEAUX_REGION = {
  latitude: 44.837789,
  longitude: -0.57918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Clé API OpenRouteService
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.ORS_API_KEY;

// Fonction pour créer le marqueur de service selon le mobilier
const createServiceMarker = (service) => {
  const hasPump = service.mobilier.includes('POMPE');
  const hasTotem = service.mobilier.includes('TOTEM_REPARATION');
  
  if (hasPump && hasTotem) {
    return (
      <View style={styles.serviceMarkerContainer}>
        <PompeIcon size={16} />
        <TotemIcon size={16} />
      </View>
    );
  } else if (hasPump) {
    return (
      <View style={styles.serviceMarkerContainer}>
        <PompeIcon size={20} />
      </View>
    );
  } else if (hasTotem) {
    return (
      <View style={styles.serviceMarkerContainer}>
        <TotemIcon size={20} />
      </View>
    );
  }
  
  // Fallback
  return (
    <View style={styles.serviceMarkerContainer}>
      <Ionicons name="bicycle" size={20} color="#888" />
    </View>
  );
};

const lambert93 = 'EPSG:2154';
const wgs84 = 'EPSG:4326';

function MapEnhanced() {
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

  // Nouveaux états pour les services vélo
  const [bikeServices, setBikeServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);

  useEffect(() => {
    requestLocationPermission();
    loadBikeServices(); // Charger les services au démarrage
  }, []);

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

  // Gestion du clic sur la carte - Ajout de la logique de MapComponent
  const handleMapPress = (event) => {
    const coordinate = event.nativeEvent.coordinate;
    
    // Vérifier que la localisation utilisateur est disponible
    if (!userLocation) {
      Alert.alert('Erreur', 'Position utilisateur non disponible');
      return;
    }
    
    // Définir automatiquement le point de départ et d'arrivée
    setStartPoint(userLocation);
    setEndPoint(coordinate);
    getRoute(userLocation, coordinate);
  };

  // Fonction pour charger les services vélo
  const loadBikeServices = async () => {
    setIsLoadingServices(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_SMARTCITY_API_URL || 'http://10.0.2.2:3000';
      console.log('🔍 Chargement des services depuis:', `${apiUrl}/api/services`);
      
      const response = await fetch(`${apiUrl}/api/services`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Services récupérés:', data.count, 'services');
      
      if (data.success && data.data) {
        // Convertir les coordonnées Lambert93 vers WGS84
        const servicesWithCoords = data.data.map(service => {
          const coords = lambert93ToWGS84(
            service.coordonnees.x, 
            service.coordonnees.y
          );
          return {
            ...service,
            wgs84Coords: coords
          };
        });
        
        setBikeServices(servicesWithCoords);
        console.log('🚲 Services avec coordonnées:', servicesWithCoords.length);
      } else {
        console.warn('⚠️ Réponse API invalide:', data);
      }
    } catch (error) {
      console.error('❌ Erreur chargement services:', error);
    } finally {
      setIsLoadingServices(false);
    }
  };

  // Remplace la fonction lambert93ToWGS84 par cette version de test :
  const lambert93ToWGS84 = (x, y) => {
    // Test : utiliser directement les valeurs comme coordonnées WGS84
    // En inversant potentiellement lat/lon
    return { 
      latitude: 44.837789 + ((y - 4188250) * 0.000009), // Approximation pour Bordeaux
      longitude: -0.57918 + ((x - 1417341) * 0.000009)
    };
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
        showsMyLocationButton={false}
        followsUserLocation={isNavigating}
        showsCompass={true}
      >
        {/* Marqueurs des services vélo */}
        {bikeServices.map(service => (
          <Marker
            key={service.id}
            coordinate={service.wgs84Coords}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            {createServiceMarker(service)}
          </Marker>
        ))}

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

      {/* Interface utilisateur */}
      <View style={styles.overlay}>
        {/* Header avec infos route - Affiché seulement si pas en navigation */}
        {routeInfo && !isNavigating && (
          <View style={styles.header}>
            <View style={styles.routeInfo}>
              <Text style={styles.routeText}>
                📍 {routeInfo.distance} km • ⏱️ {routeInfo.duration} min
              </Text>
              {navigationInstructions.length > 0 && (
                <TouchableOpacity style={styles.startNavButton} onPress={startNavigation}>
                  <Text style={styles.startNavButtonText}>🧭 Démarrer la navigation</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Header compact pendant la navigation */}
        {isNavigating && routeInfo && (
          <View style={styles.compactHeader}>
            <View style={styles.compactRouteInfo}>
              <Text style={styles.compactRouteText}>
                📍 {routeInfo.distance} km • ⏱️ {routeInfo.duration} min
              </Text>
              <TouchableOpacity style={styles.stopNavButton} onPress={stopNavigation}>
                <Text style={styles.stopNavButtonText}>⏹️ Arrêter</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Affichage des instructions contextuelles - Masqué pendant la navigation */}
        {!routeInfo && !isNavigating && (
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
            {userLocation && (
              <Text style={styles.instructionText}>
                🎯 Touchez la carte pour choisir votre destination ou utilisez la recherche
              </Text>
            )}
          </View>
        )}

        {/* Search bar déroulante - Masquée pendant la navigation */}
        {!isNavigating && (
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
        )}

        {/* Bulles simples pour domicile et travail - Masquées pendant la navigation */}
        {!isNavigating && (
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
        )}

        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1A8D5B" />
            <Text style={styles.loadingText}>Calcul de l'itinéraire...</Text>
          </View>
        )}

        {/* Indicateur de chargement des services */}
        {isLoadingServices && (
          <View style={styles.servicesLoading}>
            <ActivityIndicator size="small" color="#1A8D5B" />
            <Text style={styles.servicesLoadingText}>Chargement des services vélo...</Text>
          </View>
        )}
      </View>

      {/* Bulle Ma position en bas à gauche */}
      <TouchableOpacity 
        style={styles.locationBubble} 
        onPress={getUserLocation}
      >
        <Ionicons name="locate" size={24} color="#1A8D5B" />
      </TouchableOpacity>

      {/* Bulle Reset en bas à droite */}
      <TouchableOpacity 
        style={styles.resetBubble} 
        onPress={resetRoute}
      >
        <Ionicons name="refresh" size={24} color="#FF5722" />
      </TouchableOpacity>

      {/* Bouton lancer le trajet - Affiché seulement si itinéraire calculé et pas en navigation */}
      {routeInfo && !isNavigating && (
        <TouchableOpacity style={styles.startJourneyButtonBottom} onPress={startNavigation}>
          <Ionicons name="navigate" size={24} color="white" />
          <Text style={styles.startJourneyText}>Lancer le trajet</Text>
        </TouchableOpacity>
      )}

      {/* Carte de navigation flottante - Remplace le bouton pendant la navigation */}
      {isNavigating && currentInstruction && (
        <View style={styles.navigationCard}>
          <View style={styles.navigationContent}>
            <Text style={styles.distanceText}>
              {getDistanceToCurrentInstruction()}
            </Text>
            <Text style={styles.navigationInstructionText}>
              {currentInstruction.instruction}
            </Text>
          </View>
        </View>
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
  // Header compact pendant la navigation
  compactHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactRouteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactRouteText: {
    fontSize: 14,
    color: '#1A8D5B',
    fontWeight: '600',
    flex: 1,
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
    padding: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  stopNavButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 12,
  },
  instructions: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
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
  resetBubble: {
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
    borderColor: 'transparent',
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
  // Carte de navigation flottante
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
    color: '#1A8D5B',
    minWidth: 80,
  },
  navigationInstructionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    marginLeft: 16,
    fontWeight: '500',
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
  // Styles du modal
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
  // Nouveaux styles pour les services vélo
  serviceMarkerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  
  servicesLoading: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  
  servicesLoadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#1A8D5B',
  },
});

export default MapEnhanced;