const { createClient } = require('@supabase/supabase-js');
const config = require('./environment');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

module.exports = supabase;
