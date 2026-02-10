const express = require('express');
const cors = require('cors');
const config = require('./config/environment');
const certificateRoutes = require('./routes/certificates.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        service: 'Certificate Checking API',
        version: '6.0.0 (Refactored)',
        status: 'online',
        message: 'Config-driven architecture'
    });
});

app.use('/', certificateRoutes);

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({
        erro: 'Erro interno do servidor'
    });
});

const PORT = config.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`  API rodando na porta ${PORT}`);
    console.log(`  Version: 6.0.0 (Refactored)`);
    console.log(`===========================================`);
});

module.exports = app;
