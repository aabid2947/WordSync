// Vite `?raw` imports return the file contents as a string.
declare module '*.txt?raw' {
  const content: string;
  export default content;
}
