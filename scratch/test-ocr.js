const { performSilentOcr } = require('../src/utils/silentOcr');

async function testOcr() {
    console.log('Testing native silent OCR...');
    try {
        const text = await performSilentOcr();
        console.log('\n--- OCR EXTRACTED TEXT RESULT ---');
        console.log(text);
        console.log('---------------------------------\n');
        console.log('OCR Test complete.');
    } catch (e) {
        console.error('OCR Test failed with error:', e);
    }
}

testOcr();
