# Changelog

## Unreleased

- Add the `xbot` command and a `web` interface with direct element actions, keyboard input and navigation backed by ShadowBot; retain `xbot-cli` and `browser` aliases.
- Show page snapshots after successful web actions, preserve action success when a snapshot fails, and allow saving snapshot text without overwriting files.
- Accept equivalent numeric JSON-RPC IDs returned by the browser service, including `1.0`.
- Publish from manually pushed version tags, with a helper to synchronize npm and Rust versions.

## [0.6.1](https://github.com/wn0x00/xbot-cli/compare/v0.6.0...v0.6.1) (2026-10-19)


### Bug Fixes

* **release:** automate trusted npm and GitHub publishing ([bd12480](https://github.com/wn0x00/xbot-cli/commit/bd12480b7d1325ca8658c2cf42735a790a40b98c))
