import { createPrompter } from '../cli/prompter.js';

// The menu may already have opened a prompt; a run opens one only when it has to ask.
export function askInSession(session, question) {
  session.prompt ??= createPrompter();

  return session.prompt.ask(question);
}

export const canAsk = (session) => Boolean(session.prompt) || Boolean(process.stdin.isTTY);

export function closePrompt(session) {
  session.prompt?.close();
}
