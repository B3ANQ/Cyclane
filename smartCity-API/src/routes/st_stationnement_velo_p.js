// Stationnements vélo Bordeaux Métropole
// /api/stationnement

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

// Configuration
const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des stations de stationnement vélo
router.get('/', async (req, res) => {
  try {
    // Construction de l'URL WFS
    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:ST_STATION_VELO_P`;
    
    // Appel à l'API WFS
    const response = await axios.get(wfsUrl, {
      headers: {
        'Accept': 'application/xml',
        'User-Agent': 'SmartCity-API/1.0'
      },
      timeout: 15000 // 15 secondes de timeout
    });

    // Conversion XML vers JSON
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });

    const result = await parser.parseStringPromise(response.data);
    
    // Extraction et formatage des données
    let stations = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      stations = features.map(feature => {
        const station = feature['bm:ST_STATION_VELO_P'] || {};
        
        // Extraction des coordonnées depuis la géométrie Point
        let coordonnees = { longitude: null, latitude: null };
        if (station['bm:geometry'] && station['bm:geometry']['gml:Point']) {
          let pos = station['bm:geometry']['gml:Point']['gml:pos'];
          
          // Vérifier si pos est un objet avec une propriété _ (texte)
          if (typeof pos === 'object' && pos._) {
            pos = pos._;
          }
          
          if (pos && typeof pos === 'string') {
            const coords = pos.trim().split(/\s+/);
            if (coords.length === 2) {
              coordonnees = {
                x: parseFloat(coords[0]),
                y: parseFloat(coords[1]),
                longitude: parseFloat(coords[0]),
                latitude: parseFloat(coords[1])
              };
            }
          }
        }

        return {
          id: parseInt(station['bm:GID']) || null,
          abonnement: station['bm:ABONNEMENT'] || null,
          libelle: station['bm:LIBELLE'] || null,
          localisation: station['bm:LOCALISATION'] || null,
          insee: station['bm:INSEE'] || null,
          annee: parseInt(station['bm:ANNEE']) || null,
          gestionnaire: station['bm:GESTIONNAIRE'] || null,
          places: parseInt(station['bm:PLACES']) || 0,
          type: station['bm:TYPE'] || null,
          proprietaire: station['bm:PROPRIETAIRE'] || null,
          tarif: parseFloat(station['bm:TARIF']) || null,
          coordonnees: coordonnees,
          date_creation: station['bm:CDATE'] || null,
          derniere_maj: station['bm:MDATE'] || null
        };
      });
    }

    res.json({
      success: true,
      count: stations.length,
      timestamp: new Date().toISOString(),
      data: stations
    });

    // Log du nombre de stations récupérées
    console.log(`${stations.length} stations de stationnement vélo récupérées avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des stations de stationnement vélo:', error.message);
    
    // Log plus détaillé pour le debug
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Data:', error.response.data);
    }
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des données',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;