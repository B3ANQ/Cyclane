const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');

router.post('/send-monthly-report', reportController.sendMonthlyReport);

module.exports = router;