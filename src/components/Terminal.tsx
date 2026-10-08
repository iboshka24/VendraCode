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
      // Dynamic import of CSS
      // @ts-ignore
      await import('xterm/css/xterm.css');

      const term = new Terminal({
        theme: {
          background: '#0d1117',
          foreground: '#e6edf3',
          cursor: '#e6edf3',
          cursorAccent: '#0d1117',
          selectionBackground: '#7c3aed40',
          black: '#484f58',
          red: '#f85149',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#76e3ea',
          white: '#e6edf3',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#b3f0ff',
          brightWhite: '#ffffff',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
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
        // Dev mode fallback
        term.writeln('\x1b[36m╭──────────────────────────────────────╮\x1b[0m');
        term.writeln('\x1b[36m│  \x1b[1;37mVendraCode Terminal\x1b[0m\x1b[36m                 │\x1b[0m');
        term.writeln('\x1b[36m│  \x1b[33mRunning in browser dev mode\x1b[0m\x1b[36m         │\x1b[0m');
        term.writeln('\x1b[36m│  \x1b[2mTerminal available in Electron\x1b[0m\x1b[36m      │\x1b[0m');
        term.writeln('\x1b[36m╰──────────────────────────────────────╯\x1b[0m');
        term.writeln('');
      }

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        try { fitAddon.fit(); } catch {}
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
          animate={{ height: 220, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="border-t border-border bg-background flex flex-col overflow-hidden"
        >
          {/* Terminal Header */}
          <div className="flex items-center justify-between h-8 px-2 bg-surface border-b border-border shrink-0">
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 text-xs text-text-primary border-b-2 border-primary font-medium">
                TERMINAL
              </button>
              <button className="px-3 py-1 text-xs text-text-muted hover:text-text-secondary">
                PROBLEMS
              </button>
              <button className="px-3 py-1 text-xs text-text-muted hover:text-text-secondary">
                OUTPUT
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-1 hover:bg-surface-hover rounded text-text-muted hover:text-text-primary transition"
                onClick={toggleTerminal}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Terminal Content */}
          <div ref={termRef} className="flex-1 min-h-0" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
