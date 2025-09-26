import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, TouchableOpacity, ScrollView, Platform, PanResponder, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { loadFilters, saveFilters as persistFilters, DEFAULT_FILTERS, FiltersState } from '../utils/filters';

// FiltersState and DEFAULT_FILTERS are imported from utils/filters. That makes
// the canonical filter shape available across the app. Import DEFAULT_FILTERS
// to initialize state elsewhere and use loadFilters/persistFilters to read or
// write the persistent storage.

const FilterPage: React.FC = () => {
  const router = useRouter();
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
        const pageX = (evt && evt.nativeEvent && evt.nativeEvent.pageX) || 0;
        const width = Dimensions.get('window').width;
        // only start when swipe begins near left or right edge to avoid blocking scroll
        const edgeThreshold = 40;
        const edgeSwipe = pageX < edgeThreshold || pageX > width - edgeThreshold;
        return isHorizontal && edgeSwipe;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // swipe horizontally with enough distance and speed
        if (gestureState.dx > 100 && Math.abs(gestureState.vx) > 0.2) {
          router.back();
        } else if (gestureState.dx < -100 && Math.abs(gestureState.vx) > 0.2) {
          router.back();
        }
      },
    })
  ).current;

  useEffect(() => {
    // Load persisted filters on mount. If nothing is saved, keep DEFAULT_FILTERS.
    (async () => {
      try {
        const saved = await loadFilters();
        if (saved) setFilters((prev) => ({ ...prev, ...saved }));
      } catch (e) {
        console.warn('Erreur lecture filtres', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist filters using the shared helper so other modules can rely on the
  // same storage location and behavior.
  const saveFilters = async (next: FiltersState) => {
    await persistFilters(next);
  };

  const toggleFilter = (key: string) => {
    // Toggle locally and persist immediately so other parts of the app can
    // read the updated value.
    const next = { ...filters, [key]: !filters[key] };
    setFilters(next);
    saveFilters(next);
  };

  const ToggleRow: React.FC<{ label: string; value: boolean; onToggle: () => void }> = ({ label, value, onToggle }) => {
    return (
      <View style={[styles.card, !value && styles.cardInactive]}>
        <View style={[styles.leftAccent, value ? styles.leftActive : styles.leftInactive]} />
        <Text style={styles.cardLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: '#FDEDFD', true: '#1A8D5B' }}
          thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : '#FFFFFF') : undefined}
          ios_backgroundColor="#FAFDF3"
        />
      </View>
    );
  };

  

  return (
    <View style={styles.screen} {...panResponder.panHandlers}>
  <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">

  <Text style={styles.title}>Filtres</Text>

  <ToggleRow label="Station vélo stationnement" value={!!filters.stationnement} onToggle={() => toggleFilter('stationnement')} />
      <ToggleRow label="Station vélo réparation" value={!!filters.reparation} onToggle={() => toggleFilter('reparation')} />
      <ToggleRow label="Station pompe" value={!!filters.pompe} onToggle={() => toggleFilter('pompe')} />
      <ToggleRow label="Abris vélo" value={!!filters.abris} onToggle={() => toggleFilter('abris')} />
      <ToggleRow label="Arceux à vélo" value={!!filters.arceau} onToggle={() => toggleFilter('arceau')} />
      <ToggleRow label="Station Le Velo TBM" value={!!filters.leVeloTBM} onToggle={() => toggleFilter('leVeloTBM')} />
      <ToggleRow label="Zone freefloating (stationnement)" value={!!filters.freefloatingZone} onToggle={() => toggleFilter('freefloatingZone')} />

      <TouchableOpacity
        style={styles.resetButton}
        onPress={async () => {
          setFilters(DEFAULT_FILTERS);
          await saveFilters(DEFAULT_FILTERS);
        }}
      >
        <Text style={styles.resetText}>Réinitialiser les filtres</Text>
      </TouchableOpacity>
      </ScrollView>

      <View style={styles.bottomBar} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.saveButton}
          onPress={async () => {
            await saveFilters(filters);
            router.back();
          }}
        >
          <Text style={styles.saveText}>Sauvegarder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FAFDF3' },
  contentContainer: { paddingTop: 20, paddingBottom: 240 },
  listContainer: { maxHeight: 300 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 20, color: '#1A8D5B' },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 18, borderWidth: 1, borderColor: '#FDEDFD', shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 3 },
  cardInactive: { backgroundColor: '#FFF7F7' },
  cardLabel: { fontSize: 17, flex: 1, marginRight: 14, color: '#222' },
  leftAccent: { width: 6, height: '100%', borderRadius: 6, marginRight: 12 },
  leftActive: { backgroundColor: '#1A8D5B' },
  leftInactive: { backgroundColor: '#FDEDFD' },
  previewTitle: { marginTop: 18, fontWeight: '600', marginBottom: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f2f2f2' },
  itemText: { fontSize: 16 },
  itemSub: { fontSize: 16 },
  empty: { padding: 20, alignItems: 'center' },
  resetButton: { marginTop: 20, backgroundColor: '#FEF7C2', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FDEDFD', width: '90%', alignSelf: 'center' },
  resetText: { color: '#1A8D5B', fontWeight: '800' },
  screen: { flex: 1, backgroundColor: '#FAFDF3' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' },
  saveButton: { width: '94%', backgroundColor: '#1A8D5B', padding: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 10, elevation: 6 },
  saveText: { color: '#fff', fontWeight: '800' },
});

export default FilterPage;
