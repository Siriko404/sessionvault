// Opens a terminal emulator running a conversation's native resume command.
//
// Security notes:
//  - `source`/`ref` are lookup keys only. The command and directory come from
//    the server-side conversation record (our own parsers), never from
//    caller-supplied text.
//  - The terminal is launched via execFile with an args array (no shell); the
//    resume command itself runs inside the new terminal's shell, same trust
//    level as the existing agents/open endpoint.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

// Permission-bypass flags per agent, verified against the locally installed
// CLIs (--help). Sources without a verified flag get no YOLO variant.
// NOTE: codex/opencode/cline have NO --yolo flag; their equivalents differ.
const YOLO_FLAGS = {
  claude: ' --dangerously-skip-permissions',
  codex: ' --dangerously-bypass-approvals-and-sandbox',
  opencode: ' --auto',
  cline: ' --auto-approve=true',
  gemini: ' --yolo',
  copilot: ' --allow-all-tools',
};

export function yoloSources() {
  return Object.keys(YOLO_FLAGS);
}

export async function openSessionTerminal(source, ref, mode) {
  if (!source || !ref) throw new Error('missing source or ref');

  const { listConversations } = await import('./sources/index.js');
  const convos = await listConversations();
  const convo = convos.find(
    (c) => c.source === source && (c.ref === ref || c.key === ref || c.key === `${source}:${ref}`)
  );
  if (!convo) throw new Error('not found');
  if (!convo.resume) throw new Error('no resume command');

  let resume = convo.resume;
  let yolo = false;
  if (mode === 'yolo') {
    const flag = YOLO_FLAGS[source];
    if (!flag) throw new Error('no verified permission-bypass flag for this agent');
    // Insert before any trailing `# comment` so the flag is not swallowed.
    const hash = resume.indexOf(' #');
    resume = hash === -1 ? resume + flag : resume.slice(0, hash) + flag + resume.slice(hash);
    yolo = true;
  }

  let dir = os.homedir();
  try {
    if (convo.projectPath && fs.statSync(convo.projectPath).isDirectory()) {
      dir = convo.projectPath;
    }
  } catch {
    // Fall back to home; the resume command itself usually cds already.
  }

  // Keep the window open after the agent exits so output stays visible.
  const shellCmd = `${resume}; exec /bin/sh`;

  const fire = (cmd, args) => {
    const child = execFile(cmd, args, (err) => {
      void err;
    });
    child.on('error', () => {});
  };

  // foot first: it is the default terminal on this machine (Omarchy).
  const terms = [
    ['foot', ['-D', dir, '/bin/sh', '-c', shellCmd]],
    ['x-terminal-emulator', ['-e', '/bin/sh', '-c', shellCmd]],
    ['gnome-terminal', [`--working-directory=${dir}`, '--', '/bin/sh', '-c', shellCmd]],
    ['konsole', ['--workdir', dir, '-e', '/bin/sh', '-c', shellCmd]],
    ['xterm', ['-e', '/bin/sh', '-c', shellCmd]],
  ];
  for (const [cmd, args] of terms) {
    try {
      if (fs.existsSync(`/usr/bin/${cmd}`) || fs.existsSync(`/usr/local/bin/${cmd}`)) {
        fire(cmd, args);
        return { ok: true, opened: convo.key, yolo };
      }
    } catch {
      // Try the next emulator.
    }
  }
  throw new Error('no supported terminal emulator found');
}
