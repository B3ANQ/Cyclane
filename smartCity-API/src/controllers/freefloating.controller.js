const axios = require('axios');

const getAllFreefloatingZones = async (req, res) => {
  try {
    const baseUrl = 'https://datahub.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/st_freefloating_s/records';
    const pageSize = 100;
    let offset = 0;
    let allZones = [];
    let totalCount = null;

    while (true) {
      const url = `${baseUrl}?limit=${pageSize}&offset=${offset}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'SmartCity-API/1.0'
        },
        timeout: 15000
      });
      
      const data = response.data;
      
      if (totalCount === null) {
        totalCount = data.total_count;
        console.log(`📍 Total zones à récupérer: ${totalCount}`);
      }
      
      allZones = [...allZones, ...data.results];
      
      if (allZones.length >= totalCount) break;
      
      offset += pageSize;
    }

    res.json({
      success: true,
      totalCount: allZones.length,
      timestamp: new Date().toISOString(),
      zones: allZones
    });

    console.log(`${allZones.length} zones freefloating récupérées avec succès`);

  } catch (error) {
    console.error('Erreur récupération freefloating:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
    }
    
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des zones',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getAllFreefloatingZones
};