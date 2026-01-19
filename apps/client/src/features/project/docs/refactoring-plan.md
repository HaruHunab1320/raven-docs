# Project Components Refactoring Plan

## Overview

This document tracks the refactoring progress for the `apps/client/src/features/project/components` directory with the goal of improving code maintainability by:

1. Breaking large components into smaller, reusable parts
2. Grouping related components into dedicated folders
3. Improving the overall component architecture

## Refactoring Status

| Component | Size | Status | Assignee | Notes |
|-----------|------|--------|----------|-------|
| project-board.tsx | 44KB, 1526 lines | Complete | | Refactored into smaller components in the board folder |
| project-dashboard.tsx | 21KB, 679 lines | Complete | | Refactored into smaller components in the dashboard folder |
| project-metrics.tsx | 18KB, 583 lines | In Progress | | Fixed Mantine v6 component props |
| project-file-sidebar.tsx | 12KB, 438 lines | Not Started | | |
| project-tree.tsx | 9.6KB, 372 lines | Not Started | | Consider consolidating with project-file-tree.tsx |
| project-file-view.tsx | 9.9KB, 335 lines | Not Started | | |
| project-detail.tsx | Removed | Complete | Removed unused legacy component | |
| project-list.tsx | 8.1KB, 284 lines | Not Started | | |
| project-file-tree.tsx | 8.5KB, 307 lines | Not Started | | Consider consolidating with project-tree.tsx |
| task-card.tsx | 2.6KB, 104 lines | Not Started | | Move to task folder |
| sortable-task.tsx | 1.8KB, 84 lines | Not Started | | Move to task folder |
| task-form-modal.tsx | 6.0KB, 239 lines | Not Started | | Move to modals folder |
| project-form-modal.tsx | 4.6KB, 192 lines | Not Started | | Move to modals folder |

## Detailed Refactoring Plans

### 1. `project-board.tsx` (44KB, 1526 lines)

**Refactoring Strategy:**
- Create a dedicated `board` folder ✅
- Split into multiple components:
  - `BoardHeader` - For the header area with filters, search, etc. ✅
  - `BoardColumn` - For individual status columns ✅
  - `BoardSwimlane` - For swimlane view rows ✅
  - `Board` - Main component that ties everything together ✅
  - `BoardControls` - For filtering and view controls ✅
  - `board-hooks.ts` - Extract custom hooks for board functionality ✅
  - `board-context.tsx` - Create a context provider for shared state ✅
  - `board-utils.ts` - For utility functions related to the board ✅
- Refactor original file to use new components ✅

### 2. `project-dashboard.tsx` (21KB, 679 lines)

**Refactoring Strategy:**
- Create a dedicated `dashboard` folder ✅
- Split into components:
  - `DashboardHeader` - Header with title and create button ✅
  - `DashboardMetrics` - For the metrics/statistics cards ✅
  - `DashboardCharts` - For chart components ✅
  - `ProjectFormModal` - Modal for creating new projects ✅
  - `Dashboard` - Main component that ties everything together ✅
  - `dashboard-hooks.ts` - Custom hooks for dashboard data ✅
- Refactor original file to use new components ✅

### 3. `project-metrics.tsx` (18KB, 583 lines)

**Refactoring Strategy:**
- Create a dedicated `metrics` folder
- Break down into:
  - `MetricsOverview` - General metrics component
  - `PriorityBreakdown` - Priority chart/visualization component
  - `CompletionStats` - For completion percentage metrics
  - `ActivityTimeline` - For activity metrics
  - `metrics-utils.ts` - Helper functions for calculations
  - `metrics-hooks.ts` - Custom hooks for metrics data

**Progress:**
- Fixed Mantine v6 component props to use `justify="space-between"` instead of `position="apart"` and `gap` instead of `spacing`

### 4. `project-file-sidebar.tsx` (12KB, 438 lines)

**Refactoring Strategy:**
- Move to a `sidebar` or `navigation` folder
- Break down into:
  - `FileNavigation` - The navigation structure
  - `FileActions` - Action buttons and menus
  - `ProjectSelect` - The project selection component
  - `sidebar-context.tsx` - Context for sidebar state

### 5. `project-tree.tsx` (9.6KB, 372 lines) and `project-file-tree.tsx` (8.5KB, 307 lines)

These components are similar and could be consolidated.

**Refactoring Strategy:**
- Create a `tree` folder
- Create a base `TreeComponent` that both trees can extend
- Separate concerns:
  - `TreeNode` - For rendering individual nodes
  - `TreeActions` - For actions like add/delete/rename
  - `tree-hooks.ts` - Shared hooks for tree functionality

### 6. `project-file-view.tsx` (9.9KB, 335 lines)

**Refactoring Strategy:**
- Create a `file-view` folder
- Break down into:
  - `FileHeader` - For file header with actions
  - `FileContent` - For the main content area
  - `FileActions` - For file-related actions
  - `file-hooks.ts` - Custom hooks for file operations

### 7. `project-detail.tsx` (Removed)

This legacy component was not routed or referenced. It has been removed to
reduce maintenance overhead.

### 8. `project-list.tsx` (8.1KB, 284 lines)

**Refactoring Strategy:**
- Create a `list` folder
- Break down into:
  - `ListHeader` - With actions and filters
  - `ListItem` - Individual project item
  - `ListActions` - Project-related actions
  - `list-hooks.ts` - Custom hooks for list functionality

## Proposed New Structure

```
project/
├── board/
│   ├── components/
│   │   ├── BoardColumn.tsx
│   │   ├── BoardHeader.tsx
│   │   ├── BoardControls.tsx
│   │   ├── BoardSwimlane.tsx
│   │   └── Board.tsx
│   ├── board-context.tsx
│   ├── board-hooks.ts
│   ├── board-utils.ts
│   └── index.ts
├── dashboard/
│   ├── components/
│   │   ├── DashboardHeader.tsx
│   │   ├── DashboardMetrics.tsx
│   │   ├── DashboardCharts.tsx
│   │   ├── ProjectFormModal.tsx
│   │   └── Dashboard.tsx
│   ├── dashboard-hooks.ts
│   └── index.ts
├── metrics/
│   ├── components/
│   │   └── ...
│   └── index.ts
├── sidebar/
│   ├── components/
│   │   └── ...
│   └── index.ts
├── tree/
│   ├── components/
│   │   └── ...
│   └── index.ts
├── file-view/
│   └── ...
├── list/
│   └── ...
├── task/
│   ├── components/
│   │   ├── TaskCard.tsx
│   │   ├── TaskForm.tsx
│   │   └── SortableTask.tsx
│   └── index.ts
├── modals/
│   └── ...
├── common/
│   └── ...
├── hooks/
│   └── ...
└── utils/
    └── ...
```

## Implementation Priority

1. Start with the largest files: `project-board.tsx`, `project-dashboard.tsx`, and `project-metrics.tsx`
2. Move on to the file-related components: `project-file-sidebar.tsx`, `project-file-tree.tsx`, and `project-file-view.tsx`
3. Finally, refactor the smaller components and organize them into the appropriate folders

## Progress Tracking

- [x] Create folder structure for board components
- [x] Create board-context.tsx
- [x] Create board-hooks.ts
- [x] Create board-utils.ts
- [x] Create BoardHeader component
- [x] Create BoardControls component
- [x] Create BoardColumn component
- [x] Create BoardSwimlane component
- [x] Create main Board component
- [x] Create index.ts for board exports
- [x] Refactor project-board.tsx to use new components
- [x] Create folder structure for dashboard components
- [x] Create dashboard-hooks.ts
- [x] Create DashboardHeader component
- [x] Create DashboardMetrics component
- [x] Create DashboardCharts component
- [x] Create ProjectFormModal component
- [x] Create Dashboard component
- [x] Create index.ts for dashboard exports
- [x] Refactor project-dashboard.tsx to use new components
- [x] Fix Mantine v6 component props in project-metrics.tsx
- [ ] Refactor project-metrics.tsx
- [ ] Refactor project-file-sidebar.tsx and project-file-tree.tsx
- [ ] Refactor project-file-view.tsx
- [x] Remove unused project-detail.tsx
- [ ] Refactor project-list.tsx
- [ ] Move task-related components to task folder
- [ ] Move modal components to modals folder
- [ ] Create common components
- [ ] Consolidate hooks
- [ ] Update imports in all affected files
- [ ] Update routing references
- [ ] Add documentation to components

## Benefits of Refactoring

1. **Improved Code Maintainability**: Smaller, focused components are easier to understand and modify
2. **Better Code Organization**: Related functionality grouped together in logical folders
3. **Enhanced Reusability**: Common components can be shared across different features
4. **Easier Testing**: Smaller components with clear responsibilities are easier to test
5. **Improved Performance**: Potential for better performance through more granular component updates
6. **Better Developer Experience**: Easier onboarding for new team members with clearer code structure
7. **Reduced Bug Risk**: Isolated component logic reduces chance of unintended side effects

## Guidelines for Refactoring

1. **One Component, One Responsibility**: Each component should focus on a single responsibility
2. **Keep Components Small**: Aim for components under 200-300 lines of code
3. **Use TypeScript Interfaces**: Clearly define props and state interfaces for each component
4. **Extract Business Logic**: Move complex business logic to custom hooks or utility functions
5. **Consistent Naming**: Follow a consistent naming convention across all components
6. **Add Comments**: Document complex logic and component purposes
7. **Create Index Files**: Use barrel exports in index.ts files for cleaner imports
8. **Co-locate Tests**: Keep test files next to the components they test
