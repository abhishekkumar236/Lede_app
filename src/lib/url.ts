export function hostLabel(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(url);
  return match ? match[1] : url;
}
