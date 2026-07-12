const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * Extracts text content from a PDF file.
 * @param {string} filePath - Absolute path to the PDF file.
 * @returns {Promise<string>} The extracted text.
 */
async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        return data.text || '';
    } catch (error) {
        console.error('Error parsing PDF file:', error);
        throw error;
    }
}

module.exports = {
    extractTextFromPDF,
};
