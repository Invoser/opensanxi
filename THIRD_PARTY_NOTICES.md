# Third-Party Notices

OpenSanxi is released under the MIT License.

This repository contains OpenSanxi application code and deployment templates. It
does not vendor full source copies of the upstream projects below.

## Runtime / Integration Projects

| Project | How OpenSanxi uses it | License |
| --- | --- | --- |
| [LibreChat](https://github.com/danny-avila/LibreChat) | Optional chat UI/API through Docker images and `deploy/docker/librechat/librechat.yaml` | MIT |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Optional advanced agent profile; not used by the default chat path | MIT |
| [Hermes UI](https://github.com/pyrate-llama/hermes-ui) | Optional second chat/agent UI mounted at `/agent/` from an external checkout | MIT |
| [OpenClaw](https://github.com/openclaw/openclaw) | Evaluated during design; not bundled in this repository | MIT |

## Why MIT

The upstream projects considered or integrated by OpenSanxi are MIT-licensed, so
MIT is compatible and keeps the project simple for personal use, self-hosting,
forking, and commercial reuse.

If you redistribute upstream images or source code directly, keep their license
notices with that redistributed material.
