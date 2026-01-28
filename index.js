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

app.get('/', (req, res) => res.send('API Background Check Online v2 (File Fix)'));

app.post('/consultar-lote', async (req, res) => {
    const { documento, nome, data_nascimento, fontes_escolhidas } = req.body;
    const batchId = uuidv4();

    console.log(`>>> Batch ${batchId}: Iniciando para ${documento}`);

    if (!documento || !fontes_escolhidas || fontes_escolhidas.length === 0) {
        return res.status(400).json({ erro: "Documento e fontes são obrigatórios." });
    }

    // 1. Limpeza de Dados (Sanitization) - CRUCIAL PARA A PF
    const docLimpo = documento.replace(/\D/g, '');
    const tipoDoc = docLimpo.length > 11 ? 'CNPJ' : 'CPF';
    
    // Garantir que o nome vá sem espaços nas pontas e em MAIÚSCULO
    const nomeLimpo = nome ? nome.trim().toUpperCase() : null;
    
    // Garantir data limpa (apenas confirmar formato)
    const dataNascimentoLimpa = data_nascimento ? data_nascimento.trim() : null;

    const promessas = fontes_escolhidas.map(async (fonteKey) => {
        const config = FONTES_CONFIG[fonteKey];
        
        // Validações básicas
        if (!config) return null;
        if (!config.aceita.includes(tipoDoc)) {
            return { origem: fonteKey, status: 'IGNORADO', mensagem: `Fonte não aceita ${tipoDoc}` };
        }
        if (config.precisa_nome && (!nomeLimpo || !dataNascimentoLimpa)) {
             return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: `Nome e Data obrigatórios` };
        }

        // Montar Argumentos
        const args = { token: TOKEN_API, timeout: 600 };

        if (tipoDoc === 'CNPJ') args.cnpj = docLimpo;
        if (tipoDoc === 'CPF') args.cpf = docLimpo;
        
        // Parâmetros Específicos da PF
        if (fonteKey === 'policia_federal') {
            args.nome = nomeLimpo;
            args.birthdate = dataNascimentoLimpa; // YYYY-MM-DD
        } 
        else if (fonteKey === 'trt4' && tipoDoc === 'CPF') {
             args.nome = nomeLimpo; 
        }

        try {
            // Chamada API
            console.log(`[${fonteKey}] Solicitando API...`);
            const response = await axios.post(config.url, args);
            const resInfo = response.data;

            if (resInfo.code !== 200) {
                // Logar erro detalhado para debug
                console.error(`[${fonteKey}] Erro API:`, JSON.stringify(resInfo.errors));
                throw new Error(`Erro ${resInfo.code}: ${resInfo.code_message}`);
            }

            // Download e Upload do Arquivo (CORREÇÃO AQUI)
            let urlSupabase = null;
            if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
                try {
                    const urlOriginal = resInfo.site_receipts[0];
                    console.log(`[${fonteKey}] Baixando arquivo...`);

                    // Baixar olhando os Headers
                    const fileResponse = await axios.get(urlOriginal, { responseType: 'arraybuffer' });
                    
                    // Descobrir o tipo real do arquivo pelo cabeçalho HTTP
                    const contentTypeHeader = fileResponse.headers['content-type'] || 'application/pdf';
                    
                    // Definir extensão baseada no tipo real
                    let extensao = 'pdf'; // Padrão
                    if (contentTypeHeader.includes('html')) extensao = 'html';
                    else if (contentTypeHeader.includes('image')) extensao = 'jpg';

                    const nomeArquivo = `${batchId}/${fonteKey}_${Date.now()}.${extensao}`;

                    // Upload com o Content-Type CORRETO
                    const { error: upErr } = await supabase.storage
                        .from('arquivos-teste')
                        .upload(nomeArquivo, fileResponse.data, { 
                            contentType: contentTypeHeader, // Isso conserta a tela preta
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

            // Salvar no Banco
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
            // Tratamento de Erro Robusto
            const errorMsg = error.response?.data?.code_message || error.message;
            
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                status_resumido: 'ERRO',
                resposta_completa_api: { erro: errorMsg, logs: error.response?.data }
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
