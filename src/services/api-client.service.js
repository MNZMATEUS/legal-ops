const axios = require('axios');

class ApiClientService {
    async callApi(url, parameters) {
        try {
            console.log(`[ApiClientService] Calling API: ${url}`);

            const response = await axios.post(url, parameters);
            const resInfo = response.data;

            if (resInfo.code !== 200) {
                throw new Error(resInfo.code_message || 'API returned non-200 code');
            }

            return {
                success: true,
                data: resInfo
            };

        } catch (error) {
            const errorMsg = error.response?.data?.code_message || error.message;
            console.error('[ApiClientService] API call failed:', errorMsg);

            return {
                success: false,
                error: errorMsg
            };
        }
    }

    validateResponse(response) {
        if (!response || typeof response !== 'object') {
            return { valid: false, error: 'Invalid response format' };
        }

        if (response.code !== 200) {
            return {
                valid: false,
                error: response.code_message || 'API error'
            };
        }

        return { valid: true };
    }
}

module.exports = new ApiClientService();
