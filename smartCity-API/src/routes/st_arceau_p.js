// Stationnements vélo Bordeaux Métropole
// /api/arceaux

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des arceaux vélo
router.get('/', async (req, res) => {
  try {
    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:ST_ARCEAU_P`;

    const response = await axios.get(wfsUrl, {
      headers: {
        'Accept': 'application/xml',
        'User-Agent': 'SmartCity-API/1.0'
      },
      timeout: 15000
    });

    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });

    const result = await parser.parseStringPromise(response.data);
    
    let arceaux = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      arceaux = features.map(feature => {
        const arceau = feature['bm:ST_ARCEAU_P'] || {};

        let coordonnees = { longitude: null, latitude: null };
        if (arceau['bm:geometry'] && arceau['bm:geometry']['gml:Point']) {
          let pos = arceau['bm:geometry']['gml:Point']['gml:pos'];

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

    res.json({
      success: true,
      count: arceaux.length,
      timestamp: new Date().toISOString(),
      data: arceaux
    });

    console.log(`${arceaux.length} arceaux vélo récupérés avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des arceaux vélo:', error.message);

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