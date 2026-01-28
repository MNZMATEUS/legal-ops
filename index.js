const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÕES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TOKEN_API = process.env.INFOSIMPLES_TOKEN;

const FONTES_CONFIG = {
    'trt4': {
        url: 'https://api.infosimples.com/api/v2/consultas/tribunal/trt4/ceat',
        precisa_nome: false,
        aceita: ['CPF', 'CNPJ']
    },
    'policia_federal': {
        url: 'https://api.infosimples.com/api/v2/consultas/antecedentes-criminais/pf/emit',
        precisa_nome: true,
        aceita: ['CPF']
    },
    'receita_federal': {
        url: 'https://api.infosimples.com/api/v2/consultas/receita-federal/cnpj',
        precisa_nome: false,
        aceita: ['CNPJ']
    }
};

app.get('/', (req, res) => res.send('API Background Check v5 (Mother Name Added)'));

app.post('/consultar-lote', async (req, res) => {
    // 1. Recebendo nome_mae do Frontend
    const { documento, nome, data_nascimento, nome_mae, fontes_escolhidas } = req.body;
    const batchId = uuidv4();

    console.log(`>>> Batch ${batchId}: Iniciando...`);

    if (!documento || !fontes_escolhidas) {
        return res.status(400).json({ erro: "Dados incompletos." });
    }

    const docLimpo = documento.replace(/\D/g, '');
    const tipoDoc = docLimpo.length > 11 ? 'CNPJ' : 'CPF';
    const nomeLimpo = nome ? nome.trim().toUpperCase() : null;
    const dataNascimentoLimpa = data_nascimento ? data_nascimento.trim() : null;
    
    // 2. Limpando Nome da Mãe (Maiúsculo e sem espaços nas pontas)
    const nomeMaeLimpo = nome_mae ? nome_mae.trim().toUpperCase() : null;

    const promessas = fontes_escolhidas.map(async (fonteKey) => {
        const config = FONTES_CONFIG[fonteKey];
        
        if (!config || !config.aceita.includes(tipoDoc)) {
            return { origem: fonteKey, status: 'IGNORADO' };
        }
        
        // Validação de campos obrigatórios básicos
        if (config.precisa_nome && (!nomeLimpo || !dataNascimentoLimpa)) {
             return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: 'Dados pessoais (Nome/Data) faltantes' };
        }

        const args = { token: TOKEN_API, timeout: 600 };
        if (tipoDoc === 'CNPJ') args.cnpj = docLimpo;
        if (tipoDoc === 'CPF') args.cpf = docLimpo;
        
        if (fonteKey === 'policia_federal') {
            args.nome = nomeLimpo;
            args.birthdate = dataNascimentoLimpa;
            
            // 3. Adicionando Nome da Mãe se estiver disponível
            if (nomeMaeLimpo) {
                args.nome_mae = nomeMaeLimpo;
            }
        } else if (fonteKey === 'trt4' && tipoDoc === 'CPF') {
             args.nome = nomeLimpo; 
        }

        try {
            console.log(`[${fonteKey}] Chamando API...`);
            const response = await axios.post(config.url, args);
            const resInfo = response.data;

            if (resInfo.code !== 200) throw new Error(resInfo.code_message);

            // --- LÓGICA DE DETECÇÃO DE ARQUIVO ---
            let urlSupabase = null;
            if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
                try {
                    const urlOriginal = resInfo.site_receipts[0];
                    const fileResponse = await axios.get(urlOriginal, { responseType: 'arraybuffer' });
                    const fileBuffer = fileResponse.data;
                    
                    const headerArquivo = fileBuffer.toString('utf-8', 0, 1000).toLowerCase();
                    
                    let extensao = 'pdf';
                    let contentType = 'application/pdf';

                    if (headerArquivo.startsWith('%pdf-')) {
                        // É PDF
                    } else if (headerArquivo.includes('<html') || headerArquivo.includes('<!doctype') || headerArquivo.includes('<body') || headerArquivo.includes('<meta')) {
                        extensao = 'html';
                        contentType = 'text/html; charset=utf-8';
                    } else {
                        extensao = 'html'; // Fallback
                        contentType = 'text/html; charset=utf-8';
                    }

                    const nomeArquivo = `${batchId}/${fonteKey}_${Date.now()}.${extensao}`;
                    const { error: upErr } = await supabase.storage
                        .from('arquivos-teste')
                        .upload(nomeArquivo, fileBuffer, { contentType: contentType, upsert: true });
                    
                    if (!upErr) {
                        const { data: urlData } = supabase.storage
                            .from('arquivos-teste')
                            .getPublicUrl(nomeArquivo);
                        urlSupabase = urlData.publicUrl;
                    }
                } catch (e) {
                    console.error(`[${fonteKey}] Erro download:`, e.message);
                }
            }

            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                nome_pesquisado: nomeLimpo,
                resposta_completa_api: resInfo,
                url_arquivo: urlSupabase,
                status_resumido: 'SUCESSO'
            }]);

            return { origem: fonteKey, status: 'SUCESSO', arquivo: urlSupabase, dados: resInfo.data };

        } catch (error) {
            const errorMsg = error.response?.data?.code_message || error.message;
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                status_resumido: 'ERRO',
                resposta_completa_api: { erro: errorMsg }
            }]);
            return { origem: fonteKey, status: 'ERRO', mensagem: errorMsg };
        }
    });

    const resultados = await Promise.all(promessas);
    res.json({ batch_id: batchId, resultados: resultados.filter(r => r) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Rodando na porta ${PORT}`); });
