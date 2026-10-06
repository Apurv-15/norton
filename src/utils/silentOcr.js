/**
 * Silent OCR Utility
 * Provides native macOS Vision framework (via JXA) and Windows Media OCR (via PowerShell)
 * integration for silent screen capture and background text extraction without UI flickering.
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout ? stdout.toString() : '');
            }
        });
    });
}

/**
 * Perform native macOS OCR on a given image file using Vision Framework via JXA.
 */
async function runMacOcr(imagePath) {
    // JavaScript for Automation (JXA) script to load the Vision framework and recognize text
    const jxaScript = `
        ObjC.import('Vision');
        ObjC.import('Foundation');

        function run(argv) {
            var path = argv[0];
            var url = $.NSURL.fileURLWithPath(path);
            
            var requestHandler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
            
            var textRequest = $.VNRecognizeTextRequest.alloc.init;
            textRequest.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
            
            var error = $();
            var success = requestHandler.performRequestsError($.NSArray.arrayWithObject(textRequest), error);
            
            if (!success) {
                return "OCR Error: " + error.description;
            }
            
            var results = textRequest.results;
            var text = "";
            for (var i = 0; i < results.count; i++) {
                var observation = results.objectAtIndex(i);
                var candidates = observation.topCandidates(1);
                if (candidates.count > 0) {
                    var candidate = candidates.objectAtIndex(0);
                    // In JXA, ObjC wrapped objects can be converted to standard JS primitives using the .js property
                    text += candidate.string.js + "\\n";
                }
            }
            return text;
        }
    `;

    const escapedScript = jxaScript.replace(/'/g, "'\\''");
    const cmd = `osascript -l JavaScript -e '${escapedScript}' "${imagePath}"`;
    return runCommand(cmd);
}

/**
 * Perform native Windows OCR using PowerShell and Windows.Media.Ocr.
 */
async function runWindowsOcr(imagePath) {
    const psScript = `
        [void][Windows.Security.Credentials.PasswordVault, Windows.Security.Credentials, ContentType=WindowsRuntime]
        [void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
        [void][Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]

        $imagePath = "${imagePath.replace(/\\/g, '\\\\')}"
        $file = Get-Item $imagePath
        $stream = [Windows.Storage.StorageFile]::GetFileFromPathAsync($file.FullName).GetAwaiter().GetResult().OpenAsync([Windows.Storage.FileAccessMode]::Read).GetAwaiter().GetResult()
        
        $decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()
        $softwareBitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()
        
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
        if ($null -eq $engine) {
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
        }

        if ($null -ne $engine) {
            $result = $engine.RecognizeAsync($softwareBitmap).GetAwaiter().GetResult()
            Write-Output $result.Text
        } else {
            Write-Output "OCR Engine failed to initialize."
        }
    `;

    const escapedScript = psScript.replace(/"/g, '`"');
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${escapedScript}"`;
    return runCommand(cmd);
}

async function performSilentOcr() {
    const tempImgPath = path.join(os.tmpdir(), `silent_scr_${Date.now()}.png`);
    console.log('Temporary screen capture path:', tempImgPath);

    try {
        if (process.platform === 'darwin') {
            // macOS silent screenshot capture (-x)
            await runCommand(`screencapture -x "${tempImgPath}"`);
            if (!fs.existsSync(tempImgPath)) {
                throw new Error('Screenshot file was not generated.');
            }
            const text = await runMacOcr(tempImgPath);
            return text.trim();
        } else if (process.platform === 'win32') {
            // Windows silent screenshot capture via PowerShell
            const captureScript = `
                Add-Type -AssemblyName System.Windows.Forms
                Add-Type -AssemblyName System.Drawing
                $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
                $graphics = [System.Drawing.Graphics]::FromImage($bmp)
                $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
                $bmp.Save("${tempImgPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
                $graphics.Dispose()
                $bmp.Dispose()
            `;
            await runCommand(`powershell -NoProfile -Command "${captureScript.replace(/"/g, '`"')}"`);
            if (!fs.existsSync(tempImgPath)) {
                throw new Error('Screenshot file was not generated.');
            }
            const text = await runWindowsOcr(tempImgPath);
            return text.trim();
        } else {
            throw new Error(`Platform ${process.platform} not supported for silent OCR.`);
        }
    } catch (error) {
        console.error('Silent OCR processing failed:', error);
        throw error;
    } finally {
        if (fs.existsSync(tempImgPath)) {
            try {
                fs.unlinkSync(tempImgPath);
            } catch (err) {
                console.warn('Failed to delete temporary screenshot:', err.message);
            }
        }
    }
}

async function performOcrOnBase64(base64Data) {
    const tempImgPath = path.join(os.tmpdir(), `ocr_base64_${Date.now()}.png`);
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(tempImgPath, buffer);
        if (process.platform === 'darwin') {
            const text = await runMacOcr(tempImgPath);
            return text.trim();
        } else if (process.platform === 'win32') {
            const text = await runWindowsOcr(tempImgPath);
            return text.trim();
        } else {
            throw new Error(`Platform ${process.platform} not supported for base64 OCR.`);
        }
    } finally {
        if (fs.existsSync(tempImgPath)) {
            try {
                fs.unlinkSync(tempImgPath);
            } catch (err) {}
        }
    }
}

module.exports = {
    performSilentOcr,
    performOcrOnBase64,
};
