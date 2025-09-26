const express = require('express');
const { getAllFreefloatingZones } = require('../controllers/freefloating.controller');

const router = express.Router();

// Route par défaut
router.get('/', getAllFreefloatingZones);

// Route pour récupérer toutes les zones (compatibilité)
router.get('/zones', getAllFreefloatingZones);

module.exports = router;