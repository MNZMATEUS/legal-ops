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
    const { documento, nome, data_nascimento, nome_mae, fontes_escolhidas, user_id } = req.body;
    const batchId = uuidv4();

    console.log(`>>> Batch ${batchId} para Usuário ${user_id || 'ANON'}: Iniciando...`);

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

            let urlSupabase = null;

            // --- LÓGICA DE ARQUIVOS ---
            if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
                try {
                    const urlOriginal = resInfo.site_receipts[0];
                    
                    // 1. Baixa o arquivo como ArrayBuffer (Binário puro)
                    const fileResponse = await axios.get(urlOriginal, { responseType: 'arraybuffer' });
                    let fileBuffer = fileResponse.data;

                    // 2. Detecção Inteligente (Lê o cabeçalho do arquivo)
                    const headerArquivo = fileBuffer.toString('latin1', 0, 100).toLowerCase();
                    let extensao = 'pdf';
                    let contentType = 'application/pdf';

                    // Se NÃO for PDF, tratamos como HTML
                    if (!headerArquivo.startsWith('%pdf')) {
                        extensao = 'html';
                        contentType = 'text/html; charset=latin1'; 

                        // 1. CORREÇÃO DE ACENTUAÇÃO (Decodifica Latin1 para texto correto)
                        let htmlContent = fileBuffer.toString('latin1'); 

                        // 2. CORREÇÃO DA IMAGEM (O PULO DO GATO 🐱)
                        // O TRT manda o link relativo "assets/imagens/...". 
                        // Nós trocamos pelo link COMPLETO do servidor deles.
                        if (fonteKey === 'trt4') {
                            htmlContent = htmlContent.replace(
                                /src="assets\/imagens\/brasao.png"/g, 
                                'src="https://pje.trt4.jus.br/certidoes/assets/imagens/brasao.png"'
                            );
                        }

                        // 3. VISUAL PROFISSIONAL (CSS)
                        // Nota: Removi o "img { display: none }" para o brasão aparecer!
                        const estiloVisual = `
                            <style>
                                body { font-family: 'Times New Roman', serif; line-height: 1.5; color: #000; padding: 40px; background: #525659; }
                                /* Simula uma folha A4 no centro da tela */
                                article { 
                                    max-width: 800px; 
                                    margin: 0 auto; 
                                    padding: 50px; 
                                    background: #fff; 
                                    box-shadow: 0 0 15px rgba(0,0,0,0.5); 
                                    min-height: 900px; /* Altura de uma folha */
                                }
                                header { text-align: center; margin-bottom: 40px; }
                                
                                /* Força o brasão a aparecer centralizado e no tamanho certo */
                                img, .brasao-certidao { 
                                    display: block !important; 
                                    margin: 0 auto 15px auto; 
                                    width: 100px; 
                                    height: auto;
                                }
                                
                                h3 { font-size: 1.2rem; text-transform: uppercase; text-align: center; margin-top: 20px; text-decoration: underline; }
                                p { margin-bottom: 15px; text-align: justify; font-size: 1rem; }
                                strong { font-weight: bold; }
                                .cabecalho-certidao p { margin: 2px 0; font-size: 0.9rem; text-align: center; font-weight: bold; }
                                ul { list-style: none; padding: 0; }
                                .observacoes-certidao { margin-top: 40px; font-size: 0.8rem; border-top: 1px solid #000; padding-top: 10px; }
                            </style>
                            <meta charset="latin1">
                        `;

                        // Injeta o estilo
                        if (htmlContent.includes('<head>')) {
                            htmlContent = htmlContent.replace('<head>', '<head>' + estiloVisual);
                        } else {
                            htmlContent = estiloVisual + htmlContent;
                        }

                        // Reconverte para UTF-8 para salvar no banco
                        fileBuffer = Buffer.from(htmlContent, 'latin1');
                    }

                    // 3. Upload para o Supabase (Organizado por user_id)
                    const nomeArquivo = `${user_id}/${batchId}/${fonteKey}_${Date.now()}.${extensao}`;
                    
                    const { error: upErr } = await supabase.storage
                        .from('arquivos-teste') // <--- CONFIRA SE O NOME DO BUCKET ESTÁ CERTO
                        .upload(nomeArquivo, fileBuffer, { 
                            contentType: contentType, 
                            upsert: true 
                        });
                    
                    // 4. RECUPERA A URL (Faltava isso no seu snippet!)
                    if (!upErr) {
                        const { data: urlData } = supabase.storage
                            .from('arquivos-teste')
                            .getPublicUrl(nomeArquivo);
                        urlSupabase = urlData.publicUrl; // <--- Aqui preenchemos a variável
                    } else {
                        console.error('Erro Upload:', upErr);
                    }

                } catch (e) {
                    console.error(`[${fonteKey}] Erro no processamento do arquivo:`, e.message);
                }
            }

            // 5. Salva no Banco de Dados
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                user_id: user_id, // <--- Importante para o RLS
                origem: fonteKey,
                documento_pesquisado: docLimpo,
                nome_pesquisado: nomeLimpo,
                resposta_completa_api: resInfo,
                url_arquivo: urlSupabase, // Agora isso terá valor (ou null se falhou)
                status_resumido: 'SUCESSO'
            }]);

            return { origem: fonteKey, status: 'SUCESSO', arquivo: urlSupabase, dados: resInfo.data };


        } catch (error) {
            const errorMsg = error.response?.data?.code_message || error.message;
            await supabase.from('certidoes_emitidas').insert([{
                batch_id: batchId,
                user_id: user_id, // <--- ADICIONAR ESTA LINHA TAMBÉM NO ERRO
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
