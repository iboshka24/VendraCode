import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function TerminalPanel() {
  const { isTerminalOpen, toggleTerminal, workspacePath } = useAppStore();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const initialized = useRef(false);

  const initTerminal = useCallback(async () => {
    if (!termRef.current || initialized.current) return;
    initialized.current = true;

    try {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      // @ts-ignore
      await import('xterm/css/xterm.css');

      const term = new Terminal({
        theme: {
          background: '#0e0e0e',
          foreground: '#ececec',
          cursor: '#ececec',
          cursorAccent: '#0e0e0e',
          selectionBackground: 'rgba(124, 58, 237, 0.4)',
          black: '#1b1b1b',
          red: '#e5484d',
          green: '#37d39b',
          yellow: '#e0a336',
          blue: '#4dabf7',
          magenta: '#b197fc',
          cyan: '#38d9a9',
          white: '#ececec',
          brightBlack: '#4a4a4a',
          brightRed: '#ff6369',
          brightGreen: '#63f1be',
          brightYellow: '#f5b84d',
          brightBlue: '#70bcf9',
          brightMagenta: '#c5b0fd',
          brightCyan: '#6ef4cd',
          brightWhite: '#ffffff',
        },
        fontFamily: '"Geist Mono", "JetBrains Mono", Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 1.45,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect to Electron terminal
      if (window.vendraAPI) {
        window.vendraAPI.terminal.start(workspacePath || undefined);

        const removeData = window.vendraAPI.terminal.onData((data) => {
          term.write(data);
        });

        const removeExit = window.vendraAPI.terminal.onExit((code) => {
          term.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`);
        });

        term.onData((data) => {
          window.vendraAPI.terminal.sendInput(data);
        });

        cleanupRef.current = () => {
          removeData();
          removeExit();
        };
      } else {
        term.writeln('\x1b[38;2;56;217;169m╭──────────────────────────────────────────────╮\x1b[0m');
        term.writeln('\x1b[38;2;56;217;169m│  \x1b[1;37mVendraCode Terminal · Amoeba Native Harness\x1b[0m \x1b[38;2;56;217;169m│\x1b[0m');
        term.writeln('\x1b[38;2;56;217;169m│  \x1b[38;2;160;160;160mInteractive PTY session connected to Brain\x1b[0m  \x1b[38;2;56;217;169m│\x1b[0m');
        term.writeln('\x1b[38;2;56;217;169m╰──────────────────────────────────────────────╯\x1b[0m');
        term.writeln('');
      }

      const syncResize = () => {
        try {
          fitAddon.fit();
          if (window.vendraAPI?.terminal?.resize && term.cols && term.rows) {
            window.vendraAPI.terminal.resize(term.cols, term.rows);
          }
        } catch {}
      };

      setTimeout(syncResize, 50);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        syncResize();
      });
      resizeObserver.observe(termRef.current);

      return () => {
        resizeObserver.disconnect();
        term.dispose();
      };
    } catch (err) {
      console.error('Failed to initialize terminal:', err);
    }
  }, [workspacePath]);

  useEffect(() => {
    if (isTerminalOpen) {
      const timer = setTimeout(initTerminal, 100);
      return () => clearTimeout(timer);
    }
    return () => {
      cleanupRef.current?.();
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      initialized.current = false;
    };
  }, [isTerminalOpen, initTerminal]);

  return (
    <AnimatePresence>
      {isTerminalOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 210, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="border-t border-border bg-bgside flex flex-col overflow-hidden select-none"
        >
          {/* Terminal Header */}
          <div className="flex items-center justify-between h-7 px-3 bg-bgtitle border-b border-border shrink-0">
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="px-2 py-0.5 text-text-primary font-bold border-b border-pop">
                TERMINAL
              </span>
              <span className="px-2 py-0.5 text-text-hint hover:text-text-secondary cursor-pointer">
                PROBLEMS
              </span>
              <span className="px-2 py-0.5 text-text-hint hover:text-text-secondary cursor-pointer">
                COORDINATION LOGS
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-ghost h-5 w-5 p-0"
                onClick={toggleTerminal}
                title="Hide Terminal"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Terminal Content */}
          <div ref={termRef} className="flex-1 min-h-0 bg-bgside p-1" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
