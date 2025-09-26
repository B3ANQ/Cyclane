/**
 * Reusable filter storage helpers
 *
 * This module centralizes the filter defaults and AsyncStorage access so you can
 * import these utilities from anywhere in the app to read or write the user's
 * filter choices.
 *
 * Usage examples:
 *  import { DEFAULT_FILTERS, loadFilters, saveFilters } from '../utils/filters'
 *
 *  // read persisted filters (returns null if nothing saved)
 *  const saved = await loadFilters()
 *
 *  // persist filters
 *  await saveFilters({ stationnement: true, ... })
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FiltersState = {
  [key: string]: boolean;
};

// Key used in AsyncStorage. Bump the suffix if you change the shape and want
// a fresh storage key (v2, v3, ...).
export const STORAGE_KEY = '@smartcity_filters_v1';

// Canonical defaults for all filters. Reuse this constant when initializing
// local state elsewhere so behaviour matches the FilterPage.
export const DEFAULT_FILTERS: FiltersState = {
  stationnement: true,
  reparation: true,
  pompe: true,
  abris: true,
  arceau: true,
  leVeloTBM: true,
  freefloatingZone: true,
};

/**
 * Load persisted filters from AsyncStorage.
 * Returns the parsed FiltersState or null if nothing is saved.
 */
export async function loadFilters(): Promise<FiltersState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FiltersState;
  } catch (e) {
    console.warn('loadFilters error', e);
    return null;
  }
}

/**
 * Save filters to AsyncStorage. Swallow errors but log to console so they can
 * be debugged during development.
 */
export async function saveFilters(filters: FiltersState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (e) {
    console.warn('saveFilters error', e);
  }
}
