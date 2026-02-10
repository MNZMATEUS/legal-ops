const { v4: uuidv4 } = require('uuid');
const sourceRegistry = require('../sources/source-registry');
const apiClient = require('./api-client.service');
const fileProcessor = require('./file-processor.service');
const databaseService = require('./database.service');
const config = require('../config/environment');
const { cleanDocument, getDocumentType, cleanString } = require('../utils/document-validator');

const TRT4Source = require('../sources/trt4.source');
const PoliciaFederalSource = require('../sources/policia-federal.source');
const ReceitaFederalSource = require('../sources/receita-federal.source');

class CertificateService {
    constructor() {
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;

        sourceRegistry.loadConfiguration();

        sourceRegistry.registerSourceClass('trt4', TRT4Source);
        sourceRegistry.registerSourceClass('policia_federal', PoliciaFederalSource);
        sourceRegistry.registerSourceClass('receita_federal', ReceitaFederalSource);

        sourceRegistry.initializeSources();

        this.initialized = true;
        console.log('[CertificateService] Initialized successfully');
    }

    async processBatch(requestData) {
        if (!this.initialized) {
            this.initialize();
        }

        const batchId = uuidv4();
        const { documento, nome, data_nascimento, nome_mae, fontes_escolhidas, user_id } = requestData;

        console.log(`>>> Batch ${batchId} para Usuário ${user_id || 'ANON'}: Iniciando...`);

        if (!documento || !fontes_escolhidas || fontes_escolhidas.length === 0) {
            throw new Error('Dados incompletos: documento e fontes_escolhidas são obrigatórios');
        }

        const docLimpo = cleanDocument(documento);
        const tipoDoc = getDocumentType(documento);
        const nomeLimpo = cleanString(nome);
        const dataNascimentoLimpa = data_nascimento ? data_nascimento.trim() : null;
        const nomeMaeLimpo = cleanString(nome_mae);

        const cleanedData = {
            documento: docLimpo,
            nome: nomeLimpo,
            data_nascimento: dataNascimentoLimpa,
            nome_mae: nomeMaeLimpo,
            tipo: tipoDoc,
            user_id
        };

        const promessas = fontes_escolhidas.map(async (fonteKey) => {
            return await this.processSource(fonteKey, cleanedData, batchId);
        });

        const resultados = await Promise.all(promessas);

        return {
            batch_id: batchId,
            resultados: resultados.filter(r => r)
        };
    }

    async processSource(fonteKey, requestData, batchId) {
        try {
            if (!sourceRegistry.hasSource(fonteKey)) {
                console.log(`[${fonteKey}] Source not found or disabled`);
                return { origem: fonteKey, status: 'IGNORADO' };
            }

            const source = sourceRegistry.getSource(fonteKey);
            const documentType = requestData.tipo;

            if (!sourceRegistry.isSourceCompatible(fonteKey, documentType)) {
                console.log(`[${fonteKey}] Not compatible with ${documentType}`);
                return { origem: fonteKey, status: 'IGNORADO' };
            }

            const validation = source.validateRequirements(requestData, documentType);
            if (!validation.valid) {
                console.log(`[${fonteKey}] Validation failed: ${validation.error}`);
                return {
                    origem: fonteKey,
                    status: 'ERRO_DADOS',
                    mensagem: validation.error
                };
            }

            const apiParameters = source.buildApiParameters(
                requestData,
                documentType,
                config.INFOSIMPLES_TOKEN
            );

            console.log(`[${fonteKey}] Chamando API...`);
            const apiResult = await apiClient.callApi(source.config.api.url, apiParameters);

            if (!apiResult.success) {
                await databaseService.saveError({
                    batch_id: batchId,
                    user_id: requestData.user_id,
                    origem: fonteKey,
                    documento_pesquisado: requestData.documento,
                    error_message: apiResult.error
                });

                return {
                    origem: fonteKey,
                    status: 'ERRO',
                    mensagem: apiResult.error
                };
            }

            const resInfo = apiResult.data;
            let urlSupabase = null;
            let urlOriginal = null;

            if (resInfo.site_receipts && resInfo.site_receipts.length > 0) {
                urlOriginal = resInfo.site_receipts[0];

                const fileResult = await fileProcessor.processFile(
                    urlOriginal,
                    source,
                    {
                        user_id: requestData.user_id,
                        batch_id: batchId,
                        source: fonteKey,
                        bucket: source.config.storage?.bucket || 'arquivos-teste'
                    }
                );

                if (fileResult.success) {
                    urlSupabase = fileResult.url;
                } else {
                    console.error(`[${fonteKey}] Erro no processamento do arquivo:`, fileResult.error);
                }
            }

            await databaseService.saveCertificate({
                batch_id: batchId,
                user_id: requestData.user_id,
                origem: fonteKey,
                documento_pesquisado: requestData.documento,
                nome_pesquisado: requestData.nome,
                resposta_completa_api: resInfo,
                url_arquivo: urlSupabase,
                url_origem: urlOriginal,
                status_resumido: 'SUCESSO'
            });

            return {
                origem: fonteKey,
                status: 'SUCESSO',
                arquivo: urlSupabase,
                dados: resInfo.data
            };

        } catch (error) {
            const errorMsg = error.response?.data?.code_message || error.message;
            console.error(`[${fonteKey}] Error:`, errorMsg);

            await databaseService.saveError({
                batch_id: batchId,
                user_id: requestData.user_id,
                origem: fonteKey,
                documento_pesquisado: requestData.documento,
                error_message: errorMsg
            });

            return {
                origem: fonteKey,
                status: 'ERRO',
                mensagem: errorMsg
            };
        }
    }
}

module.exports = new CertificateService();
