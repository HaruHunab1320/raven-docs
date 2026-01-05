# Agentic System Test Checklist

Use this checklist to validate everything added since the manual runbook.

## Playbook Wizard + Sessions
- [ ] Create a new project.
- [ ] Open the Playbook Wizard from the project header.
- [ ] Click **Start playbook chat** and verify the agent chat drawer opens with “Playbook chat: <project>”.
- [ ] Ask several questions in the chat to build context.
- [ ] Refresh the page and reopen the wizard; confirm the session is still active (session persists).
- [ ] Click **Summarize agent chat** and verify you get:
  - [ ] Summary text
  - [ ] Readiness badge
  - [ ] Confidence badge
  - [ ] “Open questions” list (if applicable)
- [ ] Click **Generate from agent chat** and verify playbook pages are populated.
- [ ] Click **Generate from brief** and verify playbook pages are populated.

## Playbook Content Quality
- [ ] Open each playbook page (Project Brief, Architecture, Delivery Plan, Backlog, Risks).
- [ ] Confirm there is no duplicate title in the page body.
- [ ] Confirm each page has 1 summary paragraph + bullet list.
- [ ] Confirm the playbook root page title includes the project name (e.g., “Project X Playbook”).

## Agent Chat Tooling
- [ ] In agent chat, toggle **Auto-approve tool actions** OFF.
- [ ] Ask the agent to perform a tool action (e.g., “Create a page titled ‘Research Notes’ in this space”).
- [ ] Confirm chat shows inline approval row with:
  - [ ] Method name
  - [ ] Approve / Cancel buttons
  - [ ] “Show details” accordion with params
- [ ] Click **Cancel**; confirm it pre-fills the message box with “Additional context:” and focuses input.
- [ ] Ask again, then click **Approve**; confirm the tool runs and you see a result in chat.

## Auto-Approve Toggle
- [ ] Toggle **Auto-approve tool actions** ON.
- [ ] Ask for the same tool action; confirm it applies without manual approval.
- [ ] Toggle OFF again; verify approvals require manual action.

## Chat Draft Limit & Warnings
- [ ] Go to Workspace → Agent Settings and locate **Chat draft message limit**.
- [ ] Change the value and save; confirm it persists.
- [ ] In a playbook chat session, send enough messages to hit the limit.
- [ ] Confirm a warning appears in chat with **Increase limit**.
- [ ] Click **Increase limit** and confirm it updates successfully.

## Approvals
- [ ] Trigger an approval from chat with auto-approve OFF.
- [ ] Approve from inline chat; confirm the approval is removed and the action applied.
- [ ] Reject from inline chat; confirm it’s removed and you can add more context.

## Agent Readiness & Confidence
- [ ] In normal agent chat (not playbook wizard), confirm the last two lines still show:
  - [ ] “Draft readiness: …”
  - [ ] “Confidence: …”
- [ ] Confirm these lines are not duplicated in the chat bubble (badges show instead).
