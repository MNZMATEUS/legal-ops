class BaseSource {
    constructor(config) {
        this.config = config;
        this.id = config.id;
        this.name = config.name;
    }

    validateRequirements(requestData, documentType) {
        const reqs = this.config.requirements;

        if (!reqs.accepts.includes(documentType)) {
            return {
                valid: false,
                error: `Source ${this.id} does not accept ${documentType}`
            };
        }

        if (reqs.requiresName && !requestData.nome) {
            return {
                valid: false,
                error: 'Nome é obrigatório para esta fonte'
            };
        }

        if (reqs.requiresBirthdate && !requestData.data_nascimento) {
            return {
                valid: false,
                error: 'Data de nascimento é obrigatória para esta fonte'
            };
        }

        return { valid: true };
    }

    buildApiParameters(requestData, documentType, token) {
        const params = { token, timeout: this.config.api.timeout };
        const paramConfig = this.config.parameters;

        Object.keys(paramConfig).forEach(key => {
            const template = paramConfig[key];

            if (template === '{{token}}') {
                params[key] = token;
            } else if (template === '{{cpf}}' && documentType === 'CPF') {
                params[key] = requestData.documento;
            } else if (template === '{{cnpj}}' && documentType === 'CNPJ') {
                params[key] = requestData.documento;
            } else if (template === '{{nome}}') {
                params[key] = requestData.nome;
            } else if (template === '{{data_nascimento}}') {
                params[key] = requestData.data_nascimento;
            } else if (template === '{{birthdate}}') {
                params[key] = requestData.data_nascimento;
            } else if (template === '{{nome_mae}}') {
                params[key] = requestData.nome_mae;
            }
        });

        if (this.config.conditionalParameters) {
            Object.keys(this.config.conditionalParameters).forEach(key => {
                const condition = this.config.conditionalParameters[key];

                if (condition.condition === 'documentType === \'CPF\'' && documentType === 'CPF') {
                    if (requestData.nome && !params[key]) {
                        params[key] = requestData.nome;
                    }
                }
            });
        }

        return params;
    }

    customizeFileProcessing(fileBuffer, fileType) {
        return fileBuffer;
    }

    getMetadata() {
        return {
            id: this.id,
            name: this.name,
            accepts: this.config.requirements.accepts
        };
    }
}

module.exports = BaseSource;
