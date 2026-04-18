Phase 18 Subtasks
=================

Purpose
-------
This folder decomposes host adapters and file-authoritative integration into concrete execution slices.

Use it together with:

- task-board/19-phase-18-host-adapters-and-file-authoritative-integration.txt


Execution Order
---------------
1. 01-host-adapter-contract.txt
2. 03-session-memory-sync-and-handoff.txt
3. 04-playbook-and-procedure-artifact-export.txt
4. 05-claude-codex-integration-examples.txt
5. 06-adapter-safety-and-rollback.txt
6. 02-file-parse-and-structured-delta.txt


Execution Rule
--------------
- finish the read-only or file-assisted slice first
- keep file-authoritative writeback deferred until safety and rollback rules are explicit
- run targeted regression checks after each completed subtask before moving forward


Status Rule
-----------
Use:

- [TODO]
- [WIP]
- [DONE]
