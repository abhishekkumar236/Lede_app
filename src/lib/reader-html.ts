import type { Palette } from '@/theme/tokens';

export function buildReaderDocument(input: {
  title: string;
  content: string | null;
  colors: Palette;
  topPadding: number;
  bottomPadding: number;
}): string {
  const body = input.content ?? '<p class="empty">This feed only provides a headline. Open the original to read it.</p>';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3" />
<style>
  :root { color-scheme: light dark; }
  html, body {
    margin: 0;
    padding: ${input.topPadding}px 20px ${input.bottomPadding}px;
    background: transparent;
    color: ${input.colors.text};
    font-family: -apple-system, Roboto, system-ui, sans-serif;
    font-size: 17px;
    line-height: 1.62;
    -webkit-text-size-adjust: 100%;
    overflow-wrap: break-word;
  }
  h1 { font-size: 26px; line-height: 1.25; margin: 8px 0 20px; }
  h2, h3, h4 { line-height: 1.3; margin: 28px 0 10px; }
  p { margin: 0 0 18px; }
  a { color: ${input.colors.accent}; text-decoration: none; }
  img, video, figure { max-width: 100%; height: auto; margin: 0 0 18px; border-radius: 12px; }
  figure { margin-inline: 0; }
  figcaption { font-size: 13px; color: ${input.colors.textFaint}; margin-top: -10px; }
  blockquote {
    margin: 0 0 18px;
    padding: 2px 0 2px 16px;
    border-left: 3px solid ${input.colors.accent};
    color: ${input.colors.textMuted};
  }
  pre {
    background: ${input.colors.surfaceAlt};
    padding: 14px;
    border-radius: 12px;
    overflow-x: auto;
    font-size: 14px;
    line-height: 1.5;
  }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 14px; }
  :not(pre) > code {
    background: ${input.colors.surfaceAlt};
    padding: 2px 6px;
    border-radius: 6px;
  }
  table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 15px; display: block; overflow-x: auto; }
  th, td { border: 1px solid ${input.colors.divider}; padding: 8px 10px; text-align: left; }
  hr { border: none; border-top: 1px solid ${input.colors.divider}; margin: 28px 0; }
  ul, ol { margin: 0 0 18px; padding-left: 22px; }
  li { margin-bottom: 8px; }
  .empty { color: ${input.colors.textMuted}; font-style: italic; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
