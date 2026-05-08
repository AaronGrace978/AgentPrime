# AgentPrime User Guide

The styled in-app guide lives at [`user-guide.html`](user-guide.html). AgentPrime opens that page from **Open User Guide** on the welcome screen.

AgentPrime is a local-first AI development workspace for creating projects, editing code, using Agent Mode, running previews, and keeping the build loop in one place.

## Start Here

When no file is open, AgentPrime shows the welcome screen.

- **Classic View** is the default daily-use surface: New Project, Open Project, AI Chat, New File, recent projects, and core shortcuts.
- **Launchpad View** is optional: a larger product-style home screen with Target Loop cards and the same creation actions.
- Switching views only changes the welcome screen layout. It does not change project creation, Agent Mode, previews, or workspace behavior.

## Create a Project

Use **New Project** from the welcome screen or press `Ctrl+Shift+N`.

1. Choose a template from the template gallery.
2. Configure the project name, destination, author, and description.
3. Create the project. AgentPrime writes the files and opens the generated workspace.
4. Let dependency installation run when the template supports it.
5. Use **Launch Preview** from the success screen when AgentPrime detects a runnable project URL.

If dependency installation fails, the files are still created. AgentPrime now shows that as a setup note instead of a scary fatal error. Open the workspace and run the suggested install command in the terminal.

## Agent Mode

Open Agent Mode with `Ctrl+L` or the **Ask AI** button.

Use Agent Mode for:

- Implementing features.
- Refactoring code.
- Repairing broken flows.
- Reviewing project structure.
- Running checks and explaining failures.

AgentPrime also includes:

- **Just Chat** for brainstorming and explanations.
- **Dino Buddy** for calmer learning-style help.
- **Review Loop** for checking generated diffs before applying changes.

## Workspace Flow

### Open a Project

Use `Ctrl+O` or **Open Project** on the welcome screen. The explorer, editor, terminal, Git panel, Live Preview, status bar, and Agent Mode all use the active workspace.

### Run and Preview

Press `F5` or use the project run actions. When AgentPrime receives a local URL from the runner, Live Preview opens in the IDE.

Some templates need a manual command first, such as:

```bash
npm install
npm run dev
```

### Status Bar

The status bar summarizes:

- AI provider/model connection.
- Desktop-only or Python Brain state.
- Startup doctor warnings and notes.
- Current language and line count.
- Shortcut hints and current time.

## Settings

Open Settings from the top bar or Command Palette.

Common areas:

- **AI Providers**: Configure Ollama, OpenAI, Anthropic, or OpenRouter.
- **Agent Behavior**: Choose behavior profiles, autonomy level, specialized agents, and model routing.
- **Editor**: Set font size, tabs, word wrap, minimap, line numbers, auto-save, and inline completions.
- **Diagnostics**: Review startup health, provider setup, and advanced runtime notes.

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Command Palette | `Ctrl+K` |
| Agent Mode | `Ctrl+L` |
| New Project | `Ctrl+Shift+N` |
| Open Project | `Ctrl+O` |
| New File | `Ctrl+N` |
| Toggle Explorer | `Ctrl+B` |
| Toggle Terminal | ``Ctrl+` `` |
| Run Current File | `F5` |
| Switch Tabs | `Ctrl+Tab` |
| Save File | `Ctrl+S` |

## Troubleshooting

### Project created but dependencies did not install

The project files are still available. Open the workspace and run the install command from the terminal. This usually means a package manager is missing, a network request failed, or the template needs manual setup.

### Preview did not launch

Run the project manually first, such as `npm run dev`, then use the preview URL shown in the terminal.

### AI is not responding

1. Open Settings and confirm provider credentials.
2. Check the status bar for provider/model state.
3. Open System Status for startup or doctor warnings.
4. If using Ollama, confirm the Ollama app/server is running.

### Workspace looks stale

Reopen the folder, refresh the explorer, or restart AgentPrime if the file watcher falls behind.

## Best First Agent Prompt

Try:

> Review this project, explain what it does, then suggest the smallest useful next improvement.
