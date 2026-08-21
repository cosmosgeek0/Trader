# Trader

Trader is one personal Binance trading program. Three came before it and died the same death: agents invented gates, ceremonies, and bloat, other agents obeyed them, and the projects buried themselves. This file is what keeps the fourth one alive.

The work is rewarded for exactly three things. A simple, clear, lightning-fast implementation with nothing standing in the middle. Live money proof — your own dry read, then the real run, nothing between. The owner's word followed without your own biases added. Code written once that works beats code edited twenty times; every shortcut is paid for by the next worker.

Build it vertically, one complete working capability at a time. Normal basis, reverse basis, and volume are long-term directions, not permission to build ahead.

The owner gives the only current capability, money amount, and execution path in chat. Unless the owner says otherwise there, live proofs use ETHUSDT with 25 USDT per leg at market, and market analysis uses 500 USDT. Do not ask the owner for what this file already answers.

## Project

- Repository: `https://github.com/cosmosgeek0/Trader`. Local root: `/Users/cosmosgeek/Desktop/Trader`. Start and work only inside it.
- `ui/` is the frontend; money code never lives there.
- Live code runs on AWS EC2 `i-0e87fe0e7ba2063a9` in `ap-south-1` through AWS SSM.
- Reach the host with `ssh cosmos 'COMMAND'`; copy files with `scp LOCAL_FILE cosmos:REMOTE_PATH`. Both are already configured on this Mac.
- The live Binance account is reached only from that host.
- Binance credentials already exist in AWS Secrets Manager. Never search for, copy, print, log, or store them.
- On the host, `/home/ssm-user/secret-id.txt` contains only the Secrets Manager secret ID. Server code retrieves the secret in `ap-south-1` without emitting it. Its JSON fields are `BINANCE_API_KEY` and `BINANCE_API_SECRET`.
- Use `https://arbitrage.cosmosgeek.org/` only when the current task requires it. Use the owner's connected Chrome session; do not open another login.
- Deploy only the finished Python files required by the current capability to `/home/ssm-user/Trader/` with `scp`.
- For a financial action, write the exact AWS command once in local `run.txt` as `cd /home/ssm-user/Trader && python3` followed by the deployed filename and arguments. `run.txt` is only the owner's handoff.
- Do not run, read, rewrite, copy, or deploy `run.txt`. The owner will run it within ten seconds; do not stop or ask the owner. Wait ten seconds, read `output.txt` once, verify Binance once, then continue. The first line of `output.txt` is the runner's exit status, not program output. A long-running command truncates `output.txt` at start and writes it once at the end; wait for that write.
- Read-only commands may be run directly with `ssh cosmos`. Every command that moves money, places an order, or cancels one runs only through `run.txt`.
- Unrelated balances, Earn balances, and dust are not Trader working capital. Do not move, trade, borrow against, repay with, or sweep them unless the owner explicitly names them.
- Only one worker edits the repository at a time. A new worker starts from this file, the complete current code, and the last live output; no handover documents.
- Cloudflare, UI, old repositories, parent folders, Desktop files other Desktop files outside this repository, memories, state files, handovers, evidence, Git history, and old instructions are not Trader context unless the owner names an exact item.
- The current chat instruction is the only task. Do not invent or search for additional context.

## Work style

- Prefer the smallest clear implementation that fully works. Working bloat is rejected.
- Before editing, also quote the AGENTS.md lines that govern the change.
- Judge simplicity by the complete trading flow: direct steps, plain names, few moving parts, and no repeated behavior.
- The code is lightning fast and stays that way: direct calls and the best available tools, plainly used.
- Before adding anything, ask whether it makes the code slower or the flow longer. If it does, it is the defect; gates, ceremonies, and invented process are always defects.
- If the repository is empty, start with one working Python file. Otherwise extend the current working program.
- Build vertically. Do not create separate pieces and hope to connect them later.
- Every added line must serve the current capability or a failure observed in a real run.
- Do not add future features, imagined failures, speculative safety, dormant options, or architecture for style.
- The only money gate is `run.txt`. Do not build approval flows, confirmations, dry runs, preflight checks, pipelines, or background runners; safety is the owner running the command.
- Do not create volume.py or any strategy file before the owner names that capability.
- The basis lifecycles are market-only; do not add limit modes to them without an owner instruction.
- Prefer changing or deleting existing code over adding wrappers, parallel paths, second implementations, or new architecture.
- When new code replaces old behavior, delete the old behavior. "It still works" and "it is harmless" are not reasons to keep it.
- When a section has rotted, rewrite it fresh from what it must do. Do not repair it patch by patch, and do not paste blocks from old code.
- Keep one implementation for each behavior and one definition for each money value.
- Extract shared code only after real repetition exists and only when the complete trading flow becomes simpler.
- Do not split one readable sequence into many helpers, classes, files, or layers merely to make it look structured.
- Use ordinary names that describe the real action. Do not invent project vocabulary, decorative architecture names, banner comments, boxed separators, slogans, or stylistic structure.
- If the owner says to delete something, delete it. Do not preserve, archive, disable, rename, or argue that it may be useful later.

## Build and verify

- When the chat names several capabilities, build them strictly in the named order. Complete, live-test, review, and correct one before writing the next.
- Before each capability, reread `AGENTS.md` and the complete current Python program.
- Before editing, state the capability, files, functions, why each change is needed, and the rough net line change.
- Stop before writing if the solution is unexpectedly large or needs an additional permanent file, class, dependency, abstraction, or parallel implementation.
- After writing, reread the complete changed flow.
- Remove unused imports, unused variables, duplicate logic, unnecessary helpers, speculative branches, commented-out old code, decorative comments, and temporary files.
- Do not create test files by default. Run only quick syntax, import, and exact-arithmetic checks when needed.
- Test the complete current program on live Binance using only the owner-approved amount and execution path.
- After each live run, compare every printed action, number, and label with Binance. Inaccurate or misleading output means the capability has not passed; correct it and rerun before continuing.
- Failure is allowed. Stop at the first real failure.
- Report the exact step, exact error, completed money action, and current Binance state.
- Make only the smallest change required by that failure, then run the whole program again.
- Do not add handling for similar failures that have not happened.
- Do not commit experiments or small edits. Commit only after the capability works live and the owner asks.

## Review

- After each capability passes live, run one independent Sol 5.6 Max critic.
- Run the critic locally: `codex exec -m gpt-5.6-sol -c 'service_tier="priority"' -s read-only --skip-git-repo-check` with the complete packet on stdin. Never use a Claude sub-agent as the critic. Trust the verdict only after the printed session header confirms model gpt-5.6-sol with max reasoning.
- The critic reads `AGENTS.md`, every active file reachable from `trader.py`, the exact change, and the live output.
- The packet is one self-contained text: this file verbatim, the owner's task verbatim, every active file in full, the exact change with before and after code, all live output including failed runs, and prior rounds' adjudicated results. Never include the builder's own review or conclusions.
- The critic does not edit code and does not propose speculative features, architecture, style preferences, or general hardening.
- Every finding must name the exact location, concrete wrong behavior, supporting code or live fact, consequence, and smallest correction.
- The critic's verdict also answers: is this the smallest, fastest form of the capability? Structure beyond that is a concrete defect, not a style preference.
- The builder verifies every finding against the code and Binance. Confirmed findings earn the smallest fix and a full live rerun. Unsupported findings are rejected.
- Repeat fix, full live rerun with the capability's own symbol and amount, and critic until it answers "no concrete defect found", then freeze the capability.
- A finding refuted by a critic round and accepted by the builder, or rejected by the owner, stays closed. Reopen only on a new live failure or an owner instruction.
- No other reviewer model is used unless the owner explicitly changes it.
- UI review adds `claude -p --model opus --effort xhigh` as a second critic, run in parallel on the same packet.

## Finish

- Stop after the last capability named in the current chat works.
- Do not harden, generalize, restructure, refactor, polish, or start the next capability.
- Compare the result with the simplest direct implementation. Use the smaller version when it stays equally clear and complete.
- Before returning, inspect everything created or changed during the task and remove anything the working program does not need.
- Remove task-only residue created during this run, including scratch scripts, temporary tests, hidden agent folders, plans, generated reports, traces, notes, caches, .codex, and .claude artifacts..
- Of the files created or changed during this task, leave only what the working capability needs. Do not delete unrelated pre-existing project files.
- Return the live result, files changed, line count before and after, each function added or changed in plain words, every real failure and its exact fix, and what was deliberately not added.
- The owner must be able to understand the complete active trading flow line by line.
