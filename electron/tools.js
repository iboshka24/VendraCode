const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Hermes-grade Web Search using DuckDuckGo Lite
 */
function webSearch(query, limit = 8) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query);
    const cmd = `curl -sL -A "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0" "https://lite.duckduckgo.com/lite/" --data-urlencode "q=${query}"`;

    exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 }, (error, stdout) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }

      const results = [];
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;

      const links = [...stdout.matchAll(linkRegex)];
      const snippets = [...stdout.matchAll(snippetRegex)];

      for (let i = 0; i < Math.min(links.length, limit); i++) {
        let rawUrl = links[i][1];
        // Clean redirect URLs if any
        if (rawUrl.includes('duckduckgo.com/l/?uddg=')) {
          const match = rawUrl.match(/uddg=([^&]+)/);
          if (match) rawUrl = decodeURIComponent(match[1]);
        }

        results.push({
          url: rawUrl,
          title: links[i][2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim(),
          snippet: snippets[i]
            ? snippets[i][1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim()
            : '',
        });
      }

      resolve(results);
    });
  });
}

/**
 * Fetch and extract clean text/markdown from any URL
 */
function fetchUrl(url, maxLength = 8000) {
  return new Promise((resolve) => {
    const cmd = `curl -sL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" "${url}"`;

    exec(cmd, { maxBuffer: 15 * 1024 * 1024, timeout: 20000 }, (error, stdout) => {
      if (error || !stdout) {
        resolve({ error: error ? error.message : 'Empty response', content: '' });
        return;
      }

      let content = stdout;

      // Extract title
      const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Strip non-content blocks
      content = content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');

      // Basic HTML to Markdown formatting
      content = content
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n* $1')
        .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
        .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
        .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();

      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + '\n\n... [Content truncated]';
      }

      resolve({ title, content, url });
    });
  });
}

/**
 * Computer-Use: Take Desktop Screenshot (using import or scrot)
 */
function takeScreenshot(workspacePath) {
  return new Promise((resolve) => {
    const targetDir = path.join(workspacePath || os.tmpdir(), '.vendracode', 'screenshots');
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch {}

    const filename = `screen-${Date.now()}.png`;
    const filepath = path.join(targetDir, filename);

    // Try import (ImageMagick) or scrot
    const cmd = `import -window root "${filepath}" 2>/dev/null || scrot "${filepath}" 2>/dev/null || echo "failed"`;

    exec(cmd, { timeout: 10000 }, (error, stdout) => {
      if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1000) {
        resolve({
          success: true,
          path: filepath,
          filename,
          message: `Screenshot captured successfully at ${filepath}`,
        });
      } else {
        resolve({
          success: false,
          error: 'Screenshot capture requires an active X11/Wayland display with ImageMagick or scrot installed.',
        });
      }
    });
  });
}

/**
 * Computer-Use: Get Detailed System & Environment Info
 */
function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);

  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    hostname: os.hostname(),
    cpuModel: cpus[0] ? cpus[0].model : 'Unknown',
    cpuCores: cpus.length,
    totalMemoryGB: totalMem,
    freeMemoryMB: freeMem,
    uptimeHours: (os.uptime() / 3600).toFixed(1),
    homeDir: os.homedir(),
    shell: process.env.SHELL || '/bin/bash',
  };
}

module.exports = {
  webSearch,
  fetchUrl,
  takeScreenshot,
  getSystemInfo,
};
