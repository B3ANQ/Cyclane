// Capteur de trafic vélo
// /api/trafic

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des capteurs de trafic vélo
router.get('/', async (req, res) => {
  try {
    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:PC_CAPTV_P`;

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
    
    let capteurs = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      capteurs = features.map(feature => {
        const capteur = feature['bm:PC_CAPTV_P'] || {};

        let coordonnees = { longitude: null, latitude: null };
        if (capteur['bm:geometry'] && capteur['bm:geometry']['gml:Point']) {
          let pos = capteur['bm:geometry']['gml:Point']['gml:pos'];

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
          id: parseInt(capteur['bm:GID']) || null,
          libelle: capteur['bm:LIBELLE'] || null,
          identifiant: capteur['bm:IDENT'] || null,
          type: capteur['bm:TYPE'] || null,
          zone: parseInt(capteur['bm:ZONE']) || null,
          comptage_5m: capteur['bm:COMPTAGE_5M'] || null,
          coordonnees: coordonnees,
          date_creation: capteur['bm:CDATE'] || null,
          derniere_maj: capteur['bm:MDATE'] || null
        };
      });
    }

    res.json({
      success: true,
      count: capteurs.length,
      timestamp: new Date().toISOString(),
      data: capteurs
    });

    console.log(`${capteurs.length} capteurs de trafic vélo récupérés avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des capteurs de trafic vélo:', error.message);

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