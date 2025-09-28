import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Dimensions, StatusBar } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { loadFilters } from '../utils/filters';

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
  const mapRef = useRef(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [filters, setFilters] = useState({});
  const [arceaux, setArceaux] = useState([]);
  const [arceauxLoading, setArceauxLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState(BORDEAUX_REGION);
  const fetchTimer = useRef(null);
  const router = useRouter();

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

  // Fetch arceaux dataset from Bordeaux Metropole Open Data
  const fetchArceaux = async (bbox) => {
    setArceauxLoading(true);
    try {
      // Try local API hosts in order. The local API exports /api/arceaux which
      // returns { success, count, timestamp, data: [...] } where each item has
      // coordonnees: { latitude, longitude }
      const hosts = [
        'http://10.0.2.2:3000', // Android emulator
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ];
      let json = null;
      let lastErr = null;
      for (const h of hosts) {
        try {
          // If bbox is provided, send it as a query param: minLon,minLat,maxLon,maxLat
          const url = bbox ? `${h}/api/arceaux?bbox=${bbox.join(',')}` : `${h}/api/arceaux`;
          const res = await fetch(url);
          if (!res.ok) {
            const txt = await res.text().catch(() => '<no body>');
            console.warn('fetchArceaux non-ok', url, res.status, txt);
            lastErr = new Error(`Status ${res.status} from ${url}`);
            continue;
          }
          json = await res.json();
          break;
        } catch (e) {
          console.warn('fetchArceaux host error', h, e.message || e);
          lastErr = e;
        }
      }
      if (!json) throw lastErr || new Error('Impossible de contacter l\'API locale');

      // Local API returns { success: true, data: [ { coordonnees: { latitude, longitude }, ... } ] }
      const items = (json.data || []).map((r) => {
        const coords = r.coordonnees || r.coordonnees || {};
        if (!coords || coords.latitude == null || coords.longitude == null) return null;
        return {
          id: r.id || `${coords.longitude}_${coords.latitude}`,
          latitude: coords.latitude,
          longitude: coords.longitude,
          typologie: r.typologie || r.TYPOLOGIE || 'arceau',
          nombre: r.nombre || 0,
          raw: r,
        };
      }).filter(Boolean);
      setArceaux(items);
    } catch (e) {
      console.error('fetchArceaux error', e);
      Alert.alert('Erreur', "Impossible de charger les arceaux depuis l'API locale. Vérifie que le backend SmartCity-API est démarré et accessible.");
    } finally {
      setArceauxLoading(false);
    }
  };

  // Compute bbox [minLon, minLat, maxLon, maxLat] from a map region
  const regionToBbox = (region) => {
    const lat = region.latitude;
    const lon = region.longitude;
    const latDelta = region.latitudeDelta || 0.05;
    const lonDelta = region.longitudeDelta || 0.05;
    const minLat = lat - latDelta / 2;
    const maxLat = lat + latDelta / 2;
    const minLon = lon - lonDelta / 2;
    const maxLon = lon + lonDelta / 2;
    return [minLon, minLat, maxLon, maxLat];
  };

  // Debounced fetch triggered on region change. Avoids spamming the backend
  const onRegionChangeComplete = (region) => {
    setMapRegion(region);
    if (!filters || !filters.arceau) return;
    // debounce
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => {
      const bbox = regionToBbox(region);
      fetchArceaux(bbox);
    }, 600);
  };

  // Reload filters and dataset when the screen is focused so changes in the
  // FilterPage are reflected when the user returns.
  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const saved = await loadFilters();
          if (!mounted) return;
          setFilters(saved || {});
          if (saved && saved.arceau) {
            fetchArceaux();
          } else {
            setArceaux([]);
          }
        } catch (e) {
          console.warn('Erreur chargement filtres dans map', e);
        }
      })();
      return () => { mounted = false; };
    }, [])
  );

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
        onRegionChangeComplete={onRegionChangeComplete}
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

        {/* Arceaux markers (filtered) */}
        {arceaux.map((a) => (
          <Marker
            key={a.id}
            coordinate={{ latitude: a.latitude, longitude: a.longitude }}
            title={a.typologie || 'Arceau'}
            pinColor="#F06292"
          />
        ))}
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

        {/* Instructions minimized to reduce clutter while riding */}

        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Calcul de l'itinéraire...</Text>
          </View>
        )}

        {arceauxLoading && (
          <View style={[styles.loading, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
            <ActivityIndicator size="small" color="#F06292" />
            <Text style={styles.loadingText}>Chargement arceaux...</Text>
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
