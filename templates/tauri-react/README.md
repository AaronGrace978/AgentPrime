# {{projectName}}

{{description}}

A modern desktop application built with Tauri 2.x, React 18, and TypeScript.

## 🚀 Tech Stack

- **Tauri 2.x** - Lightweight Rust-based desktop framework
- **React 18** - Modern UI library with hooks
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool and dev server
- **Rust** - High-performance backend

## 📋 Prerequisites

### Required Software
- [Node.js 20+](https://nodejs.org/) (LTS recommended)
- [Rust 1.70+](https://rustup.rs/) - Install via rustup

### Platform-Specific Dependencies

#### Windows
```bash
# Install Visual Studio Build Tools (if not already installed)
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Or via Chocolatey: choco install visualstudio2022buildtools
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (optional but recommended)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

## 🛠️ Getting Started

### 1. Clone and Install
```bash
# Install Node.js dependencies
npm install

# Install Rust dependencies (usually automatic)
cargo build
```

### 2. Development Mode
```bash
# Start development server with hot reload
npm run tauri:dev

# Or run frontend only
npm run dev
```

### 3. Production Build
```bash
# Build for production
npm run tauri:build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
{{projectName}}/
├── src/                      # React frontend
│   ├── main.tsx             # Application entry point
│   ├── App.tsx              # Main React component
│   └── styles.css           # Global styles
├── src-tauri/               # Tauri/Rust backend
│   ├── src/
│   │   └── main.rs          # Rust application logic
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # Tauri configuration
│   └── build.rs             # Build script
├── icons/                   # Application icons
│   ├── 32x32.png
│   ├── 128x128.png
│   ├── 128x128@2x.png
│   ├── icon.ico
│   └── icon.icns
├── index.html               # HTML template
├── package.json             # Node.js configuration
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
└── .gitignore               # Git ignore rules
```

## 🔧 Configuration

### Tauri Configuration (`src-tauri/tauri.conf.json`)
- **Security**: Content Security Policy enabled
- **Bundle**: Cross-platform build configuration
- **Plugins**: Extensible plugin system
- **Window**: Customizable window properties

### Environment Variables
Create a `.env` file for sensitive configuration:
```env
# Example environment variables
TAURI_PRIVATE_KEY=your_key_here
TAURI_SIGNING_PRIVATE_KEY=your_signing_key_here
```

## 🐛 Troubleshooting

### Common Issues

#### "Command failed: cargo build"
```bash
# Update Rust toolchain
rustup update

# Check Rust version
rustc --version
cargo --version

# Reinstall Rust if needed
rustup self uninstall
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### "WebView not found" (Linux)
```bash
# Install WebKit dependencies
sudo apt install libwebkit2gtk-4.1-dev
```

#### "Permission denied" errors
```bash
# Fix permissions on Linux/macOS
chmod +x src-tauri/src/main.rs
```

#### Windows Build Tools Issues
```bash
# Install Windows SDK and Build Tools
# Download from Microsoft: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
```

### Development Tips

- Use `npm run dev` for frontend-only development
- Use `npm run tauri:dev` for full-stack development
- Check browser console for frontend errors
- Check terminal for Rust/backend errors

### Performance Optimization

- Use `npm run build` to create optimized production builds
- Enable code splitting in Vite config
- Use Rust release builds for better performance
- Minimize bundle size by tree-shaking unused dependencies

## 🔒 Security Features

- **Content Security Policy** - Prevents XSS attacks
- **Sandboxed execution** - Isolated process security
- **Secure defaults** - Minimal permissions by default
- **Code signing ready** - Prepared for distribution

## 📦 Distribution

### Building for Distribution
```bash
# Build for all platforms
npm run tauri:build

# Build for specific platform
npm run tauri:build -- --target x86_64-pc-windows-msvc
npm run tauri:build -- --target x86_64-apple-darwin
npm run tauri:build -- --target x86_64-unknown-linux-gnu
```

### Output Location
Built applications are saved in `src-tauri/target/release/bundle/`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT - Created with AgentPrime

## 🔗 Useful Links

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Rust Documentation](https://doc.rust-lang.org/)
