// Station Le Vélo en temps réel
// /api/vcub

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

// Configuration - Utilisez votre vraie clé API
const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des stations VCub
router.get('/', async (req, res) => {
  try {

    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:CI_VCUB_P`;
    
    console.log('URL appelée:', wfsUrl);
    
    const response = await axios.get(wfsUrl, {
      headers: {
        'Accept': 'application/xml',
        'User-Agent': 'SmartCity-API/1.0'
      },
      timeout: 15000,
      responseType: 'arraybuffer'
    });

    const xmlData = Buffer.from(response.data).toString('utf8');
    console.log('Réponse reçue, taille:', xmlData.length);

    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });

    const result = await parser.parseStringPromise(xmlData);
    
    console.log('Structure parsée:', Object.keys(result));
    if (result['wfs:FeatureCollection']) {
      console.log('FeatureCollection keys:', Object.keys(result['wfs:FeatureCollection']));
    }
    
    let stations = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      console.log('Nombre de features:', features.length);

      stations = features.map(feature => {
        const station = feature['bm:CI_VCUB_P'] || {};
   
        let coordonnees = { longitude: null, latitude: null };
        if (station['bm:geometry'] && station['bm:geometry']['gml:Point']) {
          const pos = station['bm:geometry']['gml:Point']['gml:pos'];
          if (pos) {
            const coords = pos.split(' ');
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
          identifiant: parseInt(station['bm:IDENT']) || null,
          nom: station['bm:NOM'] || null,
          etat: station['bm:ETAT'] || null,
          type: station['bm:TYPE'] || null,
          nbplaces: parseInt(station['bm:NBPLACES']) || 0,
          nbvelos: parseInt(station['bm:NBVELOS']) || 0,
          nbelec: parseInt(station['bm:NBELEC']) || 0,
          nbclassique: parseInt(station['bm:NBCLASSIQ']) || 0,
          insee: station['bm:INSEE'] || null,
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

    console.log(`${stations.length} stations VCub récupérées avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des données VCub:', error.message);

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