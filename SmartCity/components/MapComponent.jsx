import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Dimensions
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';

const { height } = Dimensions.get('window');

const BORDEAUX_REGION = {
  latitude: 44.837789,
  longitude: -0.57918,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Récupération de la clé API depuis les variables d'environnement
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.ORS_API_KEY;

function MapComponent() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const mapRef = useRef(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const router = useRouter();

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

  const resetRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavigationInstructions([]);
    stopNavigation();
    setIsSearchExpanded(false);
    
    // Recentrer la carte sur l'utilisateur
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
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
      
      // Vérifier que data.features existe et est un tableau
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

  // Ouvrir le modal de recherche
  const openSearchModal = (type) => {
    setSearchType(type);
    setShowSearchModal(true);
  };

  // Toggle de la barre de recherche
  const toggleSearchBar = () => {
    setIsSearchExpanded(!isSearchExpanded);
    if (!isSearchExpanded) {
      // Si on ouvre la search bar, reset les résultats
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  // Définir l'adresse de la maison
  const setAsHome = () => {
    if (!homeAddress) {
      // Si pas de domicile défini, ouvrir la recherche pour le définir
      setSearchType('home');
      setShowSearchModal(true);
    } else {
      // Si domicile déjà défini, demander confirmation pour le redéfinir
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
      // Si pas de travail défini, ouvrir la recherche pour le définir
      setSearchType('work');
      setShowSearchModal(true);
    } else {
      // Si travail déjà défini, demander confirmation pour le redéfinir
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
      Alert.alert('❌', 'Aucune adresse de domicile enregistrée');
      return;
    }
    
    const start = userLocation || BORDEAUX_REGION;
    setStartPoint(start);
    setEndPoint(homeAddress);
    getRoute(start, homeAddress);
    setIsSearchExpanded(false);
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
    setIsSearchExpanded(false);
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
        showsMyLocationButton={locationPermission}
        followsUserLocation={isNavigating}
        showsCompass={true}
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
        {/* Header avec infos route */}
        {routeInfo && (
          <View style={styles.header}>
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
          </View>
        )}

        {/* Search bar déroulante */}
        <View style={styles.searchContainer}>
          <TouchableOpacity style={styles.searchBarToggle} onPress={toggleSearchBar}>
            <Ionicons name="search" size={20} color="#666" />
            <Text style={styles.searchBarText}>Planifier un itinéraire</Text>
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
                <Ionicons name="play-circle" size={18} color={startPoint ? "#2196F3" : "#666"} />
                <Text style={[styles.searchOptionText, startPoint && styles.searchOptionTextActive]}>
                  {startPoint ? "Départ défini ✓" : "Choisir le départ"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.searchOption, endPoint && styles.searchOptionActive]}
                onPress={() => openSearchModal('end')}
              >
                <Ionicons name="flag" size={18} color={endPoint ? "#2196F3" : "#666"} />
                <Text style={[styles.searchOptionText, endPoint && styles.searchOptionTextActive]}>
                  {endPoint ? "Arrivée définie ✓" : "Choisir l'arrivée"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bulles domicile et travail */}
        <View style={styles.quickAddressContainer}>
          <TouchableOpacity 
            style={[styles.quickAddressBubble, homeAddress && styles.quickAddressBubbleActive]} 
            onPress={homeAddress ? goHome : setAsHome}
            onLongPress={homeAddress ? setAsHome : undefined}
          >
            <Ionicons name="home" size={24} color={homeAddress ? "#2196F3" : "#666"} />
            <Text style={[styles.quickAddressText, homeAddress && styles.quickAddressTextActive]}>
              {homeAddress ? "Domicile" : "Définir\ndomicile"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.quickAddressBubble, workAddress && styles.quickAddressBubbleActive]} 
            onPress={workAddress ? goToWork : setAsWork}
            onLongPress={workAddress ? setAsWork : undefined}
          >
            <Ionicons name="briefcase" size={24} color={workAddress ? "#2196F3" : "#666"} />
            <Text style={[styles.quickAddressText, workAddress && styles.quickAddressTextActive]}>
              {workAddress ? "Travail" : "Définir\ntravail"}
            </Text>
          </TouchableOpacity>
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
          {userLocation && !startPoint && !endPoint && (
            <Text style={styles.instructionText}>
              🎯 Planifiez votre itinéraire en choisissant un départ et une arrivée ou utilisez les raccourcis domicile/travail
            </Text>
          )}
          {startPoint && endPoint && routeInfo && (
            <Text style={styles.instructionText}>
              ✅ Itinéraire calculé ! Vous pouvez démarrer la navigation.
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

        {/* Bouton pour aller à la page de filtres */}
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => router.push('/filterpage')}
        >
          <Text style={styles.filterButtonText}>🔎 Filtres</Text>
        </TouchableOpacity>
      </View>

      {/* Carte flottante de navigation en bas */}
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

      {/* Modal de recherche d'adresse */}
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

            {/* Bouton pour utiliser ma position actuelle (seulement pour le départ) */}
            {userLocation && searchType === 'start' && (
              <TouchableOpacity
                style={styles.currentLocationButton}
                onPress={() => {
                  setStartPoint(userLocation);
                  setShowSearchModal(false);
                  if (endPoint) {
                    getRoute(userLocation, endPoint);
                    setIsSearchExpanded(false);
                  }
                }}
              >
                <Ionicons name="locate" size={20} color="#2196F3" />
                <Text style={styles.currentLocationText}>Utiliser ma position actuelle</Text>
              </TouchableOpacity>
            )}

            <ScrollView style={styles.searchResultsContainer}>
              {isSearching ? (
                <ActivityIndicator size="small" color="#2196F3" style={{ marginTop: 20 }} />
              ) : (
                searchResults.map((result) => (
                  <TouchableOpacity
                    key={result.id}
                    style={styles.searchResultItem}
                    onPress={() => selectAddress(result)}
                  >
                    <Ionicons name="location" size={20} color="#2196F3" />
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
  
  // Styles de la search bar déroulante
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
    backgroundColor: 'rgba(33, 150, 243, 0.05)',
  },
  searchOptionText: {
    marginLeft: 10,
    fontSize: 15,
    color: '#666',
  },
  searchOptionTextActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
  
  // Styles des bulles domicile/travail
  quickAddressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 20,
  },
  quickAddressBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 80,
    minHeight: 80,
  },
  quickAddressBubbleActive: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderColor: '#2196F3',
  },
  quickAddressText: {
    marginTop: 5,
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  quickAddressTextActive: {
    color: '#2196F3',
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
  filterButton: {
    marginTop: 10,
    backgroundColor: '#1A8D5B',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  filterButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default MapComponent;