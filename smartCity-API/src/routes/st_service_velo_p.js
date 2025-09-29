// Services vélo Bordeaux Métropole
// /api/services

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des services vélo
router.get('/', async (req, res) => {
  try {

    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:ST_SERVICE_VELO_P`;

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

    let services = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      services = features.map(feature => {
        const service = feature['bm:ST_SERVICE_VELO_P'] || {};

        let coordonnees = { longitude: null, latitude: null };
        if (service['bm:geometry'] && service['bm:geometry']['gml:Point']) {
          let pos = service['bm:geometry']['gml:Point']['gml:pos'];

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

        let mobilier = [];
        if (service['bm:MOBILIER']) {
          mobilier = service['bm:MOBILIER'].split('\n').filter(item => item.trim() !== '');
        }

        return {
          id: parseInt(service['bm:GID']) || null,
          proprietaire: service['bm:PROPRIETAIRE'] || null,
          localisation: service['bm:LOCALISATION'] || null,
          insee: service['bm:INSEE'] || null,
          gestionnaire: service['bm:GESTIONNAIRE'] || null,
          mobilier: mobilier,
          coordonnees: coordonnees,
          date_creation: service['bm:CDATE'] || null,
          derniere_maj: service['bm:MDATE'] || null
        };
      });
    }

    res.json({
      success: true,
      count: services.length,
      timestamp: new Date().toISOString(),
      data: services
    });

    console.log(`${services.length} services vélo récupérés avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des services vélo:', error.message);

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