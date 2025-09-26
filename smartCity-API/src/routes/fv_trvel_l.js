// Aménagement cyclable

const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();

// Configuration
const API_KEY = process.env.BORDEAUX_API_KEY;
const WFS_BASE_URL = 'https://data.bordeaux-metropole.fr/wfs';

// GET - Récupérer les données des aménagements cyclables
router.get('/', async (req, res) => {
  try {
    // Construction de l'URL WFS
    const wfsUrl = `${WFS_BASE_URL}?key=${API_KEY}&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:FV_TRVEL_L`;
    
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
    let amenagements = [];
    
    if (result && result['wfs:FeatureCollection'] && result['wfs:FeatureCollection']['gml:featureMember']) {
      const features = Array.isArray(result['wfs:FeatureCollection']['gml:featureMember']) 
        ? result['wfs:FeatureCollection']['gml:featureMember']
        : [result['wfs:FeatureCollection']['gml:featureMember']];

      amenagements = features.map(feature => {
        const amenagement = feature['bm:FV_TRVEL_L'] || {};
        
        // Extraction de la géométrie LineString
        let geometrie = null;
        if (amenagement['bm:geometry'] && amenagement['bm:geometry']['gml:LineString']) {
          const lineString = amenagement['bm:geometry']['gml:LineString'];
          let posList = lineString['gml:posList'];
          
          // Vérifier si posList est un objet avec une propriété _ (texte)
          if (typeof posList === 'object' && posList._) {
            posList = posList._;
          }
          
          if (posList && typeof posList === 'string') {
            const coords = posList.trim().split(/\s+/);
            const points = [];
            for (let i = 0; i < coords.length; i += 2) {
              if (coords[i] && coords[i + 1]) {
                points.push({
                  x: parseFloat(coords[i]),
                  y: parseFloat(coords[i + 1])
                });
              }
            }
            geometrie = {
              type: 'LineString',
              coordinates: points
            };
          }
        }

        return {
          id: parseInt(amenagement['bm:GID']) || null,
          type_amenagement: amenagement['bm:TYPAMENA'] || null,
          annee: parseInt(amenagement['bm:ANNEE']) || null,
          rg_fv_graph_nd: parseInt(amenagement['bm:RG_FV_GRAPH_ND']) || null,
          rg_fv_graph_na: parseInt(amenagement['bm:RG_FV_GRAPH_NA']) || null,
          rg_fv_graph_dbl: parseInt(amenagement['bm:RG_FV_GRAPH_DBL']) || null,
          rg_fv_graph_cd: amenagement['bm:RG_FV_GRAPH_CD'] || null,
          rg_fv_graph_ca: amenagement['bm:RG_FV_GRAPH_CA'] || null,
          geometrie: geometrie,
          date_creation: amenagement['bm:CDATE'] || null,
          derniere_maj: amenagement['bm:MDATE'] || null
        };
      });
    }

    res.json({
      success: true,
      count: amenagements.length,
      timestamp: new Date().toISOString(),
      data: amenagements
    });

    // Log du nombre d'aménagements récupérés
    console.log(`${amenagements.length} aménagements cyclables récupérés avec succès`);

  } catch (error) {
    console.error('Erreur lors de la récupération des aménagements cyclables:', error.message);
    
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