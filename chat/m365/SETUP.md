# ceciCela for Microsoft 365 Copilot: build, test, publish

This folder is a Microsoft 365 Agents Toolkit project for a declarative agent (manifest schema v1.9). The router is the agent's `instructions` (at most 8,000 characters; the build checks). The three protocols and the drawing rules ship as agent skills (`appPackage/skills/*/SKILL.md`, at most eight). The agent declares Code Interpreter. There is no live HTML surface in Copilot chat, so the graph view is the text screen.

## Test (needs a Microsoft 365 tenant with Copilot licenses)

1. Open this folder in VS Code with the Microsoft 365 Agents Toolkit extension, or use the `atk` CLI.
2. Sign in to the test tenant and provision (`atk provision --env dev`). That zips `appPackage/` and sideloads it.
3. Open Microsoft 365 Copilot, pick the ceciCela agent, and run each conversation starter. The first reply must state its limits.

## Publish to the Commercial Marketplace

1. Partner Center account, enrolled in the Microsoft AI Cloud Partner Program and the Microsoft 365 and Copilot program. Validation can take up to two weeks.
2. Publisher verification (free; needs an Entra app registration tied to the partner account).
3. `atk validate`, then package (`appPackage/build/appPackage.<env>.zip`).
4. Partner Center listing: description, category "AI Apps and Agents", screenshots, and Terms of Use and Privacy Policy URLs. Submit; fix anything flagged in the Action Center.
5. The icons are the brand seal: `appPackage/color.png` is `brand/png/seal-192.png` and `appPackage/outline.png` is `brand/png/outline-32.png`. Partner Center also asks for a 300×300 logo (`brand/png/seal-300.png`) and, in places, 216×216 (`brand/png/seal-216.png`).

Re-run `npm run chat:build` at the repository root after changing any protocol; this folder is generated.
