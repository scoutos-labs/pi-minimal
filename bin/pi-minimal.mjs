#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, cwd, exit, stdout, stderr } from "node:process";
import {
  intro,
  outro,
  log,
  note,
  confirm as clackConfirm,
  isCancel,
  cancel as clackCancel,
} from "@clack/prompts";

// ---------------------------------------------------------------------------
// Catalog — exactly what pi-minimal installs, nothing more
// ---------------------------------------------------------------------------
const PACKAGES = [
  {
    id: "memory",
    source: "npm:pi-memory-md",
    description: "Markdown-backed persistent memory",
    hint: "Persist facts, goals, and context across sessions as Markdown.",
  },
  {
    id: "autoresearch",
    source: "git:github.com/davebcn87/pi-autoresearch@5a29db080131449edc6d25a6b351b12879063366",
    description: "Autonomous research + experiment loop",
    hint: "Long-running autonomous loop: try → benchmark → keep → repeat.",
  },
];

// ---------------------------------------------------------------------------
// Provider env vars for auth detection + next-steps guidance
// ---------------------------------------------------------------------------
const PROVIDERS = [
  { key: "ANTHROPIC_API_KEY",  name: "Anthropic (Claude)",  example: "claude-3-5-sonnet-20241022" },
  { key: "OPENAI_API_KEY",     name: "OpenAI (GPT-4o)",     example: "gpt-4o" },
  { key: "GROQ_API_KEY",       name: "Groq (fast/cheap)",   example: "llama-3.3-70b-versatile" },
  { key: "CEREBRAS_API_KEY",   name: "Cerebras (fastest)",  example: "llama3.1-70b" },
  { key: "OPENROUTER_API_KEY", name: "OpenRouter",          example: "openai/gpt-4o" },
  { key: "GOOGLE_API_KEY",     name: "Google (Gemini)",     example: "gemini-2.0-flash" },
  { key: "MISTRAL_API_KEY",    name: "Mistral",             example: "mistral-large-latest" },
];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const isTTY = Boolean(stdout.isTTY);
const c = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold  = c("1");
const dim   = c("2");
const red   = c("31");
const green = c("32");
const yellow = c("33");
const cyan  = c("36");

function renderLogo() {
  const B = (s) => (isTTY ? `\x1b[1;97m${s}\x1b[0m` : s);
  const D = (s) => cyan(s);
  return [
    "",
    "        " + B("  _ ")  + "     " + D("minimal"),
    "        " + B(" |_)") + "  " + D("·"),
    "        " + B(" |  ") + "  " + D("memory + autoresearch"),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const KNOWN_COMMANDS = new Set(["install", "status", "doctor", "update"]);

function parseArgs(args) {
  const flags = { command: "install", yes: false, help: false, local: false };
  let i = 0;
  if (args[0] && KNOWN_COMMANDS.has(args[0])) { flags.command = args[0]; i = 1; }
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === "-y" || a === "--yes")   flags.yes   = true;
    else if (a === "-l" || a === "--local") flags.local = true;
    else if (a === "-h" || a === "--help") flags.help  = true;
    else { console.error(red(`Unknown argument: ${a}`)); flags.help = true; break; }
  }
  return flags;
}

function printHelp() {
  console.log(`${bold("pi-minimal")} — minimal Pi agent setup

${bold("Usage:")}
  npx @scoutos-labs/pi-minimal [command] [options]

${bold("Commands:")}
  install   Install Pi + memory + autoresearch (default)
  status    Show which packages are installed
  doctor    Check environment health
  update    Re-install any missing packages and run \`pi update\`

${bold("Options:")}
  -y, --yes     Skip confirmation prompt
  -l, --local   Install into current project (.pi/settings.json)
  -h, --help    Show this help

${bold("What gets installed:")}
  pi-memory-md     Markdown-backed persistent memory
  pi-autoresearch  Autonomous research + experiment loop

${bold("Multi-provider:")}
  Pi supports Anthropic, OpenAI, Groq, Cerebras, OpenRouter, Google, Mistral.
  Set any provider env var before running \`pi\`, or run \`/login\` inside Pi.`);
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------
function settingsPath(local) {
  return local
    ? join(cwd(), ".pi", "settings.json")
    : join(homedir(), ".pi", "agent", "settings.json");
}

function readJsonSafe(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch { return null; }
}

function readInstalledSources(local) {
  const path = settingsPath(local);
  const parsed = readJsonSafe(path);
  if (!parsed) return new Set();
  const sources = new Set();
  for (const entry of parsed.packages ?? []) {
    if (typeof entry === "string") sources.add(entry);
    else if (entry?.source) sources.add(entry.source);
  }
  return sources;
}

function backupPath(path) {
  const ts = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
  return `${path}.pi-minimal.${ts}.bak`;
}

function writeSettings(local, mutate) {
  const path = settingsPath(local);
  const existing = readJsonSafe(path) ?? {};
  const changed = mutate(existing);
  if (!changed) return;
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, backupPath(path));
  writeFileSync(path, JSON.stringify(existing, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------
function detectAuth() {
  const found = [];
  const authFile = join(homedir(), ".pi", "agent", "auth.json");
  const fileAuth = readJsonSafe(authFile) ?? {};
  for (const { key, name } of PROVIDERS) {
    if (process.env[key]) found.push(`${name} (${key})`);
    else if (fileAuth[name.split(" ")[0].toLowerCase()]) found.push(`${name} (auth.json)`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hasCmd(name) {
  return spawnSync(platform() === "win32" ? "where" : "which", [name], { stdio: "ignore" }).status === 0;
}

function runPi(args, extraEnv = {}) {
  return spawnSync("pi", args, { stdio: "inherit", env: { ...process.env, ...extraEnv } }).status ?? 1;
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function abortIfCancelled(v) {
  if (isCancel(v)) { clackCancel("Aborted."); exit(0); }
  return v;
}

// ---------------------------------------------------------------------------
// ensurePi
// ---------------------------------------------------------------------------
async function ensurePi(flags) {
  if (hasCmd("pi")) return true;
  log.warn("Could not find `pi` on PATH.");
  const ok = flags.yes || abortIfCancelled(
    await clackConfirm({ message: "Install Pi now via `npm install -g @mariozechner/pi-coding-agent`?", initialValue: true })
  );
  if (!ok) { log.error("Install Pi first, then re-run."); return false; }
  log.step("Installing Pi…");
  const code = spawnSync("npm", ["install", "-g", "@mariozechner/pi-coding-agent"], { stdio: "inherit" }).status;
  if (code !== 0) {
    log.error("Failed. On some systems you may need: sudo npm install -g @mariozechner/pi-coding-agent");
    return false;
  }
  if (!hasCmd("pi")) {
    log.error("`pi` still not on PATH — open a new shell and re-run.");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------
async function cmdInstall(flags) {
  const interactive = !flags.yes && isInteractive();

  if (interactive) {
    console.log(renderLogo());
    intro(bold("pi-minimal"));
  }

  if (!(await ensurePi(flags))) return 127;

  const installed = readInstalledSources(flags.local);
  const toInstall = PACKAGES.filter((p) => !installed.has(p.source));
  const alreadyDone = PACKAGES.filter((p) =>  installed.has(p.source));
  const scope = flags.local ? "project (.pi/settings.json)" : "global (~/.pi/agent/settings.json)";
  const auth = detectAuth();

  const summary = [
    `Target:            ${scope}`,
    `Will install:      ${toInstall.length}`,
    `Already installed: ${alreadyDone.length}`,
    `Providers found:   ${auth.length > 0 ? auth.join(", ") : "none"}`,
  ].join("\n");

  if (interactive) note(summary, "Plan");
  else console.log(summary);

  if (toInstall.length === 0) {
    printCheatsheet(interactive);
    printNextSteps(auth, 0, interactive);
    return 0;
  }

  const piArgs = flags.local ? ["install", "-l"] : ["install"];
  const failed = [];

  for (const pkg of toInstall) {
    const action = `pi install ${pkg.source}`;
    if (interactive) log.step(action);
    else console.log(`\n→ ${action}`);

    const extraEnv = pkg.source.startsWith("git:") ? { npm_config_ignore_scripts: "true" } : {};
    const code = runPi([...piArgs, pkg.source], extraEnv);

    if (code !== 0) {
      failed.push(pkg);
      if (interactive) log.error(`Failed to install ${pkg.id}`);
      else console.error(red(`  ✗ failed: ${pkg.id}`));
    }
  }

  if (failed.length > 0) {
    const list = failed.map((p) => `  - ${p.id} (${p.source})`).join("\n");
    if (interactive) { note(list, "Failures"); outro(red(`Finished with ${failed.length} failure(s).`)); }
    else console.error(red(`\nFinished with ${failed.length} failure(s):\n${list}`));
    return 1;
  }

  const noteWritten = writeWelcomeNote(flags.local);
  if (noteWritten && interactive) log.info("Welcome note written → ~/.pi/agent/notes/pi-minimal-welcome.md");
  printCheatsheet(interactive);
  printNextSteps(detectAuth(), toInstall.length, interactive);
  return 0;
}

// ---------------------------------------------------------------------------
// Welcome note
// ---------------------------------------------------------------------------
function writeWelcomeNote(local) {
  const notesDir = local
    ? join(cwd(), ".pi", "notes")
    : join(homedir(), ".pi", "agent", "notes");
  const notePath = join(notesDir, "pi-minimal-welcome.md");
  if (existsSync(notePath)) return false; // only write once
  mkdirSync(notesDir, { recursive: true });

  const content = `# Welcome to pi-minimal

Pi is running with two extensions: **memory** and **autoresearch**.

---

## Memory (pi-memory-md)

Persist facts, goals, and context across sessions as Markdown files.

**How to use:**
- Tell Pi to remember something: *"Remember that our database is PostgreSQL 16 on port 5433"*
- Pi will store it in \`~/.pi/agent/memory/\` as a \`.md\` file
- On future sessions Pi will load relevant memories automatically
- You can also ask: *"What do you remember about this project?"*
- To forget something: *"Forget the database note"*

---

## Autoresearch (pi-autoresearch)

An autonomous research + experiment loop. Pi will iteratively try approaches,
benchmark them, keep the best result, and repeat — without you driving each step.

**How to use:**
- Give Pi a research goal: *"Research the fastest way to parse 1M JSON records in Node.js"*
- Or an experiment goal: *"Find the optimal chunk size for embedding this codebase"*
- Pi will run the loop autonomously, reporting progress and final findings
- You can set a budget: *"Research this for up to 10 iterations"*

---

## Multi-provider

Pi works with any LLM. Set your key before running \`pi\`:

\`\`\`
export ANTHROPIC_API_KEY=...   # Claude
export OPENAI_API_KEY=...      # GPT-4o
export OPENROUTER_API_KEY=...  # Any model via OpenRouter
export GROQ_API_KEY=...        # Fast/cheap
export GOOGLE_API_KEY=...      # Gemini
\`\`\`

Or run \`pi\` and type \`/login\` to sign in interactively.

---

Run \`npx github:scoutos-labs/pi-minimal status\` to check what's installed.
`;

  writeFileSync(notePath, content, "utf8");
  return true;
}

function printCheatsheet(interactive) {
  const lines = PACKAGES.map((p) => `${p.id.padEnd(18)} ${p.hint}`);
  if (interactive) note(lines.join("\n"), "What you've got");
  else { console.log(bold("\nInstalled:")); for (const l of lines) console.log(`  ${l}`); }
}

function printNextSteps(auth, installed, interactive) {
  const lines = [];

  if (auth.length > 0) {
    lines.push(`Providers: ${auth.join(", ")}`);
    lines.push("");
    lines.push("You're all set — run `pi` to get started.");
  } else {
    lines.push("No provider credentials detected.");
    lines.push("");
    lines.push("Set one of these env vars, then run `pi`:");
    lines.push("");
    for (const { key, name, example } of PROVIDERS) {
      lines.push(`  export ${key}=<your-key>   # ${name}`);
    }
    lines.push("");
    lines.push("Or run `pi` and type `/login` to sign in with a Claude/ChatGPT/Copilot subscription.");
  }

  const title = installed > 0 ? `Installed ${installed} package(s) — next steps` : "Next steps";
  if (interactive) { note(lines.join("\n"), title); outro(green("Done.")); }
  else { console.log(bold(`\n${title}:`)); console.log(lines.join("\n")); }
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
function cmdStatus(flags) {
  const installed = readInstalledSources(flags.local);
  const path = settingsPath(flags.local);
  console.log(`Settings: ${bold(path)}`);
  if (!existsSync(path)) {
    console.log(yellow("  (not found — Pi has not been run yet)"));
  }
  console.log("");
  for (const pkg of PACKAGES) {
    const ok = installed.has(pkg.source);
    console.log(`  ${ok ? green("✓") : dim("·")} ${pkg.id.padEnd(18)} ${ok ? "" : dim("not installed")}`);
  }
  console.log("");
  const auth = detectAuth();
  if (auth.length > 0) console.log(`Providers: ${green(auth.join(", "))}`);
  else console.log(yellow("Providers: none detected — set a provider env var or run `pi /login`"));
  return 0;
}

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------
function cmdDoctor(flags) {
  let problems = 0;
  const pass = (m) => console.log(`  ${green("✓")} ${m}`);
  const warn = (m) => { console.log(`  ${yellow("!")} ${m}`); problems++; };
  const fail = (m) => { console.log(`  ${red("✗")} ${m}`); problems++; };

  console.log(bold("\nEnvironment"));
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  nodeMajor >= 20 ? pass(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} — requires Node >= 20`);
  hasCmd("npm")  ? pass("npm on PATH") : fail("npm not on PATH");
  hasCmd("git")  ? pass("git on PATH") : warn("git not on PATH — required for git-based packages");

  console.log(bold("\nPi"));
  if (hasCmd("pi")) {
    pass("`pi` on PATH");
    const v = spawnSync("pi", ["--version"], { encoding: "utf8" });
    const vout = (v.stdout ?? "").trim() || (v.stderr ?? "").trim();
    if (vout) pass(`pi --version: ${vout}`);
  } else {
    fail("`pi` not on PATH — run `npx @scoutos-labs/pi-minimal` to install");
  }

  console.log(bold("\nPackages"));
  const installed = readInstalledSources(flags.local);
  for (const pkg of PACKAGES) {
    installed.has(pkg.source)
      ? pass(`${pkg.id} installed`)
      : warn(`${pkg.id} not installed — run \`npx @scoutos-labs/pi-minimal\``);
  }

  console.log(bold("\nProviders"));
  const auth = detectAuth();
  if (auth.length > 0) for (const a of auth) pass(a);
  else warn("No provider credentials — set a provider env var or run `pi /login`");

  console.log("");
  if (problems === 0) console.log(green("All checks passed."));
  else console.log(yellow(`${problems} problem(s) found.`));
  return problems > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
async function cmdUpdate(flags) {
  if (!(await ensurePi(flags))) return 127;
  console.log(bold("Step 1/2: install any missing packages"));
  const code = await cmdInstall({ ...flags, yes: true });
  if (code !== 0) return code;
  console.log(bold("\nStep 2/2: pi update"));
  return runPi(flags.local ? ["update", "-l"] : ["update"]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const flags = parseArgs(argv.slice(2));
  if (flags.help) { printHelp(); return 0; }
  switch (flags.command) {
    case "install": return cmdInstall(flags);
    case "status":  return cmdStatus(flags);
    case "doctor":  return cmdDoctor(flags);
    case "update":  return cmdUpdate(flags);
    default:        printHelp(); return 2;
  }
}

main().then((code) => exit(code ?? 0)).catch((err) => {
  stderr.write(`${err?.stack || err}\n`);
  exit(1);
});
