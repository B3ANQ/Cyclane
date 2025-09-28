import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Keyboard,
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
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
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

const getAvoidRadius = (type) => {
  switch (type) {
    case 'route_barrée':
      return 20;
    case 'piste_dégradée':
      return 20;
    case 'voie_cyclable_obstruée':
      return 20;
    default:
      return 20;
  }
};

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
  // Inline start/end search states (Option B)
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startResults, setStartResults] = useState([]);
  const [endResults, setEndResults] = useState([]);
  const [isStartSearching, setIsStartSearching] = useState(false);
  const [isEndSearching, setIsEndSearching] = useState(false);
  const startTimerRef = useRef(null);
  const endTimerRef = useRef(null);
  const [isStartEditing, setIsStartEditing] = useState(false);
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
  const [showStepsModal, setShowStepsModal] = useState(false);

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
  // Toast notification for transient messages (e.g., signalement envoyé)
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef(null);

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

  const showTransientMessage = (msg, duration = 1800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    setShowToast(true);
    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
      toastTimerRef.current = null;
    }, duration);
  };

  // fonts removed — using default system fonts for now

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

      // Par défaut, utiliser la position utilisateur comme départ si aucun départ défini
      if (!startPoint) {
        setStartPoint(userCoords);
        setStartQuery('Ma position');
      }
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

  // Fonction pour créer un polygone circulaire (boucle fermée)
  const createCircularPolygon = (lat, lng, radiusMeters, points = 12) => {
    const coords = [];
    const earthRadius = 6371000; // Rayon de la Terre en mètres

    for (let i = 0; i < points; i++) {
      const angle = (i * 360 / points) * Math.PI / 180;
      const deltaLat = radiusMeters * Math.cos(angle) / earthRadius;
      const deltaLng = radiusMeters * Math.sin(angle) / (earthRadius * Math.cos(lat * Math.PI / 180));
      const pointLat = lat + deltaLat * 180 / Math.PI;
      const pointLng = lng + deltaLng * 180 / Math.PI;
      coords.push([pointLng, pointLat]); // [lon, lat]
    }
    // Boucle fermée
    if (coords.length > 0) {
      coords.push(coords[0]);
    }
    return coords;
  };

  // Fonction pour créer des polygones d'évitement autour des signalements
  const createAvoidPolygons = (signalements) => {
    const polygons = [];
    signalements
      .filter(s => s.status === 'actif')
      .forEach(signalement => {
        const radius = 20; // 20m
        const polygon = createCircularPolygon(
          signalement.latitude,
          signalement.longitude,
          radius
        );
        polygons.push([polygon]); // Format MultiPolygon
      });
    return polygons;
  };

  // Calculer l'itinéraire avec instructions de navigation et évitement des signalements
  const getRoute = async (start, end) => {
    setIsLoading(true);
    try {
      if (!ORS_API_KEY) {
        console.error('OpenRouteService API key missing (ORS_API_KEY)');
        showTransientMessage('Clé ORS manquante — impossible de calculer l\'itinéraire');
        setIsLoading(false);
        return;
      }

      const avoidPolygons = createAvoidPolygons(signalements);

      // Use POST to avoid excessively long GET URLs when options are large
      const bodyPayload = {
        coordinates: [
          [start.longitude, start.latitude],
          [end.longitude, end.latitude]
        ],
        instructions: true,
        units: 'm'
      };

      if (avoidPolygons.length > 0) {
        bodyPayload.options = { avoid_polygons: { type: 'MultiPolygon', coordinates: avoidPolygons } };
      }

      const url = 'https://api.openrouteservice.org/v2/directions/cycling-regular/geojson';
      console.log('ORS POST URL:', url);
      console.log('ORS POST body size:', JSON.stringify(bodyPayload).length);

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': ORS_API_KEY,
          },
          body: JSON.stringify(bodyPayload),
        });
      } catch (netErr) {
        console.error('Network error when calling ORS:', netErr);
        showTransientMessage('Erreur réseau: impossible de joindre le service d\'itinéraire');
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        // Extract server message without throwing
        let text = await response.text();
        try {
          const parsed = JSON.parse(text);
          console.error('ORS error:', parsed);
          showTransientMessage(parsed.error || parsed.message || `Erreur ORS: ${response.status}`);
        } catch (e) {
          console.error('ORS error text:', text);
          showTransientMessage(`Erreur ORS: ${response.status}`);
        }
        setIsLoading(false);
        return;
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
        // Simplify instructions for compact display while riding
        const simplifyStep = (step, coords) => {
          const text = (step.instruction || '').toLowerCase();
          let icon = 'navigate';
          let short = 'Suivre';

          if (text.includes('droite') || text.includes('turn right') || text.includes('right')) {
            icon = 'arrow-forward';
            short = 'Droite';
          } else if (text.includes('gauche') || text.includes('turn left') || text.includes('left')) {
            icon = 'arrow-back';
            short = 'Gauche';
          } else if (text.includes('rond') || text.includes('roundabout')) {
            icon = 'sync';
            // try to extract exit number from the instruction (French/English variants)
            let exitNum = null;
            const exitRegex1 = /(?:sortie|exit)\s*(?:n(?:°|o)?\s*)?(\d+)/i; // 'sortie 2' or 'exit 2'
            const exitRegex2 = /take the\s*(\d+)(?:st|nd|rd|th)?\s*exit/i; // 'take the 2nd exit'
            const m1 = step.instruction && step.instruction.match(exitRegex1);
            const m2 = step.instruction && step.instruction.match(exitRegex2);
            if (m1 && m1[1]) exitNum = m1[1];
            else if (m2 && m2[1]) exitNum = m2[1];
            if (exitNum) {
              // French ordinal formatting
              const n = parseInt(exitNum, 10);
              const ordinal = (n === 1) ? '1ère' : `${n}ème`;
              short = `Rond-point ${ordinal} sortie`;
            } else {
              short = 'Rond-point';
            }
          } else if (text.includes('arriv') || text.includes('destination') || text.includes('finish')) {
            icon = 'flag';
            short = 'Arrivée';
          } else if (text.includes('continuer') || text.includes('straight') || text.includes('continue')) {
            icon = 'arrow-up';
            short = 'Tout droit';
          } else {
            icon = 'navigate';
            short = text.split('.').shift().slice(0, 18) || 'Suivre';
          }

          const dist = step.distance ? `${Math.round(step.distance)}m` : '';
          // For glanceable info we avoid street names; for roundabouts we show exit number if available
          const shortText = dist ? `${short} · ${dist}` : `${short}`;

          return {
            icon,
            shortText,
            full: step.instruction,
            distance: step.distance,
            type: step.type,
            coordinate: {
              latitude: coords[step.way_points[0]]?.latitude || start.latitude,
              longitude: coords[step.way_points[0]]?.longitude || start.longitude,
            }
          };
        };

        const instructions = properties.steps.map((step, index) => ({
          id: index,
          ...simplifyStep(step, coordinates)
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

  // Helpers for navigation UI
  const getCurrentInstructionIndex = () => {
    if (!currentInstruction) return -1;
    return navigationInstructions.findIndex(inst => inst.id === currentInstruction.id);
  };

  const getNavigationProgress = () => {
    const idx = getCurrentInstructionIndex();
    if (idx < 0 || navigationInstructions.length === 0) return 0;
    return Math.min(1, (idx) / Math.max(1, navigationInstructions.length - 1));
  };

  const recenterToUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
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

  // Supprimer uniquement l'itinéraire (ne touche pas au point de départ)
  const clearRoute = () => {
    setEndPoint(null);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setNavigationInstructions([]);
    setCurrentInstruction(null);
    setIsNavigating(false);
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

  // Gestion du clic sur la carte avec prise en compte des signalements
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
    
    // Calculer l'itinéraire en évitant les signalements
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
        // Show a small transient notification instead of modal alert
        showTransientMessage('Signalement envoyé');
        fetchSignalements(); // recharge la liste après ajout
      } else {
        showTransientMessage(data.message || 'Erreur envoi signalement');
      }
    } catch (error) {
      showTransientMessage('Erreur: impossible d\'envoyer le signalement');
      console.error(error);
    }
  };

  // Surveiller les changements de signalements pour recalculer l'itinéraire
  useEffect(() => {
    // Si un itinéraire est actif et que les signalements changent, recalculer
    if (startPoint && endPoint && routeCoordinates.length > 0) {
      console.log('🔄 Recalcul de l\'itinéraire avec nouveaux signalements');
      getRoute(startPoint, endPoint);
    }
  }, [signalements]); // Dépendance sur les signalements

  // Nombre de filtres actifs pour afficher badge sur la bulle 'options'
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

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

        {/* Cercles d'évitement autour des signalements actifs (optionnel pour visualisation) */}
        {signalements
          .filter(s => s.status === 'actif')
          .map((signalement) => (
            <Circle
              key={`avoid-${signalement.id}`}
              center={{
                latitude: signalement.latitude,
                longitude: signalement.longitude,
              }}
              radius={getAvoidRadius(signalement.type)}
              strokeColor="rgba(255, 87, 34, 0.5)"
              fillColor="rgba(255, 87, 34, 0.1)"
              strokeWidth={2}
            />
          ))
        }
      </MapView>

      {/* Interface utilisateur */}
      <View style={styles.overlay}>
        {/* Header avec infos route - Affiché seulement si pas en navigation */}

        {/* Header compact pendant la navigation - nouvelle disposition expérimentale */}
        {isNavigating && routeInfo && (
          <View style={styles.newNavContainer}>
            {/* Large central bubble with icon */}
            <View style={styles.instructionBubbleWrapper}>
              <View style={styles.instructionBubble}>
                <Ionicons name={currentInstruction?.icon || 'navigate'} size={30} color="white" />
              </View>
              {/* Distance badge (small circle) */}
              <View style={styles.distanceBadge}>
                <Text style={{ color: 'white', fontWeight: '700' }}>{getDistanceToCurrentInstruction() || ''}</Text>
              </View>
            </View>

            {/* Main short instruction centered */}
            <Text style={styles.newInstructionText} numberOfLines={2} ellipsizeMode="tail">
              {currentInstruction ? currentInstruction.shortText : 'Suivre la route'}
            </Text>

            {/* Progress bar (full-width thin) */}
            <View style={styles.newProgressBarBackground}>
              <View style={[styles.newProgressBarFill, { width: `${getNavigationProgress() * 100}%`}]} />
            </View>

            {/* Controls row: Steps and Stop */}
            <View style={styles.newControlRow}>
              <TouchableOpacity style={styles.controlButton} onPress={() => setShowStepsModal(true)} accessibilityLabel="Voir les étapes">
                <Ionicons name="list" size={20} color="#1A8D5B" />
                <Text style={styles.controlButtonText}>Étapes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.controlButton, styles.controlStopButton]} onPress={stopNavigation} accessibilityLabel="Arrêter la navigation">
                <Ionicons name="close" size={20} color="white" />
                <Text style={[styles.controlButtonText, { color: 'white' }]}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Search bar déroulante - Masquée pendant la navigation */}
        {!isNavigating && (
          <View style={styles.searchContainer}>
            <View style={styles.searchRow}>
              <TouchableOpacity
                style={[
                  styles.searchBarToggle,
                  isSearchExpanded && { backgroundColor: '#E8F5E8', borderColor: '#1A8D5B', borderWidth: 1 }
                ]}
                onPress={toggleSearchBar}
                activeOpacity={0.8}
              >
                <Ionicons name="search" size={22} color="#1A8D5B" style={{ marginRight: 8 }} />
                <Text
                  style={[
                    styles.searchBarText,
                    isSearchExpanded && { color: '#1A8D5B', fontWeight: 'bold' }
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Entrer une destination
                </Text>
                <Ionicons
                  name={isSearchExpanded ? "chevron-up" : "chevron-down"}
                  size={22}
                  color="#1A8D5B"
                  style={{
                    transform: [{ rotate: isSearchExpanded ? '180deg' : '0deg' }],
                    transition: 'transform 0.2s',
                  }}
                />
              </TouchableOpacity>
            </View>
            {/* Animation de transition fluide */}
            {isSearchExpanded && (
              <View style={{
                ...styles.expandedSearch,
                opacity: isSearchExpanded ? 1 : 0,
                transform: [{ scaleY: isSearchExpanded ? 1 : 0.95 }],
                transition: 'opacity 0.2s, transform 0.2s',
              }}>
                  {/* Inline inputs: Start and Destination */}
                  <View style={{ padding: 8 }}>
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>Départ</Text>
                      {!isStartEditing ? (
                        <TouchableOpacity
                          style={[styles.searchInput, { marginBottom: 6, flexDirection: 'row', alignItems: 'center' }]}
                          onPress={() => setIsStartEditing(true)}
                        >
                          <Ionicons name="person" size={18} color="#1A8D5B" style={{ marginRight: 8 }} />
                          <Text style={{ color: startQuery ? '#000' : '#666' }}>
                            {startQuery ? startQuery : (startPoint || userLocation ? 'Ma position' : 'Tapez pour définir')}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TextInput
                          style={[styles.searchInput, { marginBottom: 6 }]}
                          placeholder={startPoint ? 'Départ défini (tape pour modifier)' : 'Entrez le départ'}
                          value={startQuery}
                          onBlur={() => setIsStartEditing(false)}
                          onChangeText={(text) => {
                            setStartQuery(text);
                            // debounce
                            if (startTimerRef.current) clearTimeout(startTimerRef.current);
                            if (!text.trim()) {
                              setStartResults([]);
                              return;
                            }
                            startTimerRef.current = setTimeout(() => {
                              setIsStartSearching(true);
                              // reuse api-adresse
                              fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(text)}&limit=5&lat=44.837789&lon=-0.57918`)
                                .then(r => r.json())
                                .then(data => {
                                  if (data && data.features) {
                                    const results = data.features.map(f => ({
                                      id: f.properties.id,
                                      label: f.properties.label,
                                      coordinates: { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] }
                                    }));
                                    setStartResults(results);
                                  } else setStartResults([]);
                                })
                                .catch(e => { console.error('search start', e); setStartResults([]); })
                                .finally(() => setIsStartSearching(false));
                            }, 300);
                          }}
                        />
                      )}
                      {/* Start suggestions */}
                      {isStartSearching ? (
                        <ActivityIndicator size="small" color="#1A8D5B" />
                      ) : (
                        startResults.map(res => (
                          <TouchableOpacity key={res.id} style={styles.searchResultItem} onPress={() => {
                            // set as start
                            Keyboard.dismiss();
                            setStartPoint(res.coordinates);
                            setStartQuery(res.label);
                            setStartResults([]);
                            setIsStartEditing(false);
                            // if end exists, compute route
                            if (endPoint) getRoute(res.coordinates, endPoint);
                          }}>
                            <Ionicons name="location" size={18} color="#1A8D5B" />
                            <Text style={styles.searchResultText}>{res.label}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>

                    <View>
                      <Text style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>Destination</Text>
                      <TextInput
                        style={[styles.searchInput, { marginBottom: 6 }]}
                        placeholder={endPoint ? 'Destination définie (tape pour modifier)' : 'Entrez la destination'}
                        value={endQuery}
                        onChangeText={(text) => {
                          setEndQuery(text);
                          if (endTimerRef.current) clearTimeout(endTimerRef.current);
                          if (!text.trim()) { setEndResults([]); return; }
                          endTimerRef.current = setTimeout(() => {
                            setIsEndSearching(true);
                            fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(text)}&limit=5&lat=44.837789&lon=-0.57918`)
                              .then(r => r.json())
                              .then(data => {
                                if (data && data.features) {
                                  const results = data.features.map(f => ({
                                    id: f.properties.id,
                                    label: f.properties.label,
                                    coordinates: { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] }
                                  }));
                                  setEndResults(results);
                                } else setEndResults([]);
                              })
                              .catch(e => { console.error('search end', e); setEndResults([]); })
                              .finally(() => setIsEndSearching(false));
                          }, 300);
                        }}
                      />
                      {isEndSearching ? (
                        <ActivityIndicator size="small" color="#1A8D5B" />
                      ) : (
                        endResults.map(res => (
                          <TouchableOpacity key={res.id} style={styles.searchResultItem} onPress={() => {
                            // select destination
                            const dest = res.coordinates;
                            Keyboard.dismiss();
                            setEndPoint(dest);
                            setEndQuery(res.label);
                            setEndResults([]);
                            if (startPoint) {
                              getRoute(startPoint, dest);
                            } else if (userLocation) {
                              setStartPoint(userLocation);
                              getRoute(userLocation, dest);
                            }
                          }}>
                            <Ionicons name="location" size={18} color="#1A8D5B" />
                            <Text style={styles.searchResultText}>{res.label}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  </View>
              </View>
            )}
            {/* Route summary — visible si on a calculé un itinéraire et pas encore en navigation */}
            {routeInfo && !isNavigating && (
              <View style={styles.routeSummary}>
                <View style={styles.routeIconContainer}>
                  <Ionicons name="bicycle" size={20} color="#1A8D5B" />
                </View>
                <View style={styles.routeSummaryText}>
                  <Text style={styles.routeType}>Vélo — Itinéraire</Text>
                  <Text style={styles.routeMetrics}>{routeInfo.distance} km • {routeInfo.duration} min</Text>
                </View>
                <TouchableOpacity style={styles.routeRemoveButton} onPress={clearRoute} accessibilityLabel="Retirer l'itinéraire">
                  <Ionicons name="stop" size={16} color="white" />
                  <Text style={styles.routeRemoveText}>Arrêter</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

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
              style={[styles.simpleBubble, hasFilters && styles.simpleBubbleActive]}
              onPress={() => setShowFiltersModal(true)}
            >
              <Ionicons name="options" size={24} color="#1A8D5B" />
              {hasFilters && (
                <View style={styles.filterBadge} pointerEvents="none">
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1A8D5B" />
            <Text style={styles.loadingText}>Calcul de l'itinéraire...</Text>
          </View>
        )}
      </View>

      {/* Bottom control row: recenter, start, signalement - unified size and alignment */}
      <View style={styles.bottomControlsRow} pointerEvents="box-none">
        <TouchableOpacity style={styles.controlCircle} onPress={getUserLocation} accessibilityLabel="Recentrer la carte">
          <Ionicons name="locate" size={22} color="#1A8D5B" />
        </TouchableOpacity>

        {routeInfo && !isNavigating ? (
          <TouchableOpacity style={[styles.controlCircle, styles.controlCirclePrimary]} onPress={startNavigation} accessibilityLabel="Lancer la navigation">
            <Ionicons name="navigate" size={22} color="white" />
          </TouchableOpacity>
        ) : (
          <View style={styles.controlCirclePlaceholder} />
        )}

        <TouchableOpacity style={styles.controlCircle} onPress={() => setShowSignalModal(true)} accessibilityLabel="Signalement">
          <Ionicons name="warning" size={22} color="#FF5722" />
        </TouchableOpacity>
      </View>
      {/* floating stop removed - action moved into route summary */}

      {/* Modal de recherche */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSearchModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSearchModal(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
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
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
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
        <TouchableWithoutFeedback onPress={() => setShowFiltersModal(false)}>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <TouchableWithoutFeedback onPress={() => {}}>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal de signalement */}
      <Modal
        visible={showSignalModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSignalModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSignalModal(false)}>
          <View style={styles.signalModalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>{/* prevent inner taps from closing */}
              <View style={styles.signalModalContent}>
                <View style={styles.modalHandle} />
                {/* no title or close button — tapping outside will dismiss */}
                <ScrollView style={styles.signalTypesContainer}>
              {Object.values(SIGNAL_TYPES).map((signalType) => (
                <TouchableOpacity
                  key={signalType.id}
                  style={[styles.signalTypeButton, { backgroundColor: signalType.backgroundColor }]}
                  onPress={() => {
                    // Send report immediately from current user location
                    setShowSignalModal(false);
                    if (!userLocation) {
                      showTransientMessage('Position introuvable');
                      return;
                    }
                    sendSignalement(signalType, userLocation.latitude, userLocation.longitude);
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal des étapes (itinéraire) */}
      <Modal
        visible={showStepsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowStepsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowStepsModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={{ backgroundColor: 'white', width: '86%', maxHeight: height * 0.7, borderRadius: 14, padding: 16 }}>
                <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 12 }}>Étapes</Text>
                <ScrollView>
                  {navigationInstructions.map(inst => (
                    <View key={inst.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name={inst.icon || 'navigate'} size={18} color="#1A8D5B" style={{ width: 26 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: inst.id === getCurrentInstructionIndex() ? '700' : '400' }}>{inst.shortText}</Text>
                        {/* show full instruction in smaller text */}
                        <Text style={{ color: '#666', fontSize: 12 }}>{inst.full}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity style={{ marginTop: 12, alignSelf: 'flex-end' }} onPress={() => setShowStepsModal(false)}>
                  <Text style={{ color: '#1A8D5B', fontWeight: '700' }}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>


      {/* Toast notification for transient messages */}
      {showToast && (
        <View style={styles.toastContainer} pointerEvents="none">
          <View style={styles.toastBox}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
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
  // logoRow and logoImage removed per user request
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  // Header compact pendant la navigation
  compactHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  compactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: '#E6F4EA',
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 10,
    backgroundColor: '#0E7A43',
  },
  compactIconButton: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 12,
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  stopNavButtonLarge: {
    backgroundColor: '#E03636',
    padding: 10,
    borderRadius: 14,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  stopNavButtonTextLarge: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  navInstructionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navInstructionDistance: {
    color: '#1A8D5B',
    marginRight: 8,
    fontWeight: '900',
  },
  navInstructionText: {
    flex: 1,
    color: '#333',
    fontWeight: '600',
  },
  navInstructionRowLarge: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navInstructionLeft: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navInstructionRight: {
    flex: 1,
    paddingLeft: 8,
    paddingRight: 6,
  },
  navInstructionDistanceLarge: {
    color: 'white',
    backgroundColor: '#1A8D5B',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    fontWeight: '900',
    fontSize: 18,
  },
  navInstructionTextLarge: {
    color: '#222',
    fontWeight: '800',
    fontSize: 18,
  },
  // New experimental navigation layout
  newNavContainer: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
  },
  instructionBubbleWrapper: {
    position: 'relative',
    marginBottom: 8,
    alignItems: 'center',
  },
  instructionBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A8D5B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  distanceBadge: {
    position: 'absolute',
    right: -10,
    bottom: -8,
    backgroundColor: '#E03636',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newInstructionText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#222',
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: '82%',
  },
  newProgressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 10,
  },
  newProgressBarFill: {
    height: 6,
    backgroundColor: '#1A8D5B',
  },
  newControlRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  controlButtonText: {
    marginLeft: 8,
    color: '#1A8D5B',
    fontWeight: '700',
  },
  controlStopButton: {
    backgroundColor: '#E03636',
    borderColor: '#E03636',
  },
  compactRouteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactRouteText: {
    fontSize: 16,
    color: '#1A8D5B',
    fontWeight: '600',
    flex: 1,
  },
  routeInfo: {
    marginTop: 10,
    padding: 14,
    backgroundColor: '#E8F5E8',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1A8D5B',
  },
  routeText: {
    fontSize: 17,
    textAlign: 'center',
    color: '#1A8D5B',
    fontWeight: '600',
  },
  startNavButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 12,
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
    borderRadius: 10,
    marginLeft: 10,
  },
  stopNavButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
  },
  instructions: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionText: {
    fontSize: 15,
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
    paddingHorizontal: 10,
    borderRadius: 14,
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
    marginLeft: 12,
    fontSize: 17,
    color: '#666',
    minWidth: 0,
  },
  expandedSearch: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    marginTop: 6,
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchOptionActive: {
    backgroundColor: 'rgba(26, 141, 91, 0.05)',
  },
  searchOptionText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#666',
  },
  searchOptionTextActive: {
    color: '#1A8D5B',
    fontWeight: '600',
  },
  simpleBubbles: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  simpleBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 14,
    borderRadius: 46,
    marginHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 64,
    height: 64,
    position: 'relative',
  },
  simpleBubbleActive: {
    // Only show a stroke when a saved place exists — keep white background and show green stroke
    backgroundColor: 'white',
    borderColor: '#1A8D5B',
    borderWidth: 2,
  },
  locationBubble: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 14,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 64,
    height: 64,
    zIndex: 1000,
  },
  resetBubble: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 40,
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
  bottomControlsRow: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    zIndex: 1200,
    paddingHorizontal: 20,
  },
  controlCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
  },
  controlCirclePrimary: {
    backgroundColor: '#1A8D5B',
    borderColor: '#1A8D5B',
  },
  controlCirclePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'transparent',
  },
  startJourneyButtonBottom: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    width: '62%',
    maxWidth: 340,
    backgroundColor: '#1A8D5B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 1000,
  },
  startJourneyText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  routeRemoveButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  routeRemoveText: {
    color: 'white',
    fontWeight: '700',
    marginLeft: 6,
    fontSize: 13,
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
    marginLeft: 14,
    fontWeight: '500',
  },
  loading: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 16,
    borderRadius: 14,
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
    borderRadius: 16,
    padding: 6,
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
    borderRadius: 16,
    padding: 6,
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
    minHeight: height * 0.35,
    maxHeight: height * 0.65,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A8D5B',
  },
  searchInput: {
    margin: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: '#F5F5F5',
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 18,
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
    padding: 12,
    marginHorizontal: 18,
    marginBottom: 8,
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
  },
  searchResultText: {
    marginLeft: 12,
    fontSize: 15,
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

  // Route summary compact
  routeSummary: {
    marginTop: 12,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  routeIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#E8F5E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  routeSummaryText: {
    flex: 1,
  },
  routeType: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  routeMetrics: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  routeActionButton: {
    backgroundColor: '#1A8D5B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  routeActionText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  // removed routeCloseButton (replaced by routeRemoveButton)

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
    padding: 6,
    borderRadius: 10,
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
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signalModalContent: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 28,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: height * 0.75,
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
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FF5722',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 4,
  },
  filterBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },
  signalInstructions: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    paddingBottom: 10,
    fontStyle: 'italic',
  },
  toastContainer: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 2000,
    pointerEvents: 'none',
    transform: [{ translateY: -28 }],
  },
  toastBox: {
    backgroundColor: 'rgba(26,141,91,0.92)', // green close to the app palette, slightly transparent
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
    opacity: 0.95,
  },
  toastText: {
    color: 'white',
    fontWeight: '700',
  },
});

export default MapEnhanced;