import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TestsLoan from './tests_loan'; // <-- Ajout de l'import

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <TestsLoan /> {/* Utilisation du composant */}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
