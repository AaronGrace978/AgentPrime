/**
 * AgentPrime - Jest Test Setup
 * Runs before all tests
 */

// Increase timeout for slower operations
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    // Keep error and warn for important messages
    error: jest.fn(),
    warn: jest.fn(),
    // Silence log and info
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
};

// Mock Electron modules
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/mock/path'),
        whenReady: jest.fn().mockResolvedValue(true),
        on: jest.fn()
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
        loadFile: jest.fn(),
        on: jest.fn(),
        webContents: {
            send: jest.fn()
        }
    })),
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn()
    },
    dialog: {
        showOpenDialog: jest.fn(),
        showSaveDialog: jest.fn(),
        showMessageBox: jest.fn()
    }
}), { virtual: true });

// Global test utilities
global.testUtils = {
    /**
     * Create a mock workspace path
     */
    mockWorkspacePath: '/test/workspace',

    /**
     * Create a mock file system structure
     */
    createMockFs: (files = {}) => {
        const fs = require('fs');
        const mockFiles = new Map(Object.entries(files));

        fs.existsSync = jest.fn((path) => mockFiles.has(path));
        fs.readFileSync = jest.fn((path) => {
            if (mockFiles.has(path)) {
                return mockFiles.get(path);
            }
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        });
        fs.writeFileSync = jest.fn((path, content) => {
            mockFiles.set(path, content);
        });
        fs.mkdirSync = jest.fn();
        fs.rmSync = jest.fn();
        fs.readdirSync = jest.fn().mockReturnValue([]);

        return mockFiles;
    }
};
