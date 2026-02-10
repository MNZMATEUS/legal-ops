function cleanDocument(documento) {
    return documento.replace(/\D/g, '');
}

function getDocumentType(documento) {
    const docLimpo = cleanDocument(documento);
    return docLimpo.length > 11 ? 'CNPJ' : 'CPF';
}

function cleanString(str) {
    return str ? str.trim().toUpperCase() : null;
}

module.exports = {
    cleanDocument,
    getDocumentType,
    cleanString
};
