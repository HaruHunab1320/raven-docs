---
title: Organizing Content
sidebar_position: 3
---

# Organizing Content

A well-organized knowledge base is easier to navigate and maintain. This guide covers best practices for structuring your documentation.

## Information Architecture

### Top-Level Structure

```
Workspace
├── Engineering (Space)
├── Product (Space)
├── Sales (Space)
├── HR & Company Wiki (Space)
└── Archived (Space)
```

### Space Structure

Each space should have a clear purpose and consistent organization:

```
Engineering Space
├── Getting Started
│   ├── Development Setup
│   ├── Architecture Overview
│   └── Contributing Guide
├── Systems
│   ├── API Service
│   ├── Web App
│   └── Infrastructure
├── Processes
│   ├── On-Call Runbook
│   ├── Incident Response
│   └── Release Process
└── References
    ├── API Reference
    ├── Database Schema
    └── Glossary
```

## Naming Conventions

### Pages

- Use clear, descriptive titles
- Be consistent across similar pages
- Avoid jargon in page names
- Include context (e.g., "API Authentication" vs just "Authentication")

**Good examples:**
- "Getting Started with the API"
- "AWS Infrastructure Overview"
- "Q1 2025 Product Roadmap"

**Avoid:**
- "Notes"
- "Stuff"
- "New Page 3"

### Spaces

- Name by team, project, or function
- Keep names short but descriptive
- Use consistent capitalization

## Page Templates

Create templates for common document types:

### Meeting Notes Template

```markdown
# Meeting: [Topic]

**Date:** [Date]
**Attendees:** @person1, @person2

## Agenda
- Item 1
- Item 2

## Discussion
[Notes]

## Action Items
- [ ] @person1: Task description
- [ ] @person2: Task description

## Next Meeting
[Date/Time]
```

### Technical Spec Template

```markdown
# [Feature Name] Technical Specification

## Overview
Brief description of the feature.

## Goals
- Goal 1
- Goal 2

## Non-Goals
- Non-goal 1

## Design

### Architecture
[Diagram or description]

### API Changes
[Endpoint changes]

### Database Changes
[Schema changes]

## Implementation Plan
1. Phase 1
2. Phase 2

## Open Questions
- Question 1?
```

## Linking Strategy

### Internal Links

Connect related content with links:

```markdown
For setup instructions, see [[Development Setup]].

This integrates with our [[API Service]] - check the
[[API Reference]] for endpoint details.
```

### Backlinks

Raven Docs automatically tracks backlinks. Use them to:

- Find related content
- Identify orphaned pages
- Discover unexpected connections

## Tags and Metadata

While Raven Docs uses hierarchy primarily, you can add structure with:

### Callout Labels

```markdown
:::info Status: Draft
This document is still being written.
:::
```

### Header Metadata

```markdown
# API Reference

| Owner | Last Updated | Status |
|-------|--------------|--------|
| @john | 2025-01-15   | Active |
```

## Maintenance

### Regular Reviews

Schedule periodic content reviews:

1. **Monthly** - Check recently updated pages
2. **Quarterly** - Review space organization
3. **Annually** - Full content audit

### Archive Strategy

Don't delete - archive old content:

1. Create an "Archive" space
2. Move outdated pages there
3. Keep links working via redirects

### Content Owners

Assign ownership to ensure pages stay current:

- Document owner in page header
- Set up reminders for review
- Track staleness in dashboards

## Common Patterns

### Documentation Hub

Create an index page for each space:

```markdown
# Engineering Hub

Welcome to Engineering documentation.

## Quick Links
- [[Development Setup]]
- [[On-Call Runbook]]
- [[API Reference]]

## Recently Updated
- [[New Feature Spec]] - Jan 15
- [[Deploy Process]] - Jan 12

## Need Help?
Ask in #engineering-help on Slack.
```

### Decision Log

Track important decisions:

```markdown
# Architecture Decision Log

## ADR-001: Use PostgreSQL for primary database
**Date:** 2024-03-15
**Status:** Accepted
**Context:** We need a reliable relational database...
**Decision:** Use PostgreSQL 15...
**Consequences:** ...
```

## Migration Tips

When moving from another tool:

1. **Audit existing content** - What's still relevant?
2. **Plan new structure** - Don't replicate old problems
3. **Import in phases** - Start with high-value content
4. **Update links** - Fix references after migration
5. **Train team** - Ensure everyone knows the new structure

## Related

- [Pages Concept](/concepts/pages) - How pages work
- [Spaces Concept](/concepts/spaces) - Understanding spaces
