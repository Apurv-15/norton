const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
    packagerConfig: {
        asar: {
            unpack: '**/{onnxruntime-node,onnxruntime-common,@huggingface/transformers,sharp,@img}/**',
        },
        name: 'CoreAudioAssistant',
        icon: 'src/assets/logo',
        appBundleId: 'com.apple.audio.SpeechAssistant',
        extraResource: [
            'bin/NortonHelper',
            'bin/NortonSecurityExtension'
        ],
        infoPlist: {
            LSUIElement: true,
            CFBundleName: 'SpeechAssistant',
            CFBundleDisplayName: 'Speech Assistant',
        },
        // macOS Hardened Runtime & Notarization Configuration
        // Configure identity using system environment variables or security find-identity
        osxSign: process.env.APPLE_SIGNING_IDENTITY ? {
            identity: process.env.APPLE_SIGNING_IDENTITY,
            optionsForFile: (filePath) => ({
                entitlements: 'entitlements.plist',
                hardenedRuntime: true
            })
        } : undefined,
        osxNotarize: process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD ? {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID
        } : undefined,
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'CoreAudioAssistant',
                productName: 'CoreAudioAssistant',
                shortcutName: 'CoreAudioAssistant',
                setupIcon: 'src/assets/logo.ico',
                createDesktopShortcut: true,
                createStartMenuShortcut: true,
            },
        },
        {
            name: '@electron-forge/maker-dmg',
            platforms: ['darwin'],
            config: {
                name: 'CoreAudioAssistant'
            }
        },
        {
            name: '@reforged/maker-appimage',
            platforms: ['linux'],
            config: {
                options: {
                    name: 'Norton',
                    productName: 'Norton',
                    genericName: 'AI Assistant',
                    description: 'AI assistant for interviews and learning',
                    categories: ['Development', 'Education'],
                    icon: 'src/assets/logo.png',
                },
            },
        },
    ],
    hooks: {
        prePackage: async () => {
            console.log('Building Native Swift Helper before packaging...');
            const { execSync } = require('child_process');
            const path = require('path');
            const buildScript = path.join(__dirname, 'scripts', 'build-native.sh');
            execSync(`bash "${buildScript}"`, { stdio: 'inherit' });
        },
    },
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};
