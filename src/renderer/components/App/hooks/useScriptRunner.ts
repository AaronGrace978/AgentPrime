/**
 * useScriptRunner - Hook for running and managing script execution
 */

import { useState, useEffect, useCallback } from 'react';
import { FileItem, RunOutput } from '../types';

interface UseScriptRunnerReturn {
  isRunning: boolean;
  runOutput: RunOutput[];
  terminalVisible: boolean;
  setTerminalVisible: (visible: boolean) => void;
  runScript: (selectedFile: FileItem | null) => Promise<void>;
  killScript: () => void;
  clearOutput: () => void;
}

export function useScriptRunner(): UseScriptRunnerReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<RunOutput[]>([]);
  const [terminalVisible, setTerminalVisible] = useState(false);

  // Set up script execution listeners
  useEffect(() => {
    if (window.agentAPI.onScriptOutput) {
      window.agentAPI.onScriptOutput((data: any) => {
        setRunOutput(prev => [...prev, { type: data.type, text: data.data }]);
      });
    }

    if (window.agentAPI.onScriptExit) {
      window.agentAPI.onScriptExit((data: any) => {
        setIsRunning(false);
        setRunOutput(prev => [...prev, {
          type: 'system',
          text: `\n--- Process exited with code ${data.code} ---\n`
        }]);
      });
    }

    if (window.agentAPI.onScriptError) {
      window.agentAPI.onScriptError((data: any) => {
        setIsRunning(false);
        console.error('Script error:', data.error);
      });
    }

    return () => {
      if (window.agentAPI.removeScriptOutput) window.agentAPI.removeScriptOutput();
      if (window.agentAPI.removeScriptExit) window.agentAPI.removeScriptExit();
      if (window.agentAPI.removeScriptError) window.agentAPI.removeScriptError();
    };
  }, []);

  // Run script
  const runScript = useCallback(async (selectedFile: FileItem | null) => {
    if (!selectedFile || isRunning) return;
    setRunOutput([]);
    setIsRunning(true);
    setTerminalVisible(true);

    try {
      if (window.agentAPI.runScript) {
        const result = await window.agentAPI.runScript(selectedFile.path);
        if (!result.success) {
          setIsRunning(false);
          console.error(result.error || 'Failed to run script');
        }
      } else if (window.agentAPI.runCommand) {
        const ext = selectedFile.name.split('.').pop()?.toLowerCase();
        let command = '';
        
        if (ext === 'js') command = `node "${selectedFile.path}"`;
        else if (ext === 'py') command = `python "${selectedFile.path}"`;
        else if (ext === 'ts') command = `npx ts-node "${selectedFile.path}"`;
        else {
          setIsRunning(false);
          console.error(`Cannot run .${ext} files`);
          return;
        }

        const result = await window.agentAPI.runCommand(command);
        setIsRunning(false);
        
        if (result.stdout) {
          setRunOutput(prev => [...prev, { type: 'stdout', text: result.stdout }]);
        }
        if (result.stderr) {
          setRunOutput(prev => [...prev, { type: 'stderr', text: result.stderr }]);
        }
      } else {
        setIsRunning(false);
        console.error('Script execution not available');
      }
    } catch (err: any) {
      setIsRunning(false);
      console.error(`Error running script: ${err.message}`);
    }
  }, [isRunning]);

  // Kill script
  const killScript = useCallback(() => {
    setIsRunning(false);
    console.log('Stopped execution');
  }, []);

  // Clear output
  const clearOutput = useCallback(() => {
    setRunOutput([]);
  }, []);

  return {
    isRunning,
    runOutput,
    terminalVisible,
    setTerminalVisible,
    runScript,
    killScript,
    clearOutput
  };
}

export default useScriptRunner;

