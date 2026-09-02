export function publicUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ""), document.baseURI).href;
}
