const supabase = require('../config/database');

class DatabaseService {
    async saveCertificate(data) {
        const { error } = await supabase.from('certidoes_emitidas').insert([{
            batch_id: data.batch_id,
            user_id: data.user_id,
            origem: data.origem,
            documento_pesquisado: data.documento_pesquisado,
            nome_pesquisado: data.nome_pesquisado,
            resposta_completa_api: data.resposta_completa_api,
            url_arquivo: data.url_arquivo,
            url_origem: data.url_origem,
            status_resumido: data.status_resumido
        }]);

        if (error) {
            console.error('[DatabaseService] Error saving certificate:', error);
            throw error;
        }

        return { success: true };
    }

    async saveError(data) {
        const { error } = await supabase.from('certidoes_emitidas').insert([{
            batch_id: data.batch_id,
            user_id: data.user_id,
            origem: data.origem,
            documento_pesquisado: data.documento_pesquisado,
            status_resumido: 'ERRO',
            resposta_completa_api: { erro: data.error_message }
        }]);

        if (error) {
            console.error('[DatabaseService] Error saving error record:', error);
        }

        return { success: !error };
    }

    async getBatchById(batchId) {
        const { data, error } = await supabase
            .from('certidoes_emitidas')
            .select('*')
            .eq('batch_id', batchId);

        if (error) {
            console.error('[DatabaseService] Error fetching batch:', error);
            throw error;
        }

        return data;
    }
}

module.exports = new DatabaseService();
