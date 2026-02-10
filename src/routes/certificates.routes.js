const express = require('express');
const router = express.Router();
const certificateService = require('../services/certificate.service');

router.post('/consultar-lote', async (req, res) => {
    try {
        const result = await certificateService.processBatch(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error in /consultar-lote:', error.message);
        res.status(400).json({
            erro: error.message || 'Erro ao processar consulta'
        });
    }
});

module.exports = router;
