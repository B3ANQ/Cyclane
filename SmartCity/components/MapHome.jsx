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
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjQxNDNmODQ5NGQ2OTRiNWFhNmRjOWU2ZmUxN2M5OTkzIiwiaCI6Im11cm11cjY0In0=';

function MapHome() {
  const [userLocation, setUserLocation] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchType, setSearchType] = useState(''); // 'start' ou 'end'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const mapRef = useRef(null);

  // Adresses prédéfinies
  const [homeAddress, setHomeAddress] = useState(null);
  const [workAddress, setWorkAddress] = useState(null);

  useEffect(() => {
    getUserLocation();
  }, []);

  // Obtenir la localisation de l'utilisateur
  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'L\'accès à la localisation est nécessaire');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
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

  // Calculer l'itinéraire
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
        const distance = (properties.distance / 1000).toFixed(1);
        const duration = Math.round(properties.duration / 60);
        
        setRouteCoordinates(coordinates);
        setRouteInfo({ distance, duration });
        
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
      // Si on ouvre la search bar, reset les résultats
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
        initialRegion={BORDEAUX_REGION}
        showsUserLocation={true}
        showsMyLocationButton={false}
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
            strokeColor="#1A8D5B"
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

      {/* Bouton lancer le trajet en bas */}
      {routeInfo && (
        <TouchableOpacity style={styles.startJourneyButtonBottom} onPress={() => Alert.alert('🚴‍♂️ Bon voyage !', 'Navigation démarrée')}>
          <Ionicons name="navigate" size={24} color="white" />
          <Text style={styles.startJourneyText}>Lancer le trajet</Text>
        </TouchableOpacity>
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
                 searchType === 'work' ? '💼 Redéfinir le travail ?' : 'Rechercher'}
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
  searchContainer: {
    marginBottom: 10,
  },
  searchButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchButtonActive: {
    backgroundColor: 'rgba(26, 141, 91, 0.1)',
    borderWidth: 1,
    borderColor: '#1A8D5B',
  },
  searchButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#666',
  },
  searchButtonTextActive: {
    color: '#1A8D5B',
    fontWeight: '600',
  },
  // Styles de la search bar déroulante
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
  // Styles des bulles 
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
  // Style de la bulle Ma position
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
  // Style de la bulle Reset
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
  // Style du bouton lancer trajet
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
  // Styles des marqueurs
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
});

export default MapHome;