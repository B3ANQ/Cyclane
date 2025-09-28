require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route basique
app.get('/', (req, res) => {
  res.json({ message: 'Smart City API' });
});

// Import des routes
const ci_vcub_p = require('./routes/ci_vcub_p');
const fv_trvel_l = require('./routes/fv_trvel_l');
const pc_captv_p = require('./routes/pc_captv_p');
const st_arceau_p = require('./routes/st_arceau_p');
const st_freefloating_s = require('./routes/st_freefloating_s');
const st_service_velo_p = require('./routes/st_service_velo_p');
const st_station_velo_p = require('./routes/st_station_velo_p');

// Configuration des routes
app.use('/api/vcub', ci_vcub_p);
app.use('/api/pistes', fv_trvel_l);
app.use('/api/trafic', pc_captv_p);
app.use('/api/arceaux', st_arceau_p);
app.use('/api/freefloating', st_freefloating_s);
app.use('/api/services', st_service_velo_p);
app.use('/api/stationnement', st_station_velo_p);

module.exports = app;