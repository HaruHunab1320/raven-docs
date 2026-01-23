---
title: Tasks
sidebar_position: 4
---

# Tasks

Tasks in Raven Docs are tightly integrated with your documentation, keeping work items in context with the content they relate to.

## Creating Tasks

### From a Page

1. Type `/task` to insert a task block
2. Or select text and click "Create Task"
3. Tasks automatically link to the source page

### From the Task View

1. Go to **Tasks** in the sidebar
2. Click **New Task**
3. Fill in details and optionally link to a page

### From the API

```typescript
const task = await client.tasks.create({
  workspaceId: 'ws_123',
  title: 'Update API documentation',
  description: 'Add examples for new endpoints',
  assigneeId: 'user_456',
  dueDate: '2025-02-15',
  priority: 'high',
});
```

## Task Properties

| Property | Description |
|----------|-------------|
| **Title** | Short description of the task |
| **Description** | Detailed information (markdown) |
| **Assignee** | Team member responsible |
| **Due Date** | Deadline for completion |
| **Priority** | High, Medium, Low |
| **Status** | Todo, In Progress, Done |
| **Project** | Parent project |
| **Labels** | Custom tags |

## Projects

Group related tasks into projects:

```
Q1 Roadmap (Project)
├── Feature A (Task)
├── Feature B (Task)
└── Documentation Update (Task)
```

### Creating Projects

```typescript
const project = await client.projects.create({
  workspaceId: 'ws_123',
  spaceId: 'space_456',
  name: 'Q1 Roadmap',
  description: 'Features for Q1 2025',
});
```

## Task Views

### List View

Traditional task list with sorting and filtering:

- Sort by due date, priority, assignee
- Filter by status, labels, project
- Bulk actions for multiple tasks

### Board View

Kanban-style columns:

```
| Todo      | In Progress | Done    |
|-----------|-------------|---------|
| Task A    | Task C      | Task E  |
| Task B    | Task D      | Task F  |
```

### Calendar View

Tasks displayed on a calendar by due date.

### My Tasks

Personal dashboard showing:

- Tasks assigned to you
- Tasks you created
- Recently updated tasks

## Task Mentions

Reference tasks in documents using `@task`:

```markdown
Make sure to complete @task[Update API docs] before the release.
```

This creates a backlink, so you can see all documents mentioning a task.

## Triage Buckets

Quickly categorize tasks for processing:

- **Now** - Do immediately
- **Next** - Do soon
- **Later** - Backlog
- **None** - Uncategorized

```typescript
await client.tasks.update({
  taskId: 'task_123',
  workspaceId: 'ws_456',
  bucket: 'now',
});
```

## Notifications

Get notified when:

- You're assigned a task
- A task you're watching is updated
- A task is mentioned in a document
- Due date is approaching

## API Reference

```typescript
// List tasks
const tasks = await client.tasks.list({
  workspaceId: 'ws_123',
  status: 'todo',
  assigneeId: 'user_456',
});

// Update task
await client.tasks.update({
  taskId: 'task_123',
  workspaceId: 'ws_456',
  status: 'in_progress',
});

// Complete task
await client.tasks.complete({
  taskId: 'task_123',
  workspaceId: 'ws_456',
});
```

## Best Practices

1. **Link tasks to pages** - Maintain context
2. **Use projects** - Group related work
3. **Set due dates** - Create accountability
4. **Regular triage** - Keep task list manageable
5. **Close completed tasks** - Clean up regularly

## Related

- [Task Management Guide](/guides/task-management) - Detailed workflows
- [Tasks API](/api/endpoints/tasks) - API reference
