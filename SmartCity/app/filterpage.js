import React from 'react';
import { Stack } from 'expo-router';
import FilterPage from '../components/filterpage';

export default function FilterRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FilterPage />
    </>
  );
}
