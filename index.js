const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Para gerar o ID do lote (batch)
// Se der erro de 'uuid', rode: npm install uuid

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÕES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TOKEN_API = process.env.INFOSIMPLES_TOKEN;

// Mapeamento das APIs (Configuração Central)
const FONTES_CONFIG = {
    'trt4': {
        url: 'https://api.infosimples.com/api/v2/consultas/tribunal/trt4/ceat',
        precisa_nome: false,
        aceita: ['CPF', 'CNPJ']
    },
    'policia_federal': {
        url: 'https://api.infosimples.com/api/v2/consultas/antecedentes-criminais/pf/emit',
        precisa_nome: true, // PF exige nome e data nascimento
        aceita: ['CPF']
    },
    'receita_federal': {
        url: 'https://api.infosimples.com/api/v2/consultas/receita-federal/cnpj',
        precisa_nome: false,
        aceita: ['CNPJ']
    }
};

app.get('/', (req, res) => res.send('API Background Check Online'));

app.post('/consultar-lote', async (req, res) => {
    const { documento, nome, data_nascimento, fontes_escolhidas } = req.body;
    const batchId = uuidv4(); // Identificador único deste grupo de consultas

    console.log(`>>> Iniciando Batch ${batchId} para: ${documento}`);

    if (!documento || !fontes_escolhidas || fontes_escolhidas.length === 0) {
        return res.status(400).json({ erro: "Documento e fontes são obrigatórios." });
    }

    // Limpeza e Validação
    const docLimpo = documento.replace(/\D/g, '');
    const tipoDoc = docLimpo.length > 11 ? 'CNPJ' : 'CPF';

    // Array de Promessas (Consultas que rodarão em paralelo)
    const promessas = fontes_escolhidas.map(async (fonteKey) => {
        const config = FONTES_CONFIG[fonteKey];
        
        // 1. Validação Prévia (Pular se o tipo não bate)
        if (!config) return null; // Fonte não existe
        if (!config.aceita.includes(tipoDoc)) {
            return {
                origem: fonteKey,
                status: 'IGNORADO',
                mensagem: `Esta fonte não aceita ${tipoDoc}`
            };
        }
        if (config.precisa_nome && (!nome || !data_nascimento)) {
             return {
                origem: fonteKey,
                status: 'ERRO_DADOS',
                mensagem: `Nome e Data de Nascimento são obrigatórios para ${fonteKey}`
            };
        }

        // 2. Montar Argumentos da API
        const args = {
            token: TOKEN_API,
            timeout: 600
        };

        // Adicionar parâmetros específicos
        if (tipoDoc === 'CNPJ') args.cnpj = docLimpo;
        if (tipoDoc === 'CPF') args.cpf = docLimpo;
        
        if (fonteKey === 'policia_federal') {
            args.nome = nome;
            args.birthdate = data_nascimento; // Formato YYYY-MM-DD (já vem do front)
            // args.nome_mae = ... (opcional, não vamos usar no MVP)
        } else if (fonteKey === 'trt4' && tipoDoc === 'CPF') {
            // O TRT4 as vezes pede nome se for CPF, vamos mandar por garantia
             args.nome = nome; 
        }

        try {
            // 3. Chamar InfoSimples
            console.log(`[${fonteKey}] Chamando API...`);
            const response = await axios.post(config.url, args);
            const resInfo = response.data;

            if (resInfo.code !== 200) {
                throw new Error(`API retornou código ${resInfo.code}: ${resInfo.code_message}`);
            }

            // 4. Download do Arquivo (Se houver)
            let urlSupabase = null;
            if (resInfo.site_receipts && resInfo.site_receipts.length > 0 && resInfo.site_receipts[0]) {
                try {
                    const urlOriginal = resInfo.site_receipts[0];
                    const fileBuffer = await axios.get(urlOriginal, { responseType: 'arraybuffer' });
                    
                    const extensao = urlOriginal.endsWith('.html') ? 'html' : 'pdf';
                    const contentType = extensao === 'html' ? 'text/html' : 'application/pdf';
                    const nomeArquivo = `${batchId}/${fonteKey}_${Date.now()}.${extensao}`;

                    const { error: upErr } = await supabase.storage
                        .from('arquivos-teste')
                        .upload(nomeArquivo, fileBuffer.data, { contentType });
                    
                    if (!upErr) {
                        const { data: urlData } = supabase.storage
                            .from('arquivos-teste')
                            .getPublicUrl(nomeArquivo);
                        urlSupabase = urlData.publicUrl;
                    }
                } catch (e) {
                    console.error(`[${fonteKey}] Erro ao baixar arquivo:`, e.message);
                }
            }

            // 5. Salvar no Supabase (Tabela Geral)
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                nome_pesquisado: nome || null,
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
            console.error(`[${fonteKey}] Falha:`, error.message);
            // Salvar o erro no banco também para auditoria
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                status_resumido: 'ERRO',
                resposta_completa_api: { erro: error.message }
            }]);

            return {
                origem: fonteKey,
                status: 'ERRO',
                mensagem: error.message
            };
        }
    });

    // Espera todas as consultas terminarem
    const resultados = await Promise.all(promessas);

    // Remove nulos (ignorar fontes não executadas)
    const resultadosFinais = resultados.filter(r => r !== null);

    res.json({
        batch_id: batchId,
        resultados: resultadosFinais
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Rodando na porta ${PORT}`); });
