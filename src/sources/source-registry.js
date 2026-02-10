const fs = require('fs');
const path = require('path');
const BaseSource = require('./base-source');

class SourceRegistry {
    constructor() {
        this.sources = new Map();
        this.sourceClasses = new Map();
        this.config = null;
    }

    loadConfiguration(configPath = null) {
        const defaultPath = path.join(__dirname, '../config/sources.json');
        const finalPath = configPath || defaultPath;

        try {
            const configData = fs.readFileSync(finalPath, 'utf8');
            this.config = JSON.parse(configData);
            console.log('[SourceRegistry] Configuration loaded successfully');
            return { success: true };
        } catch (error) {
            console.error('[SourceRegistry] Error loading configuration:', error.message);
            throw new Error(`Failed to load sources configuration: ${error.message}`);
        }
    }

    registerSourceClass(sourceId, SourceClass) {
        this.sourceClasses.set(sourceId, SourceClass);
        console.log(`[SourceRegistry] Registered source class: ${sourceId}`);
    }

    initializeSources() {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfiguration() first.');
        }

        Object.keys(this.config.sources).forEach(sourceId => {
            const sourceConfig = this.config.sources[sourceId];

            if (!sourceConfig.enabled) {
                console.log(`[SourceRegistry] Skipping disabled source: ${sourceId}`);
                return;
            }

            const SourceClass = this.sourceClasses.get(sourceId) || BaseSource;
            const sourceInstance = new SourceClass(sourceConfig);

            this.sources.set(sourceId, sourceInstance);
            console.log(`[SourceRegistry] Initialized source: ${sourceId} using ${SourceClass.name}`);
        });

        return { success: true, count: this.sources.size };
    }

    getSource(sourceId) {
        const source = this.sources.get(sourceId);
        if (!source) {
            throw new Error(`Source not found: ${sourceId}`);
        }
        return source;
    }

    hasSource(sourceId) {
        return this.sources.has(sourceId);
    }

    getAllEnabledSources() {
        return Array.from(this.sources.values());
    }

    isSourceCompatible(sourceId, documentType) {
        if (!this.hasSource(sourceId)) {
            return false;
        }

        const source = this.getSource(sourceId);
        return source.config.requirements.accepts.includes(documentType);
    }

    getSourceConfig(sourceId) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        return this.config.sources[sourceId] || null;
    }

    getGlobalConfig() {
        return this.config?.global || {};
    }
}

module.exports = new SourceRegistry();
