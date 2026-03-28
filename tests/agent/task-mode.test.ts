/**
 * Tests for TaskMode detection
 */

import { detectTaskMode, TaskMode, simpleHash } from '../../src/main/agent/task-mode';

describe('detectTaskMode', () => {
  it('should detect CREATE mode for project creation requests', () => {
    const result = detectTaskMode('Create a new React app with TypeScript');
    expect(result.mode).toBe(TaskMode.CREATE);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should detect CREATE for "build me a website"', () => {
    const result = detectTaskMode('Build me a portfolio website');
    expect(result.mode).toBe(TaskMode.CREATE);
  });

  it('should detect FIX mode for bug fix requests', () => {
    const result = detectTaskMode('Fix the login bug that crashes on submit');
    expect(result.mode).toBe(TaskMode.FIX);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should detect FIX mode for error resolution', () => {
    const result = detectTaskMode('Debug this error: TypeError undefined is not a function');
    expect(result.mode).toBe(TaskMode.FIX);
  });

  it('should detect REVIEW mode for inspection requests', () => {
    const result = detectTaskMode('Review my code for security vulnerabilities');
    expect(result.mode).toBe(TaskMode.REVIEW);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should detect ENHANCE mode for feature additions', () => {
    const result = detectTaskMode('Add dark mode to the settings page');
    expect(result.mode).toBe(TaskMode.ENHANCE);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should default to CREATE for ambiguous messages', () => {
    const result = detectTaskMode('hello world');
    expect(result.mode).toBe(TaskMode.CREATE);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('should prefer CREATE when both create and fix keywords are present', () => {
    const result = detectTaskMode('Create a new app that fixes the old design');
    expect(result.mode).toBe(TaskMode.CREATE);
  });

  it('should prefer FIX when only fix keywords are present', () => {
    const result = detectTaskMode('The API is broken, please repair it');
    expect(result.mode).toBe(TaskMode.FIX);
  });
});

describe('simpleHash', () => {
  it('should return consistent hash for same input', () => {
    const hash1 = simpleHash('hello world');
    const hash2 = simpleHash('hello world');
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different input', () => {
    const hash1 = simpleHash('hello');
    const hash2 = simpleHash('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should return a hex string', () => {
    const hash = simpleHash('test');
    expect(hash).toMatch(/^-?[0-9a-f]+$/);
  });
});
