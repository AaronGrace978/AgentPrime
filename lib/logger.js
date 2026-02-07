/**
 * AgentPrime - Logger Module
 * Centralized logging with electron-log
 */

const log = require('electron-log');
const path = require('path');

// Configure log file location
log.transports.file.resolvePathFn = () => {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'logs', 'agentprime.log');
};

// Configure log format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.transports.console.format = '{h}:{i}:{s} [{level}] {text}';

// Set log level based on environment
log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

// Max log file size (5MB)
log.transports.file.maxSize = 5 * 1024 * 1024;

// Create scoped loggers for different modules
const createLogger = (scope) => ({
    info: (...args) => log.info(`[${scope}]`, ...args),
    warn: (...args) => log.warn(`[${scope}]`, ...args),
    error: (...args) => log.error(`[${scope}]`, ...args),
    debug: (...args) => log.debug(`[${scope}]`, ...args),
    verbose: (...args) => log.verbose(`[${scope}]`, ...args)
});

// Pre-defined scoped loggers
const loggers = {
    main: createLogger('Main'),
    ai: createLogger('AI'),
    files: createLogger('Files'),
    git: createLogger('Git'),
    agent: createLogger('Agent'),
    mirror: createLogger('Mirror'),
    templates: createLogger('Templates'),
    ipc: createLogger('IPC')
};

// Export the main log object and scoped loggers
module.exports = {
    log,
    createLogger,
    ...loggers
};
