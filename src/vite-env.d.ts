/// <reference types="vite/client" />

// Vite worker imports (used to bundle Monaco's language service worker).
// tsconfig includes only `src`, so the declaration lives here.
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
