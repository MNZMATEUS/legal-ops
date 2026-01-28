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

// Mapeamento das APIs
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

app.get('/', (req, res) => res.send('API Background Check Online v3 (Smart Detect)'));

app.post('/consultar-lote', async (req, res) => {
    const { documento, nome, data_nascimento, fontes_escolhidas } = req.body;
    const batchId = uuidv4();

    console.log(`>>> Batch ${batchId}: Iniciando para ${documento}`);

    if (!documento || !fontes_escolhidas || fontes_escolhidas.length === 0) {
        return res.status(400).json({ erro: "Documento e fontes são obrigatórios." });
    }

    // 1. Limpeza de Dados
    const docLimpo = documento.replace(/\D/g, '');
    const tipoDoc = docLimpo.length > 11 ? 'CNPJ' : 'CPF';
    const nomeLimpo = nome ? nome.trim().toUpperCase() : null;
    const dataNascimentoLimpa = data_nascimento ? data_nascimento.trim() : null;

    const promessas = fontes_escolhidas.map(async (fonteKey) => {
        const config = FONTES_CONFIG[fonteKey];
        
        if (!config) return null;
        if (!config.aceita.includes(tipoDoc)) {
            return { origem: fonteKey, status: 'IGNORADO', mensagem: `Fonte não aceita ${tipoDoc}` };
        }
        if (config.precisa_nome && (!nomeLimpo || !dataNascimentoLimpa)) {
             return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: `Nome e Data obrigatórios` };
        }

        const args = { token: TOKEN_API, timeout: 600 };
        if (tipoDoc === 'CNPJ') args.cnpj = docLimpo;
        if (tipoDoc === 'CPF') args.cpf = docLimpo;
        
        if (fonteKey === 'policia_federal') {
            args.nome = nomeLimpo;
            args.birthdate = dataNascimentoLimpa; 
        } else if (fonteKey === 'trt4' && tipoDoc === 'CPF') {
             args.nome = nomeLimpo; 
        }

        try {
            console.log(`[${fonteKey}] Solicitando API...`);
            const response = await axios.post(config.url, args);
            const resInfo = response.data;

            if (resInfo.code !== 200) {
                throw new Error(`Erro ${resInfo.code}: ${resInfo.code_message}`);
            }

            // --- LÓGICA DE DOWNLOAD CORRIGIDA ---
            let urlSupabase = null;
            if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
                try {
                    const urlOriginal = resInfo.site_receipts[0];
                    console.log(`[${fonteKey}] Baixando arquivo...`);

                    // Baixa o arquivo
                    const fileResponse = await axios.get(urlOriginal, { responseType: 'arraybuffer' });
                    const fileBuffer = fileResponse.data;
                    
                    // DETECÇÃO INTELIGENTE: Converte o início do arquivo para texto para checar
                    const inicioArquivo = fileBuffer.toString('utf-8', 0, 50).toLowerCase(); // Lê os primeiros 50 caracteres
                    
                    let extensao = 'pdf';
                    let contentType = 'application/pdf';

                    // Se começar com <html ou <!doctype, é HTML com certeza
                    if (inicioArquivo.includes('<html') || inicioArquivo.includes('<!doctype')) {
                        extensao = 'html';
                        contentType = 'text/html; charset=utf-8'; // charset é vital para acentos
                        console.log(`[${fonteKey}] Arquivo identificado como HTML.`);
                    } else {
                        console.log(`[${fonteKey}] Arquivo identificado como PDF (Padrão).`);
                    }

                    const nomeArquivo = `${batchId}/${fonteKey}_${Date.now()}.${extensao}`;

                    // Upload para Supabase
                    const { error: upErr } = await supabase.storage
                        .from('arquivos-teste')
                        .upload(nomeArquivo, fileBuffer, { 
                            contentType: contentType, 
                            upsert: true
                        });
                    
                    if (!upErr) {
                        const { data: urlData } = supabase.storage
                            .from('arquivos-teste')
                            .getPublicUrl(nomeArquivo);
                        urlSupabase = urlData.publicUrl;
                    }
                } catch (e) {
                    console.error(`[${fonteKey}] Erro no arquivo:`, e.message);
                }
            }
            // ------------------------------------

            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                nome_pesquisado: nomeLimpo,
                resposta_completa_api: resInfo,
                url_arquivo: urlSupabase,
                status_resumido: 'SUCESSO'
            }]);

            return {
                origem: fonteKey,
                status: 'SUCESSO',
                arquivo: urlSupabase,
                dados: resInfo.data
            };

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
    const resultadosFinais = resultados.filter(r => r !== null);

    res.json({ batch_id: batchId, resultados: resultadosFinais });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Rodando na porta ${PORT}`); });
