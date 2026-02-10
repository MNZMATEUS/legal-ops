const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÕES ---
// Certifique-se de que essas variáveis estão no seu .env do Render
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TOKEN_API = process.env.INFOSIMPLES_TOKEN;

// Mapeamento das APIs e suas regras básicas
const FONTES_CONFIG = {
    // --- ORIGINAIS ---
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
    'receita_federal': { // CNPJ
        url: 'https://api.infosimples.com/api/v2/consultas/receita-federal/cnpj',
        precisa_nome: false,
        aceita: ['CNPJ']
    },

    // --- NOVAS ---
    'tst_cndt': {
        url: 'https://api.infosimples.com/api/v2/consultas/tribunal/tst/cndt',
        precisa_nome: false,
        aceita: ['CPF', 'CNPJ']
    },
    'receita_cpf': { // CPF (Situação Cadastral)
        url: 'https://api.infosimples.com/api/v2/consultas/receita-federal/cpf',
        precisa_nome: false, // Precisa de Data Nascimento, validado na lógica
        aceita: ['CPF']
    },
    'tjsp_civel': {
        url: 'https://api.infosimples.com/api/v2/consultas/tribunal/tjsp/pedido-civel',
        precisa_nome: true, // E precisa de Email
        aceita: ['CPF', 'CNPJ']
    },
    'antecedentes_sp': {
        url: 'https://api.infosimples.com/api/v2/consultas/antecedentes-criminais/sp',
        precisa_nome: true, // E precisa de RG, Data RG, Genero
        aceita: ['CPF'] // Na verdade usa RG, mas vinculamos ao CPF do cadastro
    },
    'pge_sp': {
        url: 'https://api.infosimples.com/api/v2/consultas/pge/sp/cndt',
        precisa_nome: false,
        aceita: ['CPF', 'CNPJ']
    }
};

app.get('/', (req, res) => res.send('API Background Check v6 (Full Integration)'));

app.post('/consultar-lote', async (req, res) => {
    // 1. Recebendo TODOS os dados novos do Frontend
    const { 
        documento, nome, data_nascimento, nome_mae, 
        rg, rg_digito, rg_expedicao, genero, 
        email, endereco_cidade, endereco_uf,
        fontes_escolhidas, user_id 
    } = req.body;
    
    const batchId = uuidv4();

    console.log(`>>> Batch ${batchId} | User: ${user_id} | Docs: ${documento}`);

    if (!documento || !fontes_escolhidas) {
        return res.status(400).json({ erro: "Dados incompletos." });
    }

    // Limpeza de Dados
    const docLimpo = documento.replace(/\D/g, '');
    const tipoDoc = docLimpo.length > 11 ? 'CNPJ' : 'CPF';
    
    const nomeLimpo = nome ? nome.trim().toUpperCase() : null;
    const nomeMaeLimpo = nome_mae ? nome_mae.trim().toUpperCase() : null;
    const dataNascimentoLimpa = data_nascimento ? data_nascimento.trim() : null;
    
    // Novos campos limpos
    const rgLimpo = rg ? rg.replace(/\D/g, '') : null;
    const emailLimpo = email ? email.trim() : null;

    const promessas = fontes_escolhidas.map(async (fonteKey) => {
        const config = FONTES_CONFIG[fonteKey];
        
        // Verifica se a fonte existe e aceita o tipo de doc
        if (!config || !config.aceita.includes(tipoDoc)) {
            // Caso especial: Antecedentes SP usa RG, mas validamos se é pessoa física (CPF)
            if (fonteKey === 'antecedentes_sp' && tipoDoc === 'CPF') {
                // Passa, pois é PF
            } else {
                return { origem: fonteKey, status: 'IGNORADO' };
            }
        }
        
        // Validação Genérica de Nome
        if (config.precisa_nome && !nomeLimpo) {
             return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: 'Nome obrigatório' };
        }

        // --- CONSTRUÇÃO DOS ARGUMENTOS DA API ---
        const args = { token: TOKEN_API, timeout: 600 };
        
        // Parâmetros Padrão
        if (tipoDoc === 'CNPJ') args.cnpj = docLimpo;
        if (tipoDoc === 'CPF') args.cpf = docLimpo;

        // --- LÓGICA ESPECÍFICA POR FONTE ---
        
        // 1. Receita Federal (CPF)
        if (fonteKey === 'receita_cpf') {
            if (!dataNascimentoLimpa) return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: 'Data Nascimento obrigatória' };
            args.birthdate = dataNascimentoLimpa;
        }

        // 2. Polícia Federal
        if (fonteKey === 'policia_federal') {
            args.nome = nomeLimpo;
            args.birthdate = dataNascimentoLimpa;
            if (nomeMaeLimpo) args.nome_mae = nomeMaeLimpo;
        }

        // 3. TRT4
        if (fonteKey === 'trt4' && tipoDoc === 'CPF') {
             args.nome = nomeLimpo; 
        }

        // 4. Antecedentes Criminais SP (A mais complexa)
        if (fonteKey === 'antecedentes_sp') {
            if (!rgLimpo || !rg_expedicao || !genero) {
                return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: 'RG, Data Emissão ou Gênero faltando' };
            }
            args.nome = nomeLimpo;
            args.birthdate = dataNascimentoLimpa;
            args.rg = rgLimpo;
            if (rg_digito) args.rg_digito = rg_digito;
            args.rg_expedicao = rg_expedicao; // Formato YYYY-MM-DD vindo do front
            args.genero = genero; // 'MASCULINO' ou 'FEMININO'
            if (nomeMaeLimpo) args.mae = nomeMaeLimpo;
            // args.pai = ... se tiver
        }

        // 5. TJSP Cível
        if (fonteKey === 'tjsp_civel') {
            if (!emailLimpo) return { origem: fonteKey, status: 'ERRO_DADOS', mensagem: 'Email obrigatório para TJSP' };
            args.nome = nomeLimpo; // Se PJ, a API pede 'razao_social', mas 'nome' costuma funcionar como alias na InfoSimples, verifique doc
            if (tipoDoc === 'CNPJ') args.razao_social = nomeLimpo;
            
            args.email = emailLimpo;
            args.finalidade = 'Conhecimento'; // Padrão
            
            if (tipoDoc === 'CNPJ') {
                args.municipio = `${endereco_cidade} / ${endereco_uf}`; // Formato exigido costuma ser "CIDADE / UF"
                args.uf = endereco_uf;
                args.pais = 'BRASIL';
            }
        }

        try {
            console.log(`[${fonteKey}] Chamando InfoSimples...`);
            const response = await axios.post(config.url, args);
            const resInfo = response.data;

            if (resInfo.code !== 200) throw new Error(resInfo.code_message);

            let urlSupabase = null;

            // --- DOWNLOAD E UPLOAD DO PDF/HTML ---
            if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
                try {
                    const urlOriginal = resInfo.site_receipts[0];
                    const fileResponse = await axios.get(urlOriginal, { responseType: 'arraybuffer' });
                    let fileBuffer = fileResponse.data;

                    // Detecção de Tipo
                    const headerArquivo = fileBuffer.toString('latin1', 0, 100).toLowerCase();
                    let extensao = headerArquivo.startsWith('%pdf') ? 'pdf' : 'html';
                    let contentType = extensao === 'pdf' ? 'application/pdf' : 'text/html; charset=latin1';

                    // Tratamento Especial para HTML
                    if (extensao === 'html') {
                        let htmlContent = fileBuffer.toString('latin1');
                        
                        // Fix Imagem TRT4
                        if (fonteKey === 'trt4') {
                            htmlContent = htmlContent.replace(/src="assets\/imagens\/brasao.png"/g, 'src="https://pje.trt4.jus.br/certidoes/assets/imagens/brasao.png"');
                        }

                        // Estilização (A4)
                        const estilo = `<style>body{font-family:'Times New Roman';padding:40px;background:#525659}article{max-width:800px;margin:0 auto;padding:50px;background:#fff;min-height:900px}img{display:block;margin:0 auto}</style>`;
                        htmlContent = estilo + htmlContent;
                        
                        fileBuffer = Buffer.from(htmlContent, 'latin1');
                    }

                    // Upload Supabase
                    const nomeArquivo = `${user_id}/${batchId}/${fonteKey}_${Date.now()}.${extensao}`;
                    const { error: upErr } = await supabase.storage
                        .from('arquivos-teste') // <--- CHEQUE O NOME DO BUCKET
                        .upload(nomeArquivo, fileBuffer, { contentType, upsert: true });

                    if (!upErr) {
                        const { data: urlData } = supabase.storage
                            .from('arquivos-teste')
                            .getPublicUrl(nomeArquivo);
                        urlSupabase = urlData.publicUrl;
                    } else {
                        console.error(`[${fonteKey}] Erro Storage:`, upErr.message);
                    }

                } catch (errFile) {
                    console.error(`[${fonteKey}] Falha ao baixar/salvar arquivo:`, errFile.message);
                    // Não damos throw aqui para salvar o resultado da consulta mesmo sem o PDF
                }
            }

            // --- SALVAR NO BANCO (ÚNICA VEZ) ---
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                user_id: user_id,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                nome_pesquisado: nomeLimpo,
                resposta_completa_api: resInfo,
                url_arquivo: urlSupabase,
                url_origem: (resInfo.site_receipts && resInfo.site_receipts[0]) || null,
                status_resumido: 'SUCESSO'
            }]);

            return { origem: fonteKey, status: 'SUCESSO', arquivo: urlSupabase };

        } catch (error) {
            const errorMsg = error.response?.data?.code_message || error.message;
            const errorFull = error.response?.data || { erro: errorMsg };
            
            console.error(`[${fonteKey}] Erro API:`, errorMsg);

            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                user_id: user_id,
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                status_resumido: 'ERRO',
                resposta_completa_api: errorFull
            }]);
            
            return { origem: fonteKey, status: 'ERRO', mensagem: errorMsg };
        }
    });

    const resultados = await Promise.all(promessas);
    res.json({ batch_id: batchId, status: 'ok', resultados });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Rodando API na porta ${PORT}`); });
