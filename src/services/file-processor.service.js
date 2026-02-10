const axios = require('axios');
const supabase = require('../config/database');

class FileProcessorService {
    async processFile(receiptUrl, sourceInstance, metadata) {
        try {
            const fileResponse = await axios.get(receiptUrl, { responseType: 'arraybuffer' });
            let fileBuffer = fileResponse.data;

            const { fileType, contentType } = this.detectFileType(fileBuffer);
            let extension = fileType;

            if (sourceInstance && sourceInstance.customizeFileProcessing) {
                fileBuffer = sourceInstance.customizeFileProcessing(fileBuffer, fileType);
            }

            const filePath = this.buildFilePath(metadata, extension);

            const uploadResult = await this.uploadToStorage(
                fileBuffer,
                filePath,
                contentType,
                metadata.bucket
            );

            if (uploadResult.success) {
                const publicUrl = this.getPublicUrl(filePath, metadata.bucket);
                return {
                    success: true,
                    url: publicUrl,
                    path: filePath,
                    type: fileType
                };
            } else {
                throw new Error(uploadResult.error);
            }

        } catch (error) {
            console.error('[FileProcessorService] Error processing file:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    detectFileType(fileBuffer) {
        const headerArquivo = fileBuffer.toString('latin1', 0, 100).toLowerCase();

        if (headerArquivo.startsWith('%pdf')) {
            return {
                fileType: 'pdf',
                contentType: 'application/pdf'
            };
        } else {
            return {
                fileType: 'html',
                contentType: 'text/html; charset=latin1'
            };
        }
    }

    buildFilePath(metadata, extension) {
        const { user_id, batch_id, source } = metadata;
        const timestamp = Date.now();
        return `${user_id}/${batch_id}/${source}_${timestamp}.${extension}`;
    }

    async uploadToStorage(fileBuffer, filePath, contentType, bucket = 'arquivos-teste') {
        const { error } = await supabase.storage
            .from(bucket)
            .upload(filePath, fileBuffer, {
                contentType: contentType,
                upsert: true
            });

        if (error) {
            console.error('[FileProcessorService] Upload error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    }

    getPublicUrl(filePath, bucket = 'arquivos-teste') {
        const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return data.publicUrl;
    }
}

module.exports = new FileProcessorService();
