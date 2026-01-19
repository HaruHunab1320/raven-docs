# Agentic System Test Checklist

Use this checklist to validate everything added since the manual runbook.

## Agent Chat Drawer
- [ ] Open the global agent chat drawer from the top bar.
- [ ] Confirm the drawer stays open while you navigate pages.
- [ ] Confirm the message list scrolls independently (page scroll remains unaffected when hovering the drawer).
- [ ] Confirm the input stays pinned to the bottom of the drawer.
- [ ] Send a message and verify markdown renders (lists, headings, bold).

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
- [ ] Send enough messages to hit the limit.
- [ ] Confirm a warning appears in chat with **Increase limit**.
- [ ] Click **Increase limit** and confirm it updates successfully.

## Approvals
- [ ] Trigger an approval from chat with auto-approve OFF.
- [ ] Approve from inline chat; confirm the approval is removed and the action applied.
- [ ] Reject from inline chat; confirm it’s removed and you can add more context.

## Memory Context Chips
- [ ] Send a message and confirm the response includes context chips.
- [ ] Verify chips list memory sources with counts.
- [ ] Expand/collapse sources and confirm the list stays within the drawer.
