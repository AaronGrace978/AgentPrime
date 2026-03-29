const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './src/renderer/js/app.ts',
  target: 'web',  // Use 'web' instead of 'electron-renderer' for better compatibility
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: /src/,
        use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.renderer.json' } }]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Polyfill global for monaco-lsp-client
      'global': require.resolve('global/')
    },
    fallback: {
      // Node.js polyfills for browser
      'path': false,
      'fs': false,
      'util': false,
      'stream': false,
      'buffer': require.resolve('buffer/')
    }
  },
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'js/app.js'
  },
  plugins: [
    // Polyfill for Node.js globals in browser context
    new webpack.ProvidePlugin({
      global: 'global',
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new webpack.DefinePlugin({
      'global': 'globalThis',
    }),
    new HtmlWebpackPlugin({
      template: './renderer/index.html',
      filename: 'index.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'renderer/css', to: 'css' },
        { from: 'node_modules/monaco-editor/min', to: 'monaco-editor/min' }
      ]
    })
  ],
  devtool: 'source-map'
};
