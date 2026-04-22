# Update Documentation

You are tasked with updating documentation based on source code changes. Follow these steps:

## 1. Read the Documentation Manifest

Read the manifest file at `docs/_manifest.json` to understand the documentation mappings. The manifest contains:
- **mappings**: An array of documentation rules, each with:
  - `id`: Unique identifier for the mapping
  - `doc`: Target documentation file path
  - `watches`: Array of glob patterns for source files to monitor
  - `purpose`: Description of what should be documented
  - `strategy`: Either "surgical" (update only changed sections) or "rewrite" (regenerate entire doc)
- **ignore**: Patterns to exclude from processing

## 2. Identify Affected Mappings

For each mapping in the manifest:
- Check if any source files matching the `watches` patterns have been modified
- If yes, mark this mapping as affected and needs update

## 3. Process Each Affected Mapping

For each affected mapping:

### Read Source Files
- Read **ALL** source files that match the mapping's `watches` patterns
- Skip files matching patterns in the `ignore` list
- For feature module docs: read controllers, services, entities, DTOs, interfaces, guards, interceptors, etc.
- Understand the complete state of the module

### Read Existing Documentation (if it exists)
- Read the target documentation file at the `doc` path
- Identify sections marked with `<!-- manual -->` comments - these are manually written and must be preserved
- Understand the current documentation structure

### Update Documentation

Based on the `strategy` field:

**For "surgical" strategy:**
- Identify which sections of the documentation correspond to changed source code
- Update only those specific sections while preserving:
  - Sections that document unchanged code
  - All manually-written sections (marked with `<!-- manual -->`)
  - Overall document structure and formatting
- Add new sections for new code elements
- Remove sections for deleted code elements

**For "rewrite" strategy:**
- Regenerate the entire documentation from scratch
- Preserve any sections marked with `<!-- manual -->` comments by:
  1. Extracting them from the existing doc
  2. Inserting them in appropriate locations in the new doc
- Ensure complete coverage of all source files

### Documentation Content Guidelines

#### For Feature Module Documentation

Generate comprehensive feature documentation with the following sections:

**1. Overview**
- What this module/feature does and its role in the system
- Key capabilities and responsibilities
- When to use this module

**2. Architecture**
- Module structure and organization (submodules, folders)
- Dependency graph showing relationships to other modules (use Mermaid diagrams)
- How this module connects to and interacts with other parts of the system
- Design patterns and architectural decisions used

**3. API Endpoints** (if controllers exist)
- All routes with HTTP methods
- Request parameters (path params, query params, body shape)
- Response formats and status codes
- Authentication and authorization requirements
- Rate limiting or special middleware
- Example requests and responses

**4. Business Logic** (if services exist)
- Service classes and their methods
- Key workflows and business rules
- Error handling patterns and custom exceptions
- Transaction handling
- External service integrations

**5. Data Model** (if entities/DTOs exist)
- Entities with columns, types, constraints, and relationships
- DTOs with validation rules and transformations
- Enums and constants
- Database indexes and unique constraints
- Table relationships (use Mermaid ER diagrams where helpful)

**6. Data Flow**
- How data moves through the module: request → controller → service → entity → response
- Include Mermaid sequence diagrams for complex workflows
- Error handling flow
- Event emissions and subscriptions

**7. Configuration**
- Environment variables used by this module
- Feature flags or runtime configuration
- Default values and required settings

**8. Inter-module Dependencies**
- What this module imports from other modules
- What this module exports for others to use
- Shared types, interfaces, or utilities
- Which modules depend on this module

#### For Architecture Overview Documentation

Generate system-level documentation covering:

**1. System Overview**
- High-level description of the application
- Core architectural patterns and principles
- Technology stack

**2. Module Dependency Graph**
- Mermaid diagram showing all modules and their dependencies
- Module groupings (features, infrastructure, shared)

**3. Global Infrastructure**
- Middleware (logging, error handling, validation)
- Guards and authorization
- Interceptors and transformation
- Pipes and validation
- Exception filters

**4. Configuration**
- Environment variables used across the system
- Configuration modules and patterns
- Secrets management

**5. Module Communication**
- How modules interact (direct imports, events, message queues)
- Event-driven patterns
- API gateways or routing

**6. Data Layer**
- Database connections and configuration
- ORM/query builder setup
- Migration strategy
- Connection pooling

**7. External Integrations**
- Third-party services
- External APIs
- Message queues, caches (Redis, etc.)

#### General Documentation Quality Standards

- **Include Mermaid diagrams** for architecture, data flow, and relationships
- **Link to source files** using relative paths (e.g., `[UserService](../src/users/user.service.ts)`)
- **Document non-obvious design decisions** - explain the "why" behind complex patterns
- **Include code examples** for complex APIs, particularly for:
  - Non-trivial request/response shapes
  - Custom decorators or guards
  - Complex validation rules
  - Event patterns
- **Use tables for structured data**:
  - API endpoint reference
  - Entity columns and types
  - Configuration variables
  - Method signatures
- **Be thorough but focused** - include what developers need to understand and use the code
- **Follow the `purpose` field** to determine scope and depth
- **Use clear, concise language** - avoid redundancy
- **Follow markdown best practices**:
  - Proper heading hierarchy
  - Code fences with language identifiers
  - Tables for tabular data
  - Lists for sequences or collections

### Preserve Manual Content
- Never remove or modify sections marked with `<!-- manual -->`
- These markers can appear as:
  - `<!-- manual -->...<!-- /manual -->` (block markers)
  - `<!-- manual: section-name -->...<!-- /manual -->` (named sections)
- Always preserve the content between these markers exactly as-is

## 4. Create New Documentation Files

If the target documentation file doesn't exist:
- Create it with appropriate structure
- Include a header with the document title and auto-generation notice
- Add a comment indicating it's managed by autodoc
- Follow the `purpose` to populate initial content based on the type:
  - Feature module doc: use the feature module documentation structure
  - Architecture doc: use the architecture overview structure
  - Other docs: follow the purpose description

## 5. Stage Changes

After updating all affected documentation files:
- Use `git add` to stage the modified documentation files
- DO NOT commit the changes - just stage them
- The user will review and commit manually

## 6. Output Summary

Provide a concise summary including:
- List of documentation files that were updated or created
- For each file:
  - Which source files triggered the update
  - What changed (new sections, updated sections, removed sections)
  - Strategy used (surgical or rewrite)
- Any warnings or issues encountered
- Remind the user to review the staged changes before committing

## Important Guidelines

- Be precise and accurate - documentation should match the code
- Read ALL source files in a module before documenting it
- Generate comprehensive feature documentation that covers the full module
- Include architecture diagrams using Mermaid
- Link to actual source files with relative paths
- Document design decisions and non-obvious patterns
- Preserve existing formatting and style where possible
- Never delete manual sections
- Focus on what developers need to know, not obvious implementation details
- Keep documentation in sync with code - remove outdated information
- Use proper markdown syntax and formatting
- Add code fences with appropriate language identifiers
- Include links to related documentation where helpful

## Example Output Format

```
Documentation updated successfully!

Updated files:
1. docs/carrier-management.md (full rewrite)
   - Source: src/modules/carrier-management/**/*.ts (15 files)
   - Regenerated complete feature documentation
   - Sections: Overview, Architecture, API Endpoints (8 routes), Business Logic (4 services), Data Model (3 entities), Data Flow, Configuration, Dependencies
   - Added: Mermaid diagrams for module architecture and carrier activation flow
   - Preserved manual section: "Migration Notes"
   
2. docs/architecture-overview.md (surgical update)
   - Source: src/main.ts, src/app.module.ts
   - Updated: Global middleware section (added request logging)
   - Updated: Module dependency graph (added carrier-management module)

All changes have been staged. Please review with `git diff --staged` before committing.
```
