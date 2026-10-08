import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, Check, GitCommit, Users, Zap, Shield, Sparkles, Layers, Sliders } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScriptLine {
  num: number;
  author: string;
  role: string;
  color: string;
  text: string;
  syntaxTokens: Array<{ text: string; color: string }>;
}

const LIVE_CODE_SCRIPT: ScriptLine[] = [
  {
    num: 12,
    author: 'Claude (Alice)',
    role: 'Claude Code',
    color: '#f06595',
    text: 'export async function authenticate(session: SessionToken) {',
    syntaxTokens: [
      { text: 'export ', color: '#c586c0' },
      { text: 'async ', color: '#569cd6' },
      { text: 'function ', color: '#569cd6' },
      { text: 'authenticate', color: '#dcdcaa' },
      { text: '(session: SessionToken) {', color: '#d4d4d4' }
    ]
  },
  {
    num: 13,
    author: 'Claude (Alice)',
    role: 'Claude Code',
    color: '#f06595',
    text: '  const session = await getSession(req.headers);',
    syntaxTokens: [
      { text: '  const ', color: '#569cd6' },
      { text: 'session = ', color: '#9cdcfe' },
      { text: 'await ', color: '#c586c0' },
      { text: 'getSession', color: '#dcdcaa' },
      { text: '(req.headers);', color: '#d4d4d4' }
    ]
  },
  {
    num: 14,
    author: 'Codex (Chen)',
    role: 'Codex CLI',
    color: '#4dabf7',
    text: '  if (!session?.isValid) return { refusal: "unauthorized" };',
    syntaxTokens: [
      { text: '  if ', color: '#c586c0' },
      { text: '(!session?.isValid) ', color: '#d4d4d4' },
      { text: 'return ', color: '#c586c0' },
      { text: '{ refusal: ', color: '#9cdcfe' },
      { text: '"unauthorized"', color: '#ce9178' },
      { text: ' };', color: '#d4d4d4' }
    ]
  },
  {
    num: 15,
    author: 'Claude (Alice)',
    role: 'Claude Code',
    color: '#f06595',
    text: '  return validateToken(session, { refresh: true });',
    syntaxTokens: [
      { text: '  return ', color: '#c586c0' },
      { text: 'validateToken', color: '#dcdcaa' },
      { text: '(session, { refresh: ', color: '#9cdcfe' },
      { text: 'true', color: '#569cd6' },
      { text: ' });', color: '#d4d4d4' }
    ]
  },
  {
    num: 16,
    author: 'OpenCode (You)',
    role: 'OpenCode Native',
    color: '#ffa94d',
    text: '  await syncBrainState("session/lobby-join-race", session.id);',
    syntaxTokens: [
      { text: '  await ', color: '#c586c0' },
      { text: 'syncBrainState', color: '#dcdcaa' },
      { text: '("session/lobby-join-race", session.id);', color: '#ce9178' }
    ]
  },
  {
    num: 17,
    author: 'Codex (Chen)',
    role: 'Codex CLI',
    color: '#4dabf7',
    text: '}',
    syntaxTokens: [
      { text: '}', color: '#d4d4d4' }
    ]
  }
];

function tokenizeCodeLine(text: string): Array<{ text: string; color: string }> {
  if (!text) return [];
  if (text.trim().startsWith('//') || text.trim().startsWith('#')) {
    return [{ text, color: '#6a9955' }];
  }

  const regex = /(\b(?:import|export|from|async|await|function|const|let|var|return|if|else|switch|case|class|interface|type|extends|implements|try|catch|finally|throw|new|typeof|in|of|default)\b|".*?"|'.*?'|`.*?`|[{}()[\];,]|\b\d+\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[^\s\w]+|\s+)/g;

  const tokens: Array<{ text: string; color: string }> = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const val = match[0];
    let color = '#d4d4d4';

    if (/^(?:import|export|from|async|await|function|const|let|var|return|if|else|switch|case|class|interface|type|extends|implements|try|catch|finally|throw|new|typeof|in|of|default)$/.test(val)) {
      color = '#c586c0';
    } else if (/^(".*?"|'.*?'|`.*?`)$/.test(val)) {
      color = '#ce9178';
    } else if (/^\d+$/.test(val)) {
      color = '#b5cea8';
    } else if (/^[{}()[\];,]$/.test(val)) {
      color = '#e0a336';
    } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(val)) {
      color = '#4ec9b0';
    } else if (text.slice(regex.lastIndex).trimStart().startsWith('(')) {
      color = '#dcdcaa';
    } else {
      color = '#9cdcfe';
    }

    tokens.push({ text: val, color });
  }

  if (tokens.length === 0) {
    tokens.push({ text, color: '#d4d4d4' });
  }
  return tokens;
}

function buildScriptFromContent(content: string): ScriptLine[] {
  const lines = content.split('\n');
  const agentPool = [
    { author: 'OpenCode (You)', role: 'OpenCode CLI', color: '#ffa94d' },
    { author: 'Claude (Alice)', role: 'Claude Code', color: '#f06595' },
    { author: 'Codex (Chen)', role: 'Codex Agent', color: '#4dabf7' },
    { author: 'Cline (Bob)', role: 'Cline CLI', color: '#38d9a9' },
  ];

  const script: ScriptLine[] = [];
  for (let i = 0; i < lines.length && script.length < 30; i++) {
    const raw = lines[i];
    if (!raw.trim() && script.length === 0) continue;
    const agent = agentPool[script.length % agentPool.length];
    script.push({
      num: i + 1,
      author: agent.author,
      role: agent.role,
      color: agent.color,
      text: raw,
      syntaxTokens: tokenizeCodeLine(raw),
    });
  }

  return script.length > 0 ? script : LIVE_CODE_SCRIPT;
}

export const LiveAgentStream: React.FC<{
  filename?: string;
  initialContent?: string;
  onApplyToFile?: (content: string) => void;
  onClose?: () => void;
}> = ({ filename = 'src/auth/authenticate.ts', initialContent, onApplyToFile, onClose }) => {
  const activeScript = React.useMemo(() => {
    if (initialContent && initialContent.trim().length > 10) {
      return buildScriptFromContent(initialContent);
    }
    return LIVE_CODE_SCRIPT;
  }, [initialContent]);

  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const [charOffset, setCharOffset] = useState(0);
  const [completedLines, setCompletedLines] = useState<number[]>([]);
  const [snapshotSeconds, setSnapshotSeconds] = useState(0);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('00:05');
  const [wordsPerSec, setWordsPerSec] = useState(34);

  // 5-second Git snapshot heartbeat
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setSnapshotSeconds((prev) => {
        const next = (prev + 1) % 25;
        if (next % 5 === 0) {
          const str = `00:${next < 10 ? '0' : ''}${next}`;
          setLastSavedSnapshot(str);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Bursty typing stepping (Amoeba's 90ms loop with 2-5 chars per tick and indent skipping)
  useEffect(() => {
    if (!isPlaying) return;

    const currentLine = activeScript[activeLineIdx];
    if (!currentLine) {
      // Loop after small pause
      const timeout = setTimeout(() => {
        setCompletedLines([]);
        setActiveLineIdx(0);
        setCharOffset(0);
      }, 3500);
      return () => clearTimeout(timeout);
    }

    const tickMs = Math.max(16, Math.round(85 / speedMultiplier));
    const timer = setTimeout(() => {
      // Leading indent landing in one keystroke
      const indentLen = currentLine.text.length - currentLine.text.trimStart().length;
      let nextOffset = charOffset;

      if (charOffset === 0 && indentLen > 0) {
        nextOffset = indentLen;
      } else {
        // Advance 2 to 4 characters per burst
        nextOffset += Math.floor(2 * speedMultiplier + Math.random() * 3);
      }

      if (nextOffset >= currentLine.text.length) {
        // Line completed
        setCompletedLines(prev => [...prev, currentLine.num]);
        setActiveLineIdx(prev => prev + 1);
        setCharOffset(0);
      } else {
        setCharOffset(nextOffset);
        setWordsPerSec(Math.round(28 * speedMultiplier + Math.random() * 9));
      }
    }, tickMs);

    return () => clearTimeout(timer);
  }, [isPlaying, activeLineIdx, charOffset, speedMultiplier, activeScript]);

  const activeLine = activeScript[activeLineIdx];

  const getFullCode = () => {
    return activeScript.map(l => l.text).join('\n');
  };

  return (
    <div className="flex flex-col h-full bg-[#111111] text-[#ececec] rounded-xl border border-border overflow-hidden shadow-2xl font-mono select-none">
      {/* ─── Amoeba Editor Top Bar ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161616] border-b border-border text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold text-text-primary text-xs tracking-tight">{filename}</span>
          </div>
          <span className="amoeba-chip text-[10px] text-ok border-ok/30 bg-ok/10 font-sans">
            3 agents editing concurrently
          </span>
          <span className="text-[11px] text-text-muted font-mono">
            ~{wordsPerSec} words/sec · rev 41
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 font-sans">
          {/* Speed switcher */}
          <div className="flex items-center gap-1 bg-chip p-0.5 rounded border border-border">
            {[1, 2, 4].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeedMultiplier(s)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors font-mono ${
                  speedMultiplier === s ? 'bg-pop text-popfg font-bold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="btn btn-ghost h-6 px-2 text-xs"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span>{isPlaying ? 'Pause' : 'Stream'}</span>
          </button>

          {onApplyToFile && (
            <button
              type="button"
              onClick={() => onApplyToFile(getFullCode())}
              className="btn btn-primary h-6 px-2.5 text-xs"
              title="Apply generated code to local buffer"
            >
              <Check size={12} />
              <span>Apply Code</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost h-6 px-2 text-xs"
            >
              Code View
            </button>
          )}
        </div>
      </div>

      {/* ─── Code Area with Pre-Rendered Syntax & Amoeba Cursors ─── */}
      <div className="flex-1 p-4 overflow-y-auto space-y-1.5 text-[13px] leading-relaxed bg-[#0c0d0e]">
        {/* Context header */}
        <div className="flex gap-4 text-text-hint text-xs">
          <span className="w-7 text-right select-none opacity-30">10</span>
          <span className="text-[#6a9955]">// Amoeba Multiplayer Session: session/lobby-join-race</span>
        </div>
        <div className="flex gap-4 text-text-hint text-xs">
          <span className="w-7 text-right select-none opacity-30">11</span>
          <span>
            <span className="text-[#c586c0]">import</span> <span className="text-[#9cdcfe]">{"{ getSession, validateToken }"}</span> <span className="text-[#c586c0]">from</span> <span className="text-[#ce9178]">'./session'</span>;
          </span>
        </div>

        {/* Live Typing Lines */}
        {activeScript.map((line, idx) => {
          const isCompleted = completedLines.includes(line.num);
          const isCurrentlyTyping = activeLine && activeLine.num === line.num;

          if (isCompleted) {
            return (
              <div 
                key={line.num} 
                className="flex gap-4 items-center relative rounded px-2 py-0.5 transition-colors group"
                style={{ 
                  backgroundColor: `${line.color}12`,
                  boxShadow: `inset 2px 0 0 ${line.color}`
                }}
              >
                <span className="w-7 text-right select-none text-text-muted text-xs">{line.num}</span>
                <span className="text-text-primary whitespace-pre">
                  {line.syntaxTokens.map((t, i) => (
                    <span key={i} style={{ color: t.color }}>{t.text}</span>
                  ))}
                </span>
                <span 
                  className="ml-auto text-[9.5px] font-sans font-semibold px-1.5 py-0.2 rounded shrink-0 opacity-80"
                  style={{ backgroundColor: `${line.color}25`, color: line.color }}
                >
                  ✓ {line.author}
                </span>
              </div>
            );
          }

          if (isCurrentlyTyping) {
            const revealedText = line.text.substring(0, charOffset);
            return (
              <div 
                key={line.num} 
                className="flex gap-4 items-center relative rounded px-2 py-0.5 shadow-sm transition-all"
                style={{ 
                  backgroundColor: `${line.color}20`,
                  boxShadow: `inset 3px 0 0 ${line.color}`
                }}
              >
                <span className="w-7 text-right select-none font-bold text-xs" style={{ color: line.color }}>
                  {line.num}
                </span>
                <div className="flex items-center relative whitespace-pre text-text-primary font-mono">
                  <span>{revealedText}</span>

                  {/* Amoeba Caret with Attached Name Badge */}
                  <div 
                    className="inline-flex items-center ml-0.5"
                    style={{ willChange: 'transform' }}
                  >
                    {/* Blinking Caret */}
                    <span 
                      className="w-0.5 h-4 inline-block mr-1"
                      style={{ backgroundColor: line.color }}
                    />
                    {/* Attached Name Pill */}
                    <span 
                      className="px-1.5 py-0.2 rounded text-[9.5px] font-sans font-bold shadow-md tracking-tight -mt-4 animate-bounce"
                      style={{ backgroundColor: line.color, color: '#0a0a0a' }}
                    >
                      {line.author}
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // Not yet reached line
          return (
            <div key={line.num} className="flex gap-4 text-text-hint opacity-30 text-xs">
              <span className="w-7 text-right select-none">{line.num}</span>
              <span></span>
            </div>
          );
        })}
      </div>

      {/* ─── Amoeba Git Snapshots 5-Second Bar ─── */}
      <div className="p-3 bg-[#141414] border-t border-border font-sans">
        <div className="flex items-center justify-between text-[10px] text-text-muted mb-2 tracking-wider uppercase font-semibold">
          <span className="flex items-center gap-1.5">
            <GitCommit size={13} className="text-ok" />
            GIT SNAPSHOTS · Every 5 seconds
          </span>
          <span className="font-mono text-ok flex items-center gap-1 text-[11px]">
            <span className="dotpulse" />
            Last snapshot saved: {lastSavedSnapshot}
          </span>
        </div>

        {/* Scanning Timeline Bar */}
        <div className="relative flex items-center justify-between px-4 py-2.5 bg-[#1b1b1b] rounded-lg border border-border/80">
          {[0, 5, 10, 15, 20].map((tick, i) => {
            const isReached = snapshotSeconds >= tick;
            return (
              <div key={i} className="flex flex-col items-center gap-1 relative z-10">
                <span className={`w-2.5 h-2.5 rounded-full border transition-all ${
                  isReached 
                    ? 'bg-ok border-ok shadow-[0_0_8px_rgba(55,211,155,0.9)] scale-110' 
                    : 'bg-chip border-border text-text-muted'
                }`} />
                <span className={`text-[10px] font-mono ${isReached ? 'text-ok font-bold' : 'text-text-muted'}`}>
                  00:{tick < 10 ? '0' : ''}{tick}
                </span>
              </div>
            );
          })}

          {/* Sweeping Signal Animation */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 left-5 h-0.5 bg-gradient-to-r from-ok to-transparent transition-all duration-300 pointer-events-none"
            style={{ width: `${Math.min(100, (snapshotSeconds / 20) * 88)}%` }}
          />
        </div>

        {/* Sync Summary Result */}
        <div className="flex items-center justify-between mt-2 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1.5 text-ok font-semibold">
            ✓ Team up to date · Zero conflicts
          </span>
          <span className="amoeba-chip text-[10px] font-mono">
            Git shadow refs · worktree isolated
          </span>
        </div>
      </div>
    </div>
  );
};
