require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Documentation Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SmartCity API Documentation'
}));

// Route basique
app.get('/', (req, res) => {
  res.send(`
    <h1>Smart City API</h1>
    <p>Documentation: <a href="http://10.134.200.135:3000/api-docs">http://10.134.200.135:3000/api-docs</a></p>
  `);
});

// Import des routes
const ci_vcub_p = require('./routes/ci_vcub_p');
const fv_trvel_l = require('./routes/fv_trvel_l');
const pc_captv_p = require('./routes/pc_captv_p');
const st_arceau_p = require('./routes/st_arceau_p');
const st_freefloating_s = require('./routes/st_freefloating_s');
const st_service_velo_p = require('./routes/st_service_velo_p');
const st_stationnement_velo_p = require('./routes/st_stationnement_velo_p');
const signalements = require('./db_routes/signalements');

// Configuration des routes
app.use('/api/vcub', ci_vcub_p);
app.use('/api/pistes', fv_trvel_l);
app.use('/api/trafic', pc_captv_p);
app.use('/api/arceaux', st_arceau_p);
app.use('/api/freefloating', st_freefloating_s);
app.use('/api/services', st_service_velo_p);
app.use('/api/stationnement', st_stationnement_velo_p);
app.use('/api/signalements', signalements);

// Route de ping
app.get('/ping', (req, res) => {
  res.send('pong');
});

module.exports = app;