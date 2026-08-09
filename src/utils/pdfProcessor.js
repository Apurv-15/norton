const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

/**
 * Extracts text content from a PDF or plain text file.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} The extracted text.
 */
async function extractTextFromPDF(filePath) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.txt' || ext === '.md' || ext === '.text') {
            const rawText = fs.readFileSync(filePath, 'utf8');
            const trimmed = rawText.trim();
            if (!trimmed) {
                throw new Error('The selected text file is empty.');
            }
            return trimmed;
        }

        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const text = (data.text || '').trim();
        if (!text) {
            throw new Error(
                'No text could be extracted from this PDF. If it is a scanned document or image PDF, please convert it to a text-based PDF or paste text into the prompt context.'
            );
        }
        return text;
    } catch (error) {
        console.error('Error parsing document file:', error);
        throw error;
    }
}

module.exports = {
    extractTextFromPDF,
};
