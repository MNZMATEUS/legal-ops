const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // Importante: certifique-se que instalou (npm install axios)

const app = express();
app.use(cors());
app.use(express.json());

// Variáveis de Ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const INFOSIMPLES_TOKEN = process.env.INFOSIMPLES_TOKEN; // Novo Token

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('API InfoSimples Gateway Online!');
});

app.post('/consultar-trt4', async (req, res) => {
    try {
        console.log('1. Recebi pedido de consulta...');
        
        // 1. Receber e Limpar o Input (CPF ou CNPJ)
        // O frontend vai mandar { "documento": "123.456..." }
        const docBruto = req.body.documento;
        if (!docBruto) throw new Error("Documento (CPF/CNPJ) é obrigatório.");

        // Remove tudo que não for número (pontos, traços)
        const docLimpo = docBruto.replace(/\D/g, '');
        
        // Decide se é CPF ou CNPJ baseado no tamanho
        const isCnpj = docLimpo.length > 11;
        
        console.log(`2. Documento identificado: ${isCnpj ? 'CNPJ' : 'CPF'} - ${docLimpo}`);

        // 2. Montar Payload para InfoSimples
        const args = {
            token: INFOSIMPLES_TOKEN,
            timeout: 300, // Timeout sugerido pela doc
            [isCnpj ? 'cnpj' : 'cpf']: docLimpo // Chave dinâmica
        };

        // 3. Chamar a API da InfoSimples
        console.log('3. Chamando InfoSimples...');
        const responseExterna = await axios.post(
            'https://api.infosimples.com/api/v2/consultas/tribunal/trt4/ceat', 
            args
        );
        const resInfo = responseExterna.data;

        // 4. Verificar se deu erro na InfoSimples (Ex: 600-799)
        if (resInfo.code !== 200) {
            console.error('Erro na InfoSimples:', resInfo.code_message);
            // Retorna o erro para o frontend mas não salva arquivo
            return res.status(400).json({
                sucesso: false,
                mensagem: `Erro na consulta: ${resInfo.code} - ${resInfo.code_message}`,
                erros_detalhados: resInfo.errors
            });
        }

        // 5. O Pulo do Gato: Baixar o arquivo da URL que a API devolveu
        // A API devolve um array de links em 'site_receipts'
        let urlArquivoSupabase = null;

        if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
            const urlReciboOriginal = resInfo.site_receipts[0];
            console.log('4. Baixando arquivo original de:', urlReciboOriginal);

            // Baixa o arquivo para a memória do Render
            const fileResponse = await axios.get(urlReciboOriginal, { responseType: 'arraybuffer' });
            
            // Define nome e extensão (PDF ou HTML)
            // Tenta adivinhar pelo link, se não der, assume PDF
            const extensao = urlReciboOriginal.endsWith('.html') ? 'html' : 'pdf';
            const contentType = extensao === 'html' ? 'text/html' : 'application/pdf';
            const nomeArquivo = `certidao_${docLimpo}_${Date.now()}.${extensao}`;

            console.log('5. Fazendo upload para o Supabase...');
            
            // Upload para o Bucket
            const { error: uploadError } = await supabase
                .storage
                .from('arquivos-teste') // Certifique-se que este bucket existe e é publico
                .upload(nomeArquivo, fileResponse.data, { contentType: contentType });

            if (uploadError) throw uploadError;

            // Gerar URL Pública do Supabase
            const { data: urlData } = supabase
                .storage
                .from('arquivos-teste')
                .getPublicUrl(nomeArquivo);
            
            urlArquivoSupabase = urlData.publicUrl;
        }

      // 6. Salvar TUDO no Banco de Dados
        console.log('6. Gravando no Banco...');
        
        const { data: dbData, error: dbError } = await supabase
            .from('consultas_trt4') // Nome novo da tabela
            .insert([{
                // Coluna nova: qual CPF/CNPJ foi usado
                documento_pesquisado: docLimpo, 
                
                // Coluna renomeada: O JSON inteiro da InfoSimples vai aqui
                resposta_completa_api: resInfo, 
                
                // Coluna antiga: O link do seu arquivo
                url_arquivo: urlArquivoSupabase, 
                
                // Coluna nova: status (ex: "A requisição foi processada com sucesso.")
                status_resumido: resInfo.code_message 
            }])
            .select();

        if (dbError) throw dbError;

        // 7. Resposta Final para o Frontend
        res.json({
            sucesso: true,
            mensagem: "Consulta realizada com sucesso!",
            dados_certidao: resInfo.data,
            arquivo: urlArquivoSupabase
        });

    } catch (error) {
        console.error('ERRO CRÍTICO:', error.message);
        // Tenta pegar mensagem de erro do Axios se existir
        const msg = error.response?.data?.code_message || error.message;
        res.status(500).json({ erro: msg });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
