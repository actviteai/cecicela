# ceciCela for Microsoft 365 Copilot: build, test, publish

This folder is a Microsoft 365 Agents Toolkit project for a declarative agent (manifest schema v1.9). The router is the agent's `instructions` (at most 8,000 characters; the build checks). The three protocols and the drawing rules ship as agent skills (`appPackage/skills/*/SKILL.md`, at most eight). The agent declares Code Interpreter. There is no live HTML surface in Copilot chat, so the graph view is the text screen.

Custom skills in declarative agents are a **preview for Microsoft Frontier tenants**, and they do not run in tenants that use Purview Information Barriers. Microsoft does not yet accept declarative agents with custom skills in Partner Center: ISVs must not submit this package to the Commercial Marketplace until Microsoft opens that route. Embedded knowledge files, the other way to carry the protocols, are not enabled for the Agents Toolkit either. So today this package is for testing and for organizations in Frontier; the marketplace submission waits on Microsoft. Re-check https://learn.microsoft.com/microsoft-365/copilot/extensibility/declarative-agent-skills before each release.

## Test (needs a Microsoft 365 tenant with Copilot licenses, enrolled in Frontier)

1. Set `TEAMSFX_AGENT_SKILLS=true` before you start the Agents Toolkit (`export TEAMSFX_AGENT_SKILLS=true` on macOS or Linux; on Windows set it as a user environment variable and restart VS Code).
2. Open this folder in VS Code with the Microsoft 365 Agents Toolkit extension, or use the `atk` CLI.
3. Sign in to the test tenant and provision (`atk provision --env dev`). That zips `appPackage/` and sideloads it.
4. Open Microsoft 365 Copilot, pick the ceciCela agent, and run each conversation starter. The first reply must state its limits.

## Publish to the Commercial Marketplace (when Microsoft accepts skills)

Do steps 1 and 2 now: they take up to two weeks and do not depend on the package.


1. Partner Center account, enrolled in the Microsoft AI Cloud Partner Program and the Microsoft 365 and Copilot program. Validation can take up to two weeks.
2. Publisher verification (free; needs an Entra app registration tied to the partner account).
3. `atk validate`, then package (`appPackage/build/appPackage.<env>.zip`).
4. Partner Center listing: description, category "AI Apps and Agents", screenshots, and Terms of Use and Privacy Policy URLs. The manifest uses https://www.actvite.com/tos and https://www.actvite.com/privacy; certification needs the privacy policy to name ceciCela and say what data the agent handles, so add a ceciCela section to that page first. Submit; fix anything flagged in the Action Center.
5. The icons are the brand seal: `appPackage/color.png` is `brand/png/seal-192.png` and `appPackage/outline.png` is `brand/png/outline-32.png`. Partner Center also asks for a 300×300 logo (`brand/png/seal-300.png`) and, in places, 216×216 (`brand/png/seal-216.png`).

Re-run `npm run chat:build` at the repository root after changing any protocol; this folder is generated.
