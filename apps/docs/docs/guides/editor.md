---
title: Editor Guide
sidebar_position: 2
---

# Editor Guide

The Raven Docs editor is a powerful block-based editor designed for both speed and flexibility.

## Keyboard Shortcuts

### Essential

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Bold | `Cmd + B` | `Ctrl + B` |
| Italic | `Cmd + I` | `Ctrl + I` |
| Underline | `Cmd + U` | `Ctrl + U` |
| Code | `Cmd + E` | `Ctrl + E` |
| Link | `Cmd + K` | `Ctrl + K` |
| Undo | `Cmd + Z` | `Ctrl + Z` |
| Redo | `Cmd + Shift + Z` | `Ctrl + Shift + Z` |

### Navigation

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Search | `Cmd + K` | `Ctrl + K` |
| New page | `Cmd + N` | `Ctrl + N` |
| Toggle sidebar | `Cmd + \` | `Ctrl + \` |
| Go to page start | `Cmd + Up` | `Ctrl + Home` |
| Go to page end | `Cmd + Down` | `Ctrl + End` |

### Blocks

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Slash command | `/` | `/` |
| Turn into H1 | `Cmd + Alt + 1` | `Ctrl + Alt + 1` |
| Turn into H2 | `Cmd + Alt + 2` | `Ctrl + Alt + 2` |
| Turn into H3 | `Cmd + Alt + 3` | `Ctrl + Alt + 3` |
| Turn into bullet list | `Cmd + Shift + 8` | `Ctrl + Shift + 8` |
| Turn into numbered list | `Cmd + Shift + 7` | `Ctrl + Shift + 7` |
| Turn into checklist | `Cmd + Shift + 9` | `Ctrl + Shift + 9` |

## Slash Commands

Type `/` anywhere to open the command menu:

### Text

- `/text` - Plain paragraph
- `/h1` - Large heading
- `/h2` - Medium heading
- `/h3` - Small heading
- `/quote` - Blockquote

### Lists

- `/bullet` - Bullet list
- `/numbered` - Numbered list
- `/checklist` - Todo checklist

### Media

- `/image` - Insert image
- `/video` - Embed video
- `/embed` - Generic embed
- `/file` - Attach file

### Advanced

- `/code` - Code block with syntax highlighting
- `/table` - Insert table
- `/divider` - Horizontal rule
- `/callout` - Info box
- `/task` - Create a task

## Markdown Shortcuts

The editor automatically converts Markdown as you type:

```markdown
# Heading 1
## Heading 2
### Heading 3

**bold** or __bold__
*italic* or _italic_
~~strikethrough~~
`inline code`

- Bullet item
1. Numbered item
[] Checkbox

> Blockquote

--- Horizontal rule
```

## Working with Blocks

### Selecting Blocks

- Click to place cursor
- Click the handle (⋮⋮) to select whole block
- `Shift + Click` to select multiple blocks

### Moving Blocks

- Drag the handle to reorder
- Use `Cmd + Shift + Up/Down` to move selected block

### Block Actions

Click the `+` button or right-click a block for:

- Delete
- Duplicate
- Copy link
- Turn into (convert type)
- Color (text/background)

## Tables

### Creating Tables

1. Type `/table`
2. Choose dimensions
3. Start typing in cells

### Table Shortcuts

| Action | Shortcut |
|--------|----------|
| Add row below | `Tab` at last cell |
| Add column | Right-click → Add column |
| Delete row | Right-click → Delete row |
| Navigate cells | `Tab` / `Shift + Tab` |

## Code Blocks

### Syntax Highlighting

Specify language after triple backticks:

````markdown
```typescript
const hello = "world";
```
````

Supported languages: JavaScript, TypeScript, Python, Go, Rust, Ruby, Java, C#, PHP, SQL, YAML, JSON, Bash, and more.

### Code Block Features

- Line numbers
- Copy button
- Language selector
- Wrap toggle

## Images

### Adding Images

1. Type `/image` or drag and drop
2. Paste from clipboard
3. Insert via URL

### Image Options

- Resize by dragging corners
- Add caption
- Set alignment (left, center, right)
- Add alt text

## Diagrams

### Excalidraw

Create hand-drawn style diagrams directly in your pages:

1. Type `/excalidraw` or `/drawing`
2. Click the block to open the editor
3. Draw using the toolbar:
   - Shapes (rectangles, ellipses, diamonds)
   - Lines and arrows
   - Text
   - Freehand drawing
4. Click outside to save

**Features:**
- Hand-drawn aesthetic
- Real-time collaboration
- Export to PNG/SVG
- Library of reusable components

### Draw.io

Create professional technical diagrams:

1. Type `/drawio` or `/diagram`
2. Opens the Draw.io editor
3. Create flowcharts, architecture diagrams, UML, etc.
4. Save to embed in page

**Use cases:**
- Architecture diagrams
- Flowcharts
- Network diagrams
- UML diagrams
- Wireframes

## Math Equations

Write mathematical notation using LaTeX syntax:

### Inline Math

Wrap with `$` for inline equations:

```
The formula $E = mc^2$ shows mass-energy equivalence.
```

Renders as: The formula *E = mc²* shows mass-energy equivalence.

### Block Math

Use `/math` for standalone equations:

```latex
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
```

### Common LaTeX Examples

| Expression | LaTeX |
|------------|-------|
| Fractions | `\frac{a}{b}` |
| Exponents | `x^{2}` |
| Subscripts | `x_{i}` |
| Square root | `\sqrt{x}` |
| Summation | `\sum_{i=1}^{n} x_i` |
| Integral | `\int_{0}^{\infty} f(x) dx` |
| Greek letters | `\alpha, \beta, \gamma` |

## Callouts

Highlight important information with callout blocks:

### Types

Type `/callout` and choose a style:

| Type | Use for |
|------|---------|
| **Info** | General information, tips |
| **Warning** | Cautions, things to watch out for |
| **Error** | Critical warnings, breaking changes |
| **Success** | Positive outcomes, confirmations |
| **Note** | Side notes, additional context |

### Example

```
:::info
This is an informational callout.
:::

:::warning
Be careful when deleting workspaces!
:::
```

### Customization

- Change icon
- Set custom title
- Collapse/expand

## Embeds

### Supported Embeds

Type `/embed` to insert external content:

| Service | Slash Command |
|---------|---------------|
| YouTube | `/youtube` |
| Vimeo | `/vimeo` |
| Figma | `/figma` |
| Loom | `/loom` |
| CodePen | `/codepen` |
| CodeSandbox | `/codesandbox` |
| Generic iframe | `/embed` |

### Embedding Content

1. Type the slash command (e.g., `/youtube`)
2. Paste the URL
3. The embed renders automatically

## Attachments

### Adding Attachments

1. Type `/file` or drag and drop files
2. Files are uploaded and linked

### Supported File Types

- Documents: PDF, Word, Excel, PowerPoint
- Images: PNG, JPG, GIF, SVG
- Videos: MP4, MOV
- Archives: ZIP
- Code: Any text file

### Attachment Features

- Preview (for images and PDFs)
- Download link
- File size display
- Inline or linked display

## AI Features

### Generate Content

1. Press `Cmd + J` or type `/ai`
2. Enter your prompt
3. AI generates content in-place

### AI Actions

Select text and use AI to:

- **Improve** - Fix grammar and clarity
- **Simplify** - Make it easier to understand
- **Expand** - Add more detail
- **Summarize** - Condense content
- **Translate** - Convert to another language

## Tips & Tricks

1. **Use templates** - Save time with page templates
2. **Link pages** - Use `[[Page Name]]` for quick links
3. **Mention people** - Use `@name` to notify someone
4. **Quick formatting** - Select text for formatting toolbar
5. **Focus mode** - Click the expand icon for distraction-free writing

## Related

- [Pages Concept](/concepts/pages) - How pages work
- [Organizing Content](/guides/organizing-content) - Structure tips
