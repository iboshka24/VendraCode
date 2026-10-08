import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ─── Monaco: bundle it locally instead of the default CDN loader ────
// `@monaco-editor/react` pulls `monaco-editor` from jsdelivr at runtime unless
// it is handed the module. Bundling it keeps the editor functional offline and
// removes a runtime CDN dependency from the packaged app.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';

// Monaco spawns its language services in a web worker; point it at the bundled one.
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
