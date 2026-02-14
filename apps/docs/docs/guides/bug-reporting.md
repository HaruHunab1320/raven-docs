---
title: Bug Reporting
sidebar_position: 10
---

# Bug Reporting

Raven Docs includes a comprehensive bug reporting system that captures both automatic errors and user-reported issues. This guide covers how to report bugs and how admins can manage them.

## Reporting Bugs via Agent Chat

The easiest way to report a bug is through the AI agent. Simply type `/bug` followed by a description of the issue:

```
/bug The page editor freezes when pasting large images
```

The agent will:
1. Create a bug report with your description
2. Automatically capture your recent activity (user journey)
3. Attach relevant context (current page, space, project)
4. Return a confirmation with a reference ID

### Best Practices for Bug Reports

When reporting bugs, include:
- **What happened**: Clear description of the issue
- **What you expected**: The expected behavior
- **Steps to reproduce**: If you know how to trigger the bug
- **Severity**: How much it affects your work

Example:
```
/bug When I click the "Export" button on a page with tables, nothing happens.
Expected the page to download as PDF. This happens every time.
High severity - blocking my workflow.
```

## Automatic Error Capture

Raven Docs automatically captures errors across three layers:

### Server Errors
Server-side errors (500-level) are automatically captured with:
- Error message and stack trace
- API endpoint and method
- Request context

### Client Errors
Browser crashes and React errors are captured with:
- Error message and component stack
- Browser information
- Current URL

### Agent Errors
AI tool failures are captured with:
- Tool name and parameters
- Error details
- Conversation context

## Viewing Bug Reports (Admins)

Administrators can view all bug reports in **Settings > Developers > Bug Reports**.

### Bug Report Details

Each bug report includes:

| Field | Description |
|-------|-------------|
| **Title** | Brief description of the issue |
| **Source** | Where the bug came from (Server, Client, Agent, User) |
| **Severity** | low, medium, high, or critical |
| **Status** | open, triaged, in_progress, resolved, closed |
| **Occurrences** | Number of times this exact error occurred |
| **User Journey** | Timeline of recent user actions before the bug |

### User Journey Timeline

The user journey shows what the user was doing before the bug occurred. This is automatically gathered from the memory system and includes:
- Pages viewed
- Tasks created or updated
- Agent conversations
- Other workspace activity

This context helps developers understand and reproduce the issue.

### Managing Bug Reports

Admins can:
- **Filter** by source, severity, or status
- **Update status** as bugs are investigated and fixed
- **View details** including full error stack traces and context
- **Track occurrences** for duplicate detection

### Status Workflow

| Status | Description |
|--------|-------------|
| `open` | New, unreviewed bug |
| `triaged` | Reviewed and prioritized |
| `in_progress` | Being actively worked on |
| `resolved` | Fix deployed |
| `closed` | Closed (fixed or won't fix) |

## Deduplication

The system automatically detects duplicate errors:
- If the same error occurs within 24 hours, the occurrence count is incremented
- This prevents duplicate reports from flooding the system
- Each unique error is stored once with a count of how often it happened

## Severity Levels

| Severity | Description | Examples |
|----------|-------------|----------|
| `critical` | System unusable | Database failures, complete outages |
| `high` | Major functionality blocked | Auth failures, timeouts |
| `medium` | Feature broken but workarounds exist | Validation errors, tool failures |
| `low` | Minor issues | UI glitches, cosmetic problems |

### Automatic Severity Detection

For auto-captured errors, severity is determined automatically:
- **Critical**: 500 errors, database failures
- **High**: Timeouts, authentication failures, 401/403 errors
- **Medium**: Validation errors, agent tool errors
- **Low**: Client-side errors

## Privacy and Security

Bug reports are sanitized to remove sensitive data:
- Passwords, tokens, and API keys are redacted
- User journey content is sanitized
- Only necessary context is stored

Sensitive fields are automatically detected and replaced with `[REDACTED]`.
