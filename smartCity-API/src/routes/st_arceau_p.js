// Stationnements vélo Bordeaux Métropole
// /api/arceaux

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

// Configuration
const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des arceaux vélo
router.get('/', async (req, res) => {
  try {
    // Construction de l'URL WFS
    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:ST_ARCEAU_P`;
    
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
    let arceaux = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      arceaux = features.map(feature => {
        const arceau = feature['bm:ST_ARCEAU_P'] || {};
        
        // Extraction des coordonnées depuis la géométrie Point
        let coordonnees = { longitude: null, latitude: null };
        if (arceau['bm:geometry'] && arceau['bm:geometry']['gml:Point']) {
          let pos = arceau['bm:geometry']['gml:Point']['gml:pos'];
          
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
          id: parseInt(arceau['bm:GID']) || null,
          typologie: arceau['bm:TYPOLOGIE'] || null,
          nombre: parseInt(arceau['bm:NOMBRE']) || 0,
          insee: arceau['bm:INSEE'] || null,
          coordonnees: coordonnees,
          date_creation: arceau['bm:CDATE'] || null,
          derniere_maj: arceau['bm:MDATE'] || null
        };
      });
    }

    // If a bbox query parameter is provided (minLon,minLat,maxLon,maxLat),
    // filter the arceaux to return only those inside the bbox.
    const bboxParam = req.query && req.query.bbox;
    let filtered = arceaux;
    if (bboxParam) {
      const parts = bboxParam.split(',').map(p => parseFloat(p));
      if (parts.length === 4 && parts.every(p => !Number.isNaN(p))) {
        const [minLon, minLat, maxLon, maxLat] = parts;
        filtered = arceaux.filter(a => {
          const c = a.coordonnees || {};
          if (c.longitude == null || c.latitude == null) return false;
          return c.longitude >= minLon && c.longitude <= maxLon && c.latitude >= minLat && c.latitude <= maxLat;
        });
      }
    }

    res.json({
      success: true,
      count: filtered.length,
      timestamp: new Date().toISOString(),
      data: filtered
    });

    // Log du nombre d'arceaux récupérés
    console.log(`✅ ${arceaux.length} arceaux vélo récupérés avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des arceaux vélo:', error.message);
    
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