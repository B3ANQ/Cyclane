const express = require('express');
const router = express.Router();

// On stocke les signalements dans une simple variable en mémoire
let mockSignalements = [];

// GET - Récupérer tous les signalements
router.get('/', (req, res) => {
  res.json({
    success: true,
    count: mockSignalements.length,
    total: mockSignalements.length,
    timestamp: new Date().toISOString(),
    data: mockSignalements
  });
});

// POST - Créer un nouveau signalement
router.post('/', (req, res) => {
  const { type, latitude, longitude, status } = req.body;
  
  const nouveauSignalement = {
    id: Math.random().toString(36).substr(2, 9),
    type: type,
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    status: status || 'actif',
    timestamp: new Date().toISOString()
  };
  
  mockSignalements.push(nouveauSignalement);
  
  res.status(201).json({
    success: true,
    message: 'Signalement créé avec succès (Mode Mock)',
    data: nouveauSignalement
  });
});

module.exports = router;