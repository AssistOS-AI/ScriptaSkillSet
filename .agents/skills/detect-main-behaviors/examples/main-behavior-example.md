---
title: DS003-main-behavior
summary: Defines how Ploinky finds a workspace, starts agents, mounts files, prepares dependencies, applies profiles, manages lifecycle commands, updates repositories, and exposes built-in HTTP and browser interfaces.
---

## Introduction

Ploinky lets a user start and manage agents from any folder inside a workspace. It finds the workspace, prepares each agent's files and dependencies, starts the selected runtime, and exposes the commands and HTTP routes used to operate the workspace. The behaviors below describe the results that users, agent authors, and integrations rely on.

## Core Content

### Main Behavior Components

| Name | Explanation |
| --- | --- |
| Workspace initialization and CLI execution | Ploinky finds the workspace root, records the launch folder, starts the requested agent, and passes CLI and SSO input to the correct destination. |
| Container mounts | Ploinky gives each container the shared library, agent code, dependencies, shared storage, project files, skills, and manifest volumes with profile-dependent write access. |
| Dependency installation | Ploinky prepares reusable dependency caches before an agent starts and makes those dependencies available to container and lite-sandbox agents. |
| Agent dependency overrides | An agent can replace a global dependency version in its own cache without modifying the agent's source package file. |
| Agent lifecycle commands | Start, restart, reinstall, stop, shutdown, and destroy have different effects on running agents, containers, dependency caches, and workspace data. |
| Manifest profiles | The active profile controls environment variables, hooks, secrets, mounts, ports, network settings, and default write access. |
| Workspace update | `ploinky update` refreshes Ploinky, shared libraries, repositories, agent packages, and installed skills, then invalidates dependency caches when the AchillesAgentLib commit changes. |
| Built-in router routes | The router owns health, authentication, administration, MCP, agent discovery, web application, upload, storage, and workspace-file routes with defined access rules. |
| Built-in browser libraries | Agents and applications can load WebSkel and QR libraries from stable public `/web-libs` URLs. |

### Workspace initialization and CLI execution

Ploinky finds the workspace root by walking upward from the current folder. If `PLOINKY_WORKSPACE_ROOT` names an existing folder, Ploinky uses it. Otherwise, Ploinky uses the first parent folder that contains `.ploinky`. If no parent contains `.ploinky`, Ploinky uses the current folder. Root detection only returns the selected folder; environment initialization creates `.ploinky` later.

The command `ploinky cli <agentName> <params>` activates the named agent globally when needed, makes sure its service or container is running, and executes the `cli` command declared in the agent manifest. Ploinky appends `<params>` to that command. It removes arguments whose names begin with `--sso-` from the command arguments and passes them to the agent as environment variables.

An agent manifest can mount any host folder through `volumes`. Ploinky resolves a relative host path from the workspace root and uses an absolute host path without changing it. A mounted folder does not need to be inside `.ploinky`.

#### Workspace environment variables

Ploinky calculates these values on the host and adds them to every agent container through the selected profile environment.

| Variable | Meaning |
| --- | --- |
| `PLOINKY_WORKSPACE_ROOT` | The selected workspace root. It is the configured existing folder, the first parent that contains `.ploinky`, or the launch folder when neither source exists. |
| `PLOINKY_CWD` | The resolved folder from which the user launched `ploinky`. It equals the workspace root when the command starts there and differs when the command starts in a subfolder. |

### Container mounts

Before starting an agent with Docker or Podman, Ploinky builds the complete volume list. The default working folder inside the container is `/code`; `manifest.workdir` replaces it when the manifest declares another folder.

#### Standard mounts

| Mount | Host source and access |
| --- | --- |
| `/Agent` | The shared `Agent/` library from Ploinky, mounted read-only. |
| `/code` | The agent code from `.ploinky/code/<agent>`, mounted read-write for the `default` and `dev` profiles and read-only for other profiles. |
| `/code/node_modules` | The prepared dependency cache, mounted read-only by Docker and provided through a symlink by Podman. |
| `/Agent/node_modules` | The same prepared dependency cache, mounted read-only by Docker and provided through a symlink by Podman. |
| `/shared` | `.ploinky/shared`, mounted read-write. |
| Configured project path | The configured project folder, normally the workspace root, mounted read-write at the same absolute path used on the host. |
| `/code/skills` | The agent's skills folder when it exists outside `/code`, mounted by Docker with profile-dependent read-write or read-only access. |
| Manifest `volumes` | Any host folder named by an absolute path or a path relative to the workspace root, mounted read-write. |

#### Conditional mounts

| Mount | Condition and behavior |
| --- | --- |
| `/models`, `/runtime`, and `/Agent/llm-runtime` | Added only for an agent whose manifest enables an LLM runtime. |
| `<persistentStorage>` | Added when `runtime.resources.persistentStorage` is declared. Its default host location is `.ploinky/data/<key>`. |
| Agent working folder | `.ploinky/agents/<agent>` is mounted separately as read-write when the configured project-path mount does not already cover it. |

Docker mounts each source directly at its target path. Podman creates a temporary directory tree under `.ploinky/container-runtime`, uses symlinks for the `/Agent` copy and the `/code` tree, mounts the real symlink targets, and starts Node with `--preserve-symlinks`. Under Podman, `node_modules` is a symlink to the cache instead of a nested mount.

### Dependency installation

Ploinky adds three global dependencies to agents before applying agent-specific dependencies.

| Package | Version source |
| --- | --- |
| `achillesAgentLib` | `git+https://github.com/OutfinityResearch/achillesAgentLib.git#master` |
| `mcp-sdk` | `git+https://github.com/PloinkyRepos/MCPSDK.git#main` |
| `node-pty` | `^1.0.0` |

Ploinky does not install dependencies inside the long-running agent container. It prepares a dependency cache on the host before startup. For a Docker or Podman agent, Ploinky runs `npm install` in a temporary container created with `run --rm` and mounts the cache folder at `/install`. For a `lite-sandbox` agent that uses bwrap or seatbelt, Ploinky runs `npm install` directly on the host.

Ploinky prepares base dependencies when the agent has no custom start command, has its own `package.json`, or uses an LLM runtime. At runtime, `/code/node_modules` and `/Agent/node_modules` expose the prepared cache read-only.

#### Dependency cache levels

| Level | Path and purpose |
| --- | --- |
| Global | `.ploinky/deps/global/<runtimeKey>` contains the three global dependencies and is shared by agents. |
| Per agent | `.ploinky/deps/agents/<repo>/<agent>/<runtimeKey>` starts from hardlinks to the global cache. When the agent has its own `package.json`, Ploinky installs the combined package in this cache. |

### Agent dependency overrides

When an agent declares the same dependency as the global package, the agent's version wins. Ploinky combines global and agent `dependencies` and `devDependencies`, with the agent values applied last. The agent's `scripts` and `name` fields also take priority.

Ploinky writes the combined `package.json` into the per-agent cache and runs `npm install` there. It does not change the `package.json` stored in the agent source.

### Agent lifecycle commands

Each lifecycle command has a defined effect on the runtime, dependency cache, and working data.

| Action | Result |
| --- | --- |
| Start | Ploinky runs the host-side pre-container cycle, including the `preinstall` hook, calculates the environment hash, prepares dependencies, prepares Podman staged directories, assembles mounts and environment variables, starts the container, and runs post-start hooks. |
| `restart <agent>` for a container | Docker or Podman restarts the existing container without recreating it, checking the environment hash, or changing the dependency cache. |
| `restart` without an agent, or workspace restart | Ploinky stops configured agents and starts the workspace again. It checks the environment hash and recreates a container when that hash changed. |
| `restart <agent>` for `lite-sandbox` | Ploinky stops the agent process and recreates the service with `forceRecreate`. |
| Reinstall | Ploinky stops and removes the container, then creates it again with `forceRecreate`. It keeps and reuses a valid dependency cache. |
| Stop | Ploinky stops configured agents and keeps their containers. |
| Shutdown | Ploinky stops and removes workspace containers and keeps `.ploinky/agents`. |
| Destroy or clean | Ploinky stops and removes containers and deletes `.ploinky/agents`. |

Destroy does not explicitly remove Podman staged directories. Ploinky recreates them on the next start or removes them later as stale entries. Lifecycle commands do not delete dependency caches. `ploinky update` invalidates those caches only when the AchillesAgentLib commit changes.

### Manifest profiles

An agent manifest defines profiles under `profiles`. Ploinky reads the active profile name from `.ploinky/profile`; the default name is `default`. When the active name is `default` or does not exist in the manifest, Ploinky uses the default profile without merging another profile into it.

#### Profile merge rules

| Field | Rule |
| --- | --- |
| `env` | Active-profile values replace default values with the same variable name; other default variables remain. |
| `hooks` | An active hook replaces the default hook with the same name; a missing active hook keeps the default value. |
| `secrets` | Ploinky concatenates default secrets followed by active-profile secrets. |
| `mounts` | Active-profile values replace default values with the same key. |
| `ports` | The active profile replaces the complete default value. |
| `network` | The active profile replaces the complete default network choice. |

#### Default mount access

An explicit `mounts.code` or `mounts.skills` value in the profile replaces these defaults.

| Profile | Default access for `/code` and `/code/skills` |
| --- | --- |
| `default` or `dev` | Read-write. |
| Any other profile | Read-only. |

### Workspace update

`ploinky update` refreshes the workspace in a fixed order. It first updates Ploinky itself. In an interactive session, it postpones this step and tells the user to run the update from a shell. In a non-interactive session, it runs `git pull --rebase --autostash` in the Ploinky root.

Ploinky then refreshes AchillesAgentLib in `node_modules`. It pulls an existing Git checkout or clones the repository when the package is not a Git checkout. Next, it updates every repository under `.ploinky/repos/*`; it pulls Git repositories and reclones non-Git folders when their source URL is known. It also scans project roots recursively for workspace Git repositories and updates those whose remotes are reachable.

After repository updates, Ploinky refreshes AchillesAgentLib in packages under `.ploinky/repos/*` that depend on it and installs skills from every discovered `ploinky-skills-manifest.json`.

Ploinky compares the current AchillesAgentLib commit with `.ploinky/deps/achilles-ref.json`. When the commit changed, Ploinky deletes `.ploinky/deps/global` and `.ploinky/deps/agents` and writes the new commit marker. Agents rebuild their dependencies on the next start. When the commit is unchanged or cannot be resolved while offline, Ploinky keeps the caches. The update command invalidates stale caches but does not reinstall every agent dependency during the update itself.

#### Skill installation during update

| Aspect | Behavior |
| --- | --- |
| Discovery | Ploinky recursively searches the project roots for `ploinky-skills-manifest.json` and skips `.git`, `node_modules`, `globalDeps`, `.ploinky`, and hidden folders. |
| Manifest content | The manifest is a JSON array of links. Ploinky uses a link as a local path when that path exists and otherwise runs `git clone --depth 1`. |
| Destination | Ploinky deletes and recreates `.agents/skills`, then copies the discovered skills into it. |
| Name conflicts | When two sources provide a skill with the same name, the source listed later in the manifest wins. |
| Git ignore rules | When the destination belongs to a Git repository, Ploinky adds ignore entries for the installed skills, `.agents`, and `.claude`. |
| `.claude` link | Ploinky normally creates `.claude` as a symlink to `.agents`. When `.claude` is already a populated folder, Ploinky creates `.claude/skills` as a link to `../.agents/skills`. |

`ploinky-skills-manifest.json` is the only skill-installation input. Ploinky does not read `achilles-copilot-basic-skills.config` and does not install a separate built-in set of Achilles skills.

### Built-in router routes

The router serves these routes directly in addition to agent-owned routes. The access description states who can use each route by default.

| Path | Behavior and access |
| --- | --- |
| `/health` | Returns liveness data such as status, uptime, process ID, memory, and sessions. Public. |
| `/web-libs[/*]` | Serves browser libraries from `webLibs/`. Public. |
| `/MCPBrowserClient.js` | Serves the MCP browser client. Public. |
| `/agent-card[/]` | Aggregates agent cards from active routes. Public. |
| `/mcp[/]` | Provides the router-level MCP endpoint. Authentication required. |
| `/auth/*` | Handles login, logout, sessions, and tokens. Access depends on the selected handler. |
| `/api/agents/*` | Provides user-administration operations. Authentication and administrator access required. |
| `/policy/command` | Controls command whitelisting. Authentication is required; access is limited to an administrator or an agent-approved request. |
| `/api/router/openai-agent-discovery` | Discovers enabled OpenAI backends. An agent assertion is required. |
| `/api/router/soul-gateway/user-api-key` | Issues a user API key for Soul Gateway. Authentication required. |
| `/webtty`, `/webchat`, `/dashboard`, and `/status[/*]` | Serve the terminal, chat, dashboard, and status applications. Access follows the resolved agent `auth.mode`: `none` is open, `guest` requires a guest session, and `local` or `sso` requires a user session. |
| `/upload`, `/blobs[/*]`, and `/workspace-files[/*]` | Provide uploads, blob storage, and workspace files. Authentication required. |
| `/` and `/index.html` | Redirect to the configured static agent after the applicable authentication check. |

The paths `/metrics`, `/admin[/*]`, and `/health/internal` are reserved and agents cannot claim them. The router does not assign dedicated handlers to these reserved paths.

### Built-in browser libraries

The public `/web-libs` route serves files from Ploinky's root `webLibs/` folder and rejects path traversal outside that folder.

| Library | Description and URL |
| --- | --- |
| WebSkel ESM | The ES-module build of the WebSkel web-component framework at `/web-libs/webskel/webskel.mjs`. |
| WebSkel UMD | The UMD build of WebSkel, which exposes the `WebSkel` global, at `/web-libs/webskel/webskel.umd.js`. |
| `paulmillr-qr` | The dependency-free QR-code generator and reader at `/web-libs/qrLib/qr.min.js`. |

## Conclusion

Ploinky turns a workspace command into a running, configured agent with predictable files, dependencies, lifecycle behavior, updates, and public interfaces. Users and integrations can rely on the named commands, paths, environment variables, routes, and access rules without knowing the private helper functions that implement them.
