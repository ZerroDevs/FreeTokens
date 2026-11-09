/**
 * Release bodies are Markdown. Rendering them needs a parser and a sanitiser; the panel only needs
 * readable lines, so this strips the syntax instead of interpreting it.
 */
export function plainNotes(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*+-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
