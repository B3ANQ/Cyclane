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
import ArceauIcon from './ArceauIcon';
import FreeFloatingIcon from './FreeFloatingIcon';
import LeVeloIcon from './LeVeloIcon';

proj4.defs("EPSG:2154", "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

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
  const [arceaux, setArceaux] = useState([]);
  const [isLoadingArceaux, setIsLoadingArceaux] = useState(false);
  const [freeFloatingZones, setFreeFloatingZones] = useState([]);
  const [isLoadingFreeFloating, setIsLoadingFreeFloating] = useState(false);
  const [veloStations, setVeloStations] = useState([]);
  const [isLoadingVeloStations, setIsLoadingVeloStations] = useState(false);
  const [selectedVeloStation, setSelectedVeloStation] = useState(null);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [filters, setFilters] = useState({
    bikeServices: false,
    arceaux: false,
    freeFloating: false,
    veloStations: false,
  });

  // Nouvel état pour le signalement d'incidents
  const [showSignalModal, setShowSignalModal] = useState(false);
  const [selectedSignalType, setSelectedSignalType] = useState(null);
  const [isPlacingSignal, setIsPlacingSignal] = useState(false);

  // Types de signalement
  const SIGNAL_TYPES = {
    BLOCKED_ROAD: {
      id: 'blocked_road',
      title: 'Route bloquée',
      icon: 'warning',
      color: '#FF5722',
      backgroundColor: '#FFEBEE'
    },
    DEGRADED_PATH: {
      id: 'degraded_path',
      title: 'Piste dégradée',
      icon: 'alert-circle',
      color: '#FF9800',
      backgroundColor: '#FFF3E0'
    },
    BIKE_OBSTRUCTION: {
      id: 'bike_obstruction',
      title: 'Voie cyclable obstruée',
      icon: 'bicycle',
      color: '#F44336',
      backgroundColor: '#FFEBEE'
    }
  };

  // Nouveaux états pour les signalements
  const [signalements, setSignalements] = useState([]);
  const [isLoadingSignalements, setIsLoadingSignalements] = useState(false);

  useEffect(() => {
    requestLocationPermission();
    loadBikeServices();
    loadArceaux();
    loadFreeFloatingZones();
    loadVeloStations();
    fetchSignalements();
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
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Fonction de clustering des arceaux
  function clusterArceaux(arceaux, rayon = 10) {
    const clusters = [];
    for (const arceau of arceaux) {
      let found = false;
      for (const cluster of clusters) {
        const d = distanceMeters(
          arceau.wgs84Coords.latitude, arceau.wgs84Coords.longitude,
          cluster.latitude, cluster.longitude
        );
        if (d < rayon) {
          // Ajoute au cluster existant
          cluster.ids.push(arceau.id);
          cluster.count += arceau.nombre || 1;
          // Moyenne pondérée pour la position
          cluster.latitude = (cluster.latitude * (cluster.count - (arceau.nombre || 1)) + arceau.wgs84Coords.latitude * (arceau.nombre || 1)) / cluster.count;
          cluster.longitude = (cluster.longitude * (cluster.count - (arceau.nombre || 1)) + arceau.wgs84Coords.longitude * (arceau.nombre || 1)) / cluster.count;
          found = true;
          break;
        }
      }
      if (!found) {
        clusters.push({
          ids: [arceau.id],
          count: arceau.nombre || 1,
          latitude: arceau.wgs84Coords.latitude,
          longitude: arceau.wgs84Coords.longitude,
        });
      }
    }
    return clusters;
  }

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

    const distanceToInstruction = distanceMeters(
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

    const distance = distanceMeters(
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

  // Fonction pour charger les arceaux vélo
  const loadArceaux = async () => {
    setIsLoadingArceaux(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_SMARTCITY_API_URL || 'http://10.0.2.2:3000';
      const response = await fetch(`${apiUrl}/api/arceaux`);
      const data = await response.json();
      if (data.success && data.data) {
        const arceauxWithCoords = data.data.map(item => {
          const coords = lambert93ToWGS84(
            item.coordonnees.x,
            item.coordonnees.y
          );
          return {
            ...item,
            wgs84Coords: coords
          };
        });
        // Cluster les arceaux
        const clustered = clusterArceaux(arceauxWithCoords, 50); // 50 mètres
        setArceaux(clustered);
      }
    } catch (error) {
      console.error('Erreur chargement arceaux:', error);
    } finally {
      setIsLoadingArceaux(false);
    }
  };

  // Fonction pour charger les zones de free-floating
  const loadFreeFloatingZones = async () => {
    setIsLoadingFreeFloating(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_SMARTCITY_API_URL || 'http://10.0.2.2:3000';
      const response = await fetch(`${apiUrl}/api/freefloating`);
      const data = await response.json();
      if (data.success && data.zones) {
        setFreeFloatingZones(data.zones);
      }
    } catch (error) {
      console.error('Erreur chargement freefloating:', error);
    } finally {
      setIsLoadingFreeFloating(false);
    }
  };

  // Fonction pour charger les stations de vélo
  const loadVeloStations = async () => {
    setIsLoadingVeloStations(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_SMARTCITY_API_URL || 'http://10.0.2.2:3000';
      const response = await fetch(`${apiUrl}/api/vcub`);
      const data = await response.json();
      if (data.success && data.data) {
        const stationsWithCoords = data.data.map(station => {
          const coords = lambert93ToWGS84(
            station.coordonnees.x,
            station.coordonnees.y
          );
          return {
            ...station,
            wgs84Coords: coords
          };
        });
        setVeloStations(stationsWithCoords);
      }
    } catch (error) {
      console.error('Erreur chargement stations vélo:', error);
    } finally {
      setIsLoadingVeloStations(false);
    }
  };

  // Fonction pour charger les signalements
  const fetchSignalements = async () => {
    setIsLoadingSignalements(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_SMARTCITY_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/signalements`);
      const data = await response.json();
      if (data.success && data.data) {
        setSignalements(data.data);
      }
    } catch (error) {
      console.error('Erreur chargement signalements:', error);
    } finally {
      setIsLoadingSignalements(false);
    }
  };

  const sendSignalement = async (type, latitude, longitude) => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_SMARTCITY_API_URL || 'http://192.168.1.172:3000';
      const typeApi = {
        blocked_road: 'route_barrée',
        degraded_path: 'piste_dégradée',
        bike_obstruction: 'voie_cyclable_obstruée',
      }[type.id] || type.id;

      const body = {
        type: typeApi,
        latitude,
        longitude,
      };

      const response = await fetch(`${apiUrl}/api/signalements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('✅ Signalement envoyé', 'Merci pour votre contribution !');
        fetchSignalements(); // recharge la liste après ajout
      } else {
        Alert.alert('Erreur', data.message || 'Impossible d\'envoyer le signalement');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'envoyer le signalement');
      console.error(error);
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
        onPress={isPlacingSignal ? (event) => {
          const { latitude, longitude } = event.nativeEvent.coordinate;
          sendSignalement(selectedSignalType, latitude, longitude);
          setIsPlacingSignal(false);
          setSelectedSignalType(null);
        } : handleMapPress}
        showsUserLocation={locationPermission}
        showsMyLocationButton={false}
        followsUserLocation={isNavigating}
        showsCompass={true}
      >
        {/* Marqueurs des services vélo */}
        {filters.bikeServices && bikeServices.map(service => (
          <Marker
            key={service.id}
            coordinate={service.wgs84Coords}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            {createServiceMarker(service)}
          </Marker>
        ))}

        {/* Marqueurs des arceaux vélo */}
        {filters.arceaux && arceaux.map((arceau, idx) => (
          <Marker
            key={arceau.ids ? arceau.ids.join('-') : idx}
            coordinate={{ latitude: arceau.latitude, longitude: arceau.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.serviceMarkerContainer}>
              <ArceauIcon size={12} />
              {arceau.count > 1 && (
                <Text style={{ marginLeft: 2, color: '#888', fontWeight: 'bold', fontSize: 10 }}>
                  ×{arceau.count}
                </Text>
              )}
            </View>
          </Marker>
        ))}

        {/* Marqueurs des zones freefloating */}
        {filters.freeFloating && freeFloatingZones.map(zone => (
          <Marker
            key={zone.gid}
            coordinate={{
              latitude: zone.geo_point_2d.lat,
              longitude: zone.geo_point_2d.lon,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <FreeFloatingIcon size={28} />
          </Marker>
        ))}

        {/* Marqueurs des stations Le Vélo TBM */}
        {filters.veloStations && veloStations.map(station => (
          <Marker
            key={station.id}
            coordinate={station.wgs84Coords}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => setSelectedVeloStation(station)}
          >
            <LeVeloIcon size={32} />
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

        {/* Marqueurs des signalements */}
        {signalements.map((signalement) => {
          let iconName = 'alert-circle';
          let iconColor = '#FF9800';
          if (signalement.type === 'route_barrée') {
            iconName = 'warning';
            iconColor = '#FF5722';
          } else if (signalement.type === 'piste_dégradée') {
            iconName = 'alert-circle';
            iconColor = '#FF9800';
          } else if (signalement.type === 'voie_cyclable_obstruée') {
            iconName = 'bicycle';
            iconColor = '#F44336';
          }
          return (
            <Marker
              key={signalement.id}
              coordinate={{
                latitude: signalement.latitude,
                longitude: signalement.longitude,
              }}
              title={signalement.type.replace(/_/g, ' ')}
              description={new Date(signalement.timestamp).toLocaleString()}
            >
              <View style={{
                backgroundColor: iconColor,
                borderRadius: 20,
                padding: 8,
                borderWidth: 2,
                borderColor: 'white',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              }}>
                <Ionicons name={iconName} size={22} color="white" />
              </View>
            </Marker>
          );
        })}
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
            <View style={styles.searchRow}>
              <TouchableOpacity style={styles.searchBarToggle} onPress={toggleSearchBar}>
                <Ionicons name="search" size={20} color="#666" />
                <Text
                  style={styles.searchBarText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Rechercher une destination
                </Text>
                <Ionicons
                  name={isSearchExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
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

            <TouchableOpacity
              style={styles.simpleBubble}
              onPress={() => setShowFiltersModal(true)}
            >
              <Ionicons name="options" size={24} color="#1A8D5B" />
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

        {/* Indicateur de chargement des arceaux */}
        {isLoadingArceaux && (
          <View style={styles.servicesLoading}>
            <ActivityIndicator size="small" color="#1A8D5B" />
            <Text style={styles.servicesLoadingText}>Chargement des arceaux vélo...</Text>
          </View>
        )}

        {/* Indicateur de chargement des services freefloating */}
        {isLoadingFreeFloating && (
          <View style={styles.servicesLoading}>
            <ActivityIndicator size="small" color="#1A8D5B" />
            <Text style={styles.servicesLoadingText}>Chargement freefloating...</Text>
          </View>
        )}

        {/* Indicateur de chargement des stations Le Vélo */}
        {isLoadingVeloStations && (
          <View style={styles.servicesLoading}>
            <ActivityIndicator size="small" color="#1A8D5B" />
            <Text style={styles.servicesLoadingText}>Chargement des stations Le Vélo...</Text>
          </View>
        )}

        {/* Indicateur de chargement des signalements */}
        {isLoadingSignalements && (
          <View style={styles.servicesLoading}>
            <ActivityIndicator size="small" color="#FF5722" />
            <Text style={styles.servicesLoadingText}>Chargement des signalements...</Text>
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

      {/* Détails de la station sélectionnée */}
      {selectedVeloStation && (
        <View style={{
          position: 'absolute',
          bottom: 180,
          left: 20,
          right: 20,
          backgroundColor: 'white',
          borderRadius: 14,
          padding: 18,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 8,
          zIndex: 2000,
        }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>
            Station Le Vélo TBM : {selectedVeloStation.nom}
          </Text>
          <Text>Nombre de places : <Text style={{ fontWeight: 'bold' }}>{selectedVeloStation.nbplaces}</Text></Text>
          <Text>Vélos classiques : <Text style={{ fontWeight: 'bold' }}>{selectedVeloStation.nbclassique}</Text></Text>
          <Text>Vélos électriques : <Text style={{ fontWeight: 'bold' }}>{selectedVeloStation.nbelec}</Text></Text>
          <TouchableOpacity
            style={{ marginTop: 12, alignSelf: 'flex-end', padding: 6 }}
            onPress={() => setSelectedVeloStation(null)}
          >
            <Text style={{ color: '#1A8D5B', fontWeight: 'bold' }}>Fermer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de filtres */}
      <Modal
        visible={showFiltersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFiltersModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.3)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            backgroundColor: 'white',
            borderRadius: 18,
            padding: 28,
            width: '85%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 8,
          }}>
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 18, color: '#1A8D5B' }}>
              Filtres d'affichage
            </Text>
            {[
              { key: 'bikeServices', label: 'Services vélo' },
              { key: 'arceaux', label: 'Arceaux vélo' },
              { key: 'freeFloating', label: 'Zones freefloating' },
              { key: 'veloStations', label: 'Stations Le Vélo TBM' },
            ].map(f => (
              <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ flex: 1, fontSize: 16 }}>{f.label}</Text>
                <TouchableOpacity
                  onPress={() => setFilters(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                  style={{
                    width: 44, height: 28, borderRadius: 14, backgroundColor: filters[f.key] ? '#1A8D5B' : '#E0E0E0',
                    justifyContent: 'center', padding: 3,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, backgroundColor: 'white',
                    alignSelf: filters[f.key] ? 'flex-end' : 'flex-start',
                    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
                  }} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={{ marginTop: 10, alignSelf: 'flex-end', padding: 8 }}
              onPress={() => setShowFiltersModal(false)}
            >
              <Text style={{ color: '#1A8D5B', fontWeight: 'bold', fontSize: 16 }}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de signalement */}
      <Modal
        visible={showSignalModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSignalModal(false)}
      >
        <View style={styles.signalModalOverlay}>
          <View style={styles.signalModalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.signalModalHeader}>
              <Text style={styles.signalModalTitle}>🚨 Faire un signalement</Text>
              <TouchableOpacity onPress={() => setShowSignalModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.signalTypesContainer}>
              {Object.values(SIGNAL_TYPES).map((signalType) => (
                <TouchableOpacity
                  key={signalType.id}
                  style={[styles.signalTypeButton, { backgroundColor: signalType.backgroundColor }]}
                  onPress={() => {
                    setSelectedSignalType(signalType);
                    setIsPlacingSignal(true);
                    setShowSignalModal(false);
                    Alert.alert(
                      'Placer le signalement',
                      'Appuyez sur la carte à l\'endroit où vous souhaitez signaler ce problème ou utilisez le bouton en bas à droite pour le placer à votre position actuelle.'
                    );
                  }}
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
              Sélectionnez le type de signalement, puis appuyez sur la carte à l'endroit souhaité
              {"\n"}ou utilisez le bouton "Placer à ma position actuelle".
            </Text>
          </View>
        </View>
      </Modal>

      {/* Bulle de signalement */}
      <TouchableOpacity
        style={[styles.signalBubble, { bottom: 100 }]} // Décale le bouton au-dessus du reset
        onPress={() => setShowSignalModal(true)}
      >
        <Ionicons name="warning" size={24} color="#FF5722" />
      </TouchableOpacity>

      {/* Bulle pour placer le signalement à ma position */}
      {userLocation && selectedSignalType && isPlacingSignal && (
        <TouchableOpacity
          style={styles.placeAtMyPositionBubble}
          onPress={() => {
            sendSignalement(selectedSignalType, userLocation.latitude, userLocation.longitude);
            setIsPlacingSignal(false);
            setSelectedSignalType(null);
          }}
        >
          <Ionicons name="locate" size={22} color="white" />
        </TouchableOpacity>
      )}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchBarToggle: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 8, // réduit de 10 à 8
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
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
    minWidth: 0,
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
    backgroundColor: '#FAFDF3',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: height * 0.4,
    maxHeight: height * 0.7,
    paddingBottom: 34,
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
    fontSize: 20,
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

  serviceMarkerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 1,
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
  filterButton: {
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 8, // réduit de 10 à 8
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
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
  signalBubble: {
    position: 'absolute',
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
    paddingBottom: 34,
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
  placeAtMyPositionBubble: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    backgroundColor: '#FF5722',
    padding: 15,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: 60,
    height: 60,
    zIndex: 1000,
  },
});

export default MapEnhanced;