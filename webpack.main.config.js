const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    main: './src/main/main.ts',
    preload: './src/main/preload.ts'
  },
  target: 'electron-main',
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: /src/,
        use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.main.json', transpileOnly: true } }]
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: '[name].js'
  },
  node: {
    __dirname: false,
    __filename: false
  },
  externals: {
    'electron': 'commonjs electron',
    'electron-log': 'commonjs electron-log',
    '@sentry/electron/main': 'commonjs @sentry/electron/main',
    'onnxruntime-node': 'commonjs onnxruntime-node',
    'sharp': 'commonjs sharp',
    'keytar': 'commonjs keytar',
    // Optional ws dependencies - not needed, ws works fine without them
    'bufferutil': 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    // Matrix mode optional dependencies - loaded dynamically at runtime
    'playwright': 'commonjs playwright',
    'playwright-core': 'commonjs playwright-core',
    'chromium-bidi': 'commonjs chromium-bidi',
    'better-sqlite3': 'commonjs better-sqlite3',
    'discord.js': 'commonjs discord.js',
    '@whiskeysockets/baileys': 'commonjs @whiskeysockets/baileys',
    '@picovoice/porcupine-node': 'commonjs @picovoice/porcupine-node',
    'whisper-node': 'commonjs whisper-node',
    // Document parsing - has dynamic requires
    'pdf-parse': 'commonjs pdf-parse',
    '@vscode/ripgrep': 'commonjs @vscode/ripgrep',
    'typescript': 'commonjs typescript'
  },
  devtool: 'source-map'
};
