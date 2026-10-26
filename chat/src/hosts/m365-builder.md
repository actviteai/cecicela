# ceciCela in Microsoft 365 Copilot, built in Agent Builder

Agent Builder is the agent editor inside the Microsoft 365 Copilot app. It takes instructions and uploaded knowledge files, needs no package, no toolkit, and no Frontier enrolment, and shares inside your organization without Partner Center. That makes it the first Copilot route. Everything it needs is in this folder; `LISTING.md` has every field value. Checked against Microsoft Learn on 2026-10-26; the links at the end are the pages to re-check.

## What you need

- A Microsoft 365 tenant in which your account can use **embedded files** as agent knowledge. That takes either a Microsoft 365 Copilot licence (the Copilot add-on, Microsoft 365 Copilot Business, or E7) or **pay-as-you-go billing** (Copilot Credits) set up by the tenant admin. Plain Copilot Chat can build agents but cannot embed files, and this kit is nothing but embedded files.
- Admin rights in that tenant for step 3c (approving the org catalog submission) and, if sharing is restricted, for step 3a and 3b.
- No tenant yet? Two routes: a one-user Microsoft 365 Business subscription with the Copilot add-on, where you are your own admin; or the Microsoft 365 Developer Program instant sandbox, if you qualify (Visual Studio subscribers, ISV Success, partner program), which lets you buy a Copilot licence inside it.

## 1. Build (about 15 minutes)

1. Open Microsoft 365 Copilot (m365.cloud.microsoft, or the Copilot app) and select **New agent** in the left pane.
2. On the New agent page select **Skip to configure**. Do not use the Describe tab: it rewrites the instructions as you talk.
3. On the **Configure** tab fill in, from `LISTING.md`: **Name**, **Icon** (pencil, then Upload: `icon-seal-192.png`), **Description**, and the three **Starter prompts**. Leave **Model** on Auto.
4. Paste the whole of `INSTRUCTIONS.txt` into **Instructions** (3,049 characters; the limit is 8,000).
5. Under **Knowledge**, use the upload arrow (or drag and drop) to add the 10 files in `knowledge/` from your device, one at a time; folders do not upload. Each file shows grey until it has finished embedding; wait until none is grey. Add no websites, SharePoint, OneDrive, Teams, email, or connector sources.
6. Under **Capabilities**, leave **Create documents, charts, and code** and **Create images** off. There is no live HTML surface in Copilot chat: the graph view is the text screen in a code block, and the instructions already say so.
7. Select **Create**. The agent is private to you until you share it.

## 2. Test

The **Try it** tab works as soon as the agent has a name, description, and instructions, and behaves like the created agent. Run `docs/testing-chat.md` tests 1 to 7 and 9 to 11 there; test 8 is the text screen, since there is no player.

Two things specific to Copilot:

- **Knowledge is retrieved, not read whole.** Copilot grounds answers on passages it retrieves from the embedded files, so a long protocol may arrive in pieces. Tests 3 and 7 (trouble's phases and verdict block; ceci's full `state.md`) are the ones that show it. If a run skips protocol steps, the fix is to move the rules that must never be missed (the first-reply limits sentence, the verdict and REVIEW formats, the four role ids) from the knowledge files into `INSTRUCTIONS.txt`; there are about 4,900 characters of headroom under the 8,000 limit. Change `chat/src/`, not the generated files, and rebuild.
- **To continue a ceci plan**, attach the latest `state.md` to the chat. There is no knowledge slot the user can write to.

Note in the results whether the first reply states its limits unprompted, and whether the 80x24 screen comes back in a code block with its columns aligned.

## 3. Share

Three paths, each wider than the last. The shared agent and the Agent Store listing are tracked separately: **Update** changes what shared users see at once; the store copy changes only after a resubmission is approved.

**3a. Specific people.** Open the agent and select **Share**. Add people or groups as **Can chat** (groups can only be chat users) or **Can edit** (co-owners). Copy the chat link from the same dialog.

**3b. Everyone in the tenant, no review.** In the same Share dialog turn on **Org-wide sharing for chat access**. The agent appears in the Agent Store for everyone in the tenant. An admin can restrict who may do this; if the toggle is grey, that is why.

**3c. The org catalog, with review.** This is the governed route, and the one that puts the agent under **Built by your org**.

1. First fill **About this agent** (More menu, …): short description, creator website, privacy statement, terms of use, from `LISTING.md`. Microsoft rejects its placeholder URLs.
2. Select **Update** if the draft has unpublished changes; submission uses the last published version.
3. More (…), then **Submit to your org catalog**. The dialog asks for display name, short description, developer name, and the three URLs; `LISTING.md` has all six. Select **Continue**.
4. As the admin, open the Microsoft 365 admin center, then **Agents**, **All agents**, **Requests**. Open the request, review the capabilities, knowledge sources, and developer information, and **Publish**. The agent then appears under **Built by your org** in the Agent Store; the admin controls who sees it there.
5. Check status any time from the same **Submit to your org catalog** dialog: waiting, approved, or rejected with the reviewer's comment. After changes, **Update** and resubmit; the admin sees the diff.

Before 3c, the privacy page the submission links to (`https://www.actvite.com/privacy`) needs a ceciCela section saying what the agent handles and that nothing is stored by actvite.

## Not yet: the public marketplace

Agent Builder agents cannot be submitted to the Microsoft Commercial Marketplace. That route needs an Agents Toolkit package (`chat/m365/`), and today a package can carry the protocols only as custom skills, which are a Frontier preview that Partner Center does not accept. When Microsoft opens that, `chat/m365/SETUP.md` is the route.

## Sources

- Build agents in Agent Builder: https://learn.microsoft.com/microsoft-365/copilot/extensibility/agent-builder-build-agents
- Knowledge sources and the 20-file embedded limit: https://learn.microsoft.com/microsoft-365/copilot/extensibility/agent-builder-add-knowledge
- Share and manage (roles, org-wide toggle, About this agent): https://learn.microsoft.com/microsoft-365/copilot/extensibility/agent-builder-share-manage-agents
- Submit to your org catalog (fields, admin review): https://learn.microsoft.com/microsoft-365/copilot/extensibility/agent-builder-submit-to-org-catalog
- Licensing (embedded files need a licence or pay-as-you-go): https://learn.microsoft.com/microsoft-365/copilot/extensibility/prerequisites
- Skills in Agent Builder are a Frontier preview: https://learn.microsoft.com/microsoft-365/copilot/extensibility/declarative-agent-skills

Re-run `npm run chat:build` after changing any protocol; this folder is generated.
