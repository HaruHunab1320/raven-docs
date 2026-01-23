---
title: GTD & Productivity
sidebar_position: 6
---

# GTD & Productivity System

Raven Docs includes a built-in Getting Things Done (GTD) productivity system that helps you capture, organize, and process your work alongside your documentation.

## Overview

The GTD system integrates task management with knowledge management:

```
Capture → Process → Organize → Review → Execute
   ↓         ↓          ↓         ↓         ↓
 Inbox    Triage     Buckets   Weekly    Tasks
                               Review
```

## Core Components

### Inbox

The inbox is your capture point for all incoming tasks, ideas, and items that need processing.

- **Quick Capture** - Use `Cmd/Ctrl + K` to instantly capture thoughts
- **Zero friction** - Capture now, organize later
- **Centralized** - All new items land in one place

### Triage Buckets

Process inbox items into buckets:

| Bucket | Purpose | Examples |
|--------|---------|----------|
| **Inbox** | Unprocessed items | New captures, ideas |
| **Next Actions** | Tasks to do soon | Active work items |
| **Waiting** | Delegated or blocked | Waiting for responses |
| **Someday/Maybe** | Future possibilities | Ideas to revisit later |

### Daily Notes

Automatically generated daily pages for capturing thoughts and tasks.

- Date-based titles (e.g., "2024-01-15")
- Quick access from the sidebar
- Links to tasks created that day
- Integration with journal entries

### Journal Entries

Guided reflection pages with prompts:

- **Morning planning** - Set intentions for the day
- **Evening reflection** - Review accomplishments
- **Custom prompts** - Configurable reflection questions

### Weekly Reviews

Structured weekly review process:

1. **Clear inbox** - Process all captured items
2. **Review buckets** - Update waiting and someday lists
3. **Check goals** - Align tasks with objectives
4. **Plan ahead** - Set priorities for next week

## Workflow

### 1. Capture Everything

Use Quick Capture (`Cmd/Ctrl + K`) to capture:

- Tasks and to-dos
- Ideas and thoughts
- Meeting notes
- Questions to research

Everything goes to your inbox first.

### 2. Process Daily

During daily processing:

1. Open your inbox
2. For each item, decide:
   - **Do it** - If under 2 minutes
   - **Delegate** - Move to Waiting
   - **Defer** - Add to Next Actions with due date
   - **Someday** - Move to Someday/Maybe
   - **Delete** - Remove if not needed

### 3. Weekly Review

Every week, complete a structured review:

```markdown
## Weekly Review - Week of [Date]

### Clear
- [ ] Process inbox to zero
- [ ] Review notes from the week

### Review
- [ ] Check Waiting bucket - follow up as needed
- [ ] Review Someday/Maybe - promote or remove items
- [ ] Review goals - are tasks aligned?

### Plan
- [ ] Identify top 3 priorities for next week
- [ ] Schedule important tasks
- [ ] Block focus time
```

## Integration with Documentation

### Task-Page Links

Tasks can link to documentation pages:

- Reference relevant docs in task descriptions
- Create tasks directly from page content
- See backlinks from pages to related tasks

### Contextual Tasks

Create tasks with full context:

```
Task: Update API documentation
├── Linked to: /docs/api/endpoints
├── Context: Memory of last discussion
└── Goal: Complete v2.0 documentation
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Quick capture |
| `Cmd/Ctrl + Shift + K` | Open triage view |
| `Cmd/Ctrl + Shift + J` | Today's journal |
| `Cmd/Ctrl + Shift + D` | Today's daily note |

## Best Practices

1. **Capture immediately** - Don't try to organize while capturing
2. **Process daily** - Keep inbox at zero
3. **Review weekly** - Never skip the weekly review
4. **Trust the system** - Everything is captured, nothing is lost

## Related

- [Task Management](/guides/task-management) - Detailed task features
- [Goals](/concepts/goals) - Goal-based planning
- [Agent Planning](/concepts/agent) - AI-assisted planning
