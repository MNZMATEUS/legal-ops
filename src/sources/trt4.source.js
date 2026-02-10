const BaseSource = require('./base-source');

class TRT4Source extends BaseSource {
    customizeFileProcessing(fileBuffer, fileType) {
        if (fileType !== 'html') {
            return fileBuffer;
        }

        let htmlContent = fileBuffer.toString('latin1');

        htmlContent = this.fixImagePaths(htmlContent);

        htmlContent = this.injectStyling(htmlContent);

        return Buffer.from(htmlContent, 'latin1');
    }

    fixImagePaths(html) {
        return html.replace(
            /src="assets\/imagens\/brasao.png"/g,
            'src="https://pje.trt4.jus.br/certidoes/assets/imagens/brasao.png"'
        );
    }

    injectStyling(html) {
        const cssTemplate = this.getCSSTemplate();

        if (html.includes('<head>')) {
            return html.replace('<head>', '<head>' + cssTemplate);
        } else {
            return cssTemplate + html;
        }
    }

    getCSSTemplate() {
        return `
            <style>
                body { font-family: 'Times New Roman', serif; line-height: 1.5; color: #000; padding: 40px; background: #525659; }
                article {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 50px;
                    background: #fff;
                    box-shadow: 0 0 15px rgba(0,0,0,0.5);
                    min-height: 900px;
                }
                header { text-align: center; margin-bottom: 40px; }

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
    }
}

module.exports = TRT4Source;
