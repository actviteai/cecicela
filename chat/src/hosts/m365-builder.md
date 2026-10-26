# ceciCela in Microsoft 365 Copilot, built in Agent Builder

Agent Builder is the agent editor inside the Microsoft 365 Copilot app. It takes instructions and uploaded knowledge files and needs no package, no toolkit, and no Frontier enrolment, so it is the first Copilot route. Everything it needs is in this folder; `LISTING.md` has the field values.

What you need: a Microsoft 365 tenant where you have a Microsoft 365 Copilot licence, with Agent Builder allowed by the admin. Publishing to the whole organization also needs that tenant's admin (you, if it is your tenant).

## Build

1. Open Microsoft 365 Copilot (m365.cloud.microsoft, or the Copilot app). Choose **Agents**, then **Create agent**, then the **Configure** tab. Skip the Describe tab: it rewrites instructions.
2. Fill the fields from `LISTING.md`: name, description, icon (`brand/png/seal-192.png`), and the three starter prompts.
3. Paste the whole of `INSTRUCTIONS.txt` into **Instructions**.
4. Under **Knowledge**, upload every file in `knowledge/` from your device, one by one (folders do not upload). Wait until none of them shows grey.
5. Leave **Web search** off, so answers come only from the knowledge files, and leave **Code interpreter** off. There is no live HTML surface here: the graph view is the text screen in a code block.
6. **Create**. The agent is yours alone until you share it.

## Test

Use the **Try it** panel or open the agent from **Agents**. Run `docs/testing-chat.md` tests 1 to 7 and 9 to 11; test 8 is the text screen, since there is no player. Copilot shortens long answers: if the first reply lacks the limits sentence, ask "what are your limits?" and note it in the results. To continue a ceci plan, attach the latest `state.md` to the chat; there is no knowledge the user can write to.

## Share

Sharing is in steps, each wider than the last:

1. **Just you.** The default, for testing.
2. **Specific people.** Open the agent, choose **Share**, and pick people or groups. They get a link; the agent appears under their **Agents**.
3. **The organization.** Choose **More (…)**, then **Submit to your org catalog**. An admin reviews it in the Microsoft 365 admin center under **Agents**, then **All agents**, then **Requests**, and approves it. It then appears under **Built by your org** in the Agent Store. The shared copy and the store copy are managed separately: edit the shared one, then resubmit.

## Not yet: the public marketplace

Agent Builder agents cannot be submitted to the Microsoft Commercial Marketplace. That route needs an Agents Toolkit package (`chat/m365/`), and today a package can carry the protocols only as custom skills, which Partner Center does not accept yet. When Microsoft opens that, `chat/m365/SETUP.md` is the route.

Re-run `npm run chat:build` after changing any protocol; this folder is generated.
