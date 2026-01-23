const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors()); // Permite que o Front (Firebase) fale com o Back
app.use(express.json());

// Pega as chaves que vamos configurar no Render
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Inicia o cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('API Online! Rota de teste: POST /processar-dados');
});

app.post('/processar-dados', async (req, res) => {
    try {
        console.log('1. Recebi o pedido...');

        // --- AQUI ENTRARIA A CHAMADA PARA A API EXTERNA ---
        // Por enquanto, vamos simular igual fizemos no Colab
        const conteudoArquivo = "Arquivo gerado pelo Render na Nuvem!";
        const nomeArquivo = `render_file_${Date.now()}.txt`;

        console.log('2. Subindo arquivo para o Supabase...');

        // Upload do arquivo
        const { data: fileData, error: fileError } = await supabase
            .storage
            .from('arquivos-teste') // O mesmo bucket do Colab
            .upload(nomeArquivo, conteudoArquivo, {
                contentType: 'text/plain'
            });

        if (fileError) throw fileError;

        // Pegar URL
        const { data: urlData } = supabase
            .storage
            .from('arquivos-teste')
            .getPublicUrl(nomeArquivo);

        console.log('3. Salvando no Banco...');

        // Salvar no Banco
        const { data: dbData, error: dbError } = await supabase
            .from('logs_teste') // A mesma tabela do Colab
            .insert([{
                json_mock: { origem: "Render Backend", status: "ok" },
                url_arquivo: urlData.publicUrl
            }])
            .select();

        if (dbError) throw dbError;

        res.json({
            sucesso: true,
            mensagem: "Processo concluído via Render!",
            arquivo: urlData.publicUrl
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
