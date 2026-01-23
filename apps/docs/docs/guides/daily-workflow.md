---
title: Daily Workflow
sidebar_position: 9
---

# Daily Workflow

This guide walks through a productive daily workflow using Raven Docs' GTD and agent features.

## Morning Routine

### 1. Check Your Daily Plan

Start by reviewing the agent's suggested plan:

```
You: What's my plan for today?

Agent: Good morning! Here's your plan for today:

       Priority Tasks:
       1. [ ] Review PR #456 (due today)
       2. [ ] Complete API documentation
       3. [ ] Team standup at 10am

       Suggested Focus:
       - Morning: Deep work on documentation
       - Afternoon: Meetings and reviews

       From your goals:
       - "Launch v2.0" - 3 related tasks due this week
```

### 2. Open Daily Note

Create or open today's daily note:

- Use `Cmd/Ctrl + Shift + D`
- Or click **Today** in the sidebar

Your daily note includes:

- Date header
- Links to tasks due today
- Space for notes and captures
- Connection to journal entry

### 3. Morning Journal (Optional)

If using journaling:

```markdown
## Morning Reflection

**What's most important today?**
[Your response]

**Any blockers or concerns?**
[Your response]

**Energy level (1-10):**
[Your response]
```

## During the Day

### Quick Capture

When something comes up:

1. Press `Cmd/Ctrl + K`
2. Type your thought or task
3. Press Enter

The item goes to your inbox for later processing.

```
Examples:
- "Follow up with Sarah about design review"
- "Research caching strategies"
- "Bug: login redirect not working"
```

### Working on Tasks

When starting a task:

1. Open the task
2. Mark as **In Progress**
3. Link to relevant documentation
4. Take notes as you work

```
Task: Update API Documentation
├── Status: In Progress
├── Notes: "Added rate limiting section"
├── Linked: /docs/api/rate-limits
└── Time: Started 2:30pm
```

### Agent Assistance

Ask the agent for help throughout the day:

```
You: Summarize the auth module documentation

You: What tasks are related to the API project?

You: Create a task to review the deployment script

You: What did we decide about error handling?
```

### Processing Inbox

When you have a few minutes, process inbox items:

1. Open **Triage** (`Cmd/Ctrl + Shift + K`)
2. For each item:
   - **Do it** - If quick
   - **Schedule** - Add to Next Actions with due date
   - **Delegate** - Move to Waiting
   - **Defer** - Move to Someday
   - **Delete** - Remove if not needed

## End of Day

### Review Completed Work

Check what you accomplished:

```
You: What did I complete today?

Agent: Today you completed:
       ✓ Review PR #456
       ✓ Update API rate limits doc
       ✓ Respond to 3 comments

       In progress:
       → API documentation (60% done)

       Captured:
       3 new items in inbox
```

### Evening Journal (Optional)

Reflect on the day:

```markdown
## Evening Reflection

**What went well?**
[Your response]

**What could improve?**
[Your response]

**Anything to carry forward?**
[Your response]
```

### Prepare Tomorrow

Ask the agent to prep for tomorrow:

```
You: What should I focus on tomorrow?

Agent: Based on your tasks and goals:

       High priority:
       1. Complete API documentation (in progress)
       2. Sprint planning meeting at 11am
       3. Code review for feature branch

       Consider:
       - Your goal "Launch v2.0" needs attention
       - 2 items in Waiting may need follow-up
```

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Quick capture |
| `Cmd/Ctrl + Shift + K` | Open triage |
| `Cmd/Ctrl + Shift + D` | Today's daily note |
| `Cmd/Ctrl + Shift + J` | Today's journal |
| `Cmd/Ctrl + Shift + A` | Agent chat |
| `Cmd/Ctrl + /` | Command palette |

## Weekly Integration

### Monday

- Review weekly plan from agent
- Check goals and priorities
- Process Someday/Maybe list

### Friday

- Complete weekly review
- Clear inbox to zero
- Update goals progress
- Plan next week's priorities

## Tips for Success

### Stay Captured

- Capture everything immediately
- Don't try to organize while capturing
- Trust the system

### Regular Processing

- Process inbox at least once daily
- Keep inbox close to zero
- Make quick decisions

### Use the Agent

- Ask questions often
- Let it suggest priorities
- Review its plans
- Provide feedback

### Respect Your Energy

- Deep work in high-energy times
- Meetings and reviews in low-energy times
- Don't over-schedule

## Common Patterns

### The Maker's Day

```
8am  - Morning routine, daily plan
9am  - Deep work block (no meetings)
12pm - Lunch, inbox processing
1pm  - Deep work block
4pm  - Meetings, reviews
5pm  - End of day routine
```

### The Manager's Day

```
8am  - Morning routine, emails
9am  - Team standup
10am - 1:1 meetings
12pm - Lunch, inbox processing
1pm  - Strategic work
3pm  - More meetings
5pm  - End of day routine
```

## Related

- [GTD System](/concepts/gtd) - GTD concepts
- [AI Agent](/concepts/agent) - Agent capabilities
- [Task Management](/guides/task-management) - Task details
