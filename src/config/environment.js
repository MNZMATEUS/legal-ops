require('dotenv').config();

const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'INFOSIMPLES_TOKEN'
];

function validateEnvironment() {
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}\n` +
            'Please check your .env file or environment configuration.'
        );
    }
}

validateEnvironment();

module.exports = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    INFOSIMPLES_TOKEN: process.env.INFOSIMPLES_TOKEN,
    PORT: process.env.PORT || 3000,
    USE_LEGACY: process.env.USE_LEGACY === 'true'
};
