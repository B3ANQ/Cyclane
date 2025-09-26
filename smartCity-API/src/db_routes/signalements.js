const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// GET - Récupérer tous les signalements
router.get('/', async (req, res) => {
  try {
    const { status, type, limit, offset } = req.query;
    
    // Construction du filtre
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    
    // Paramètres de pagination
    const take = limit ? parseInt(limit) : undefined;
    const skip = offset ? parseInt(offset) : undefined;
    
    const signalements = await prisma.report.findMany({
      where,
      take,
      skip,
      orderBy: {
        timestamp: 'desc'
      }
    });
    
    // Compter le total pour la pagination
    const total = await prisma.report.count({ where });
    
    res.json({
      success: true,
      count: signalements.length,
      total: total,
      timestamp: new Date().toISOString(),
      data: signalements
    });
    
    console.log(`✅ ${signalements.length} signalements récupérés avec succès`);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des signalements:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des signalements',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Route de test de connexion (DOIT ÊTRE AVANT /:id)
router.get('/test-connection', async (req, res) => {
  try {
    await prisma.$connect();
    const count = await prisma.report.count();
    
    res.json({
      success: true,
      message: 'Connexion MongoDB réussie',
      database: '10.134.200.96:27017/velo', // Changé ici
      reportCount: count,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Connexion MongoDB testée avec succès');
    
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erreur de connexion à la base de données',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Récupérer les signalements dans une zone géographique (AVANT /:id aussi)
router.get('/zone/:lat/:lng/:radius', async (req, res) => {
  try {
    const { lat, lng, radius } = req.params;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusKm = parseFloat(radius) || 1; // 1km par défaut
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Coordonnées invalides',
        timestamp: new Date().toISOString()
      });
    }
    
    // Approximation simple pour calculer les limites (pour un calcul plus précis, 
    // il faudrait utiliser une fonction géospatiale plus avancée)
    const latDelta = radiusKm / 111; // 1 degré lat ≈ 111km
    const lngDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));
    
    const signalements = await prisma.report.findMany({
      where: {
        latitude: {
          gte: latitude - latDelta,
          lte: latitude + latDelta
        },
        longitude: {
          gte: longitude - lngDelta,
          lte: longitude + lngDelta
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });
    
    // Filtrer par distance exacte (optionnel, pour plus de précision)
    const signalementsFiltrés = signalements.filter(s => {
      const distance = Math.sqrt(
        Math.pow((s.latitude - latitude) * 111, 2) + 
        Math.pow((s.longitude - longitude) * 111 * Math.cos(latitude * Math.PI / 180), 2)
      );
      return distance <= radiusKm;
    });
    
    res.json({
      success: true,
      count: signalementsFiltrés.length,
      zone: { latitude, longitude, radius: radiusKm },
      timestamp: new Date().toISOString(),
      data: signalementsFiltrés
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération des signalements par zone:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des signalements par zone',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Récupérer un signalement par ID (APRÈS les routes spécifiques)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const signalement = await prisma.report.findUnique({
      where: { id }
    });
    
    if (!signalement) {
      return res.status(404).json({
        success: false,
        error: 'Signalement non trouvé',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: signalement
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération du signalement:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du signalement',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST - Créer un nouveau signalement (sans transaction)
router.post('/', async (req, res) => {
  try {
    const { type, latitude, longitude, status } = req.body;
    
    // Validation des données obligatoires
    if (!type || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes',
        message: 'Les champs type, latitude et longitude sont obligatoires',
        timestamp: new Date().toISOString()
      });
    }
    
    // Validation des coordonnées
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Coordonnées invalides',
        message: 'Latitude et longitude doivent être des nombres',
        timestamp: new Date().toISOString()
      });
    }
    
    // Vérification des limites géographiques (région Bordeaux)
    if (latitude < 44.0 || latitude > 45.5 || longitude < -1.5 || longitude > 0.5) {
      return res.status(400).json({
        success: false,
        error: 'Coordonnées hors zone',
        message: 'Les coordonnées doivent être dans la région de Bordeaux',
        timestamp: new Date().toISOString()
      });
    }
    
    // Créer le signalement directement
    const nouveauSignalement = await prisma.report.create({
      data: {
        type: type,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        status: status || 'actif'
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Signalement créé avec succès',
      timestamp: new Date().toISOString(),
      data: nouveauSignalement
    });
    
    console.log(`✅ Nouveau signalement créé: ${type} à [${latitude}, ${longitude}]`);
    
  } catch (error) {
    console.error('Erreur lors de la création du signalement:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du signalement',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// PUT - Mettre à jour un signalement
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, latitude, longitude, status } = req.body;
    
    // Vérifier que le signalement existe
    const signalementExistant = await prisma.report.findUnique({
      where: { id }
    });
    
    if (!signalementExistant) {
      return res.status(404).json({
        success: false,
        error: 'Signalement non trouvé',
        timestamp: new Date().toISOString()
      });
    }
    
    // Préparer les données à mettre à jour
    const dataToUpdate = {};
    if (type) dataToUpdate.type = type;
    if (latitude !== undefined) dataToUpdate.latitude = latitude;
    if (longitude !== undefined) dataToUpdate.longitude = longitude;
    if (status) dataToUpdate.status = status;
    
    const signalementMisAJour = await prisma.report.update({
      where: { id },
      data: dataToUpdate
    });
    
    res.json({
      success: true,
      message: 'Signalement mis à jour avec succès',
      timestamp: new Date().toISOString(),
      data: signalementMisAJour
    });
    
    console.log(`✅ Signalement ${id} mis à jour`);
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour du signalement:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du signalement',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DELETE - Supprimer un signalement
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier que le signalement existe
    const signalementExistant = await prisma.report.findUnique({
      where: { id }
    });
    
    if (!signalementExistant) {
      return res.status(404).json({
        success: false,
        error: 'Signalement non trouvé',
        timestamp: new Date().toISOString()
      });
    }
    
    await prisma.report.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Signalement supprimé avec succès',
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Signalement ${id} supprimé`);
    
  } catch (error) {
    console.error('Erreur lors de la suppression du signalement:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du signalement',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Fermer la connexion Prisma à l'arrêt du serveur
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = router;