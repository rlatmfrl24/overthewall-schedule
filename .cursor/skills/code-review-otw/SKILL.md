---
name: code-review-otw
description: Review OTW code changes for bugs, regressions, security gaps, and performance risks. Use when a user asks for code review, PR review, change review, risk review, or includes words like review or 리뷰.
---

# Code Review (OTW)

## Review Focus

- Prioritize correctness and behavior regressions first.
- Evaluate security concerns at trust boundaries (input validation, auth or audit, sensitive data).
- Evaluate performance risks (wasteful rerenders, unnecessary API calls, expensive loops or queries).
- Validate test impact and identify missing coverage for changed behavior.

## Workflow

1. Identify exact change scope (files, symbols, runtime paths).
2. Analyze risks in severity order: high, medium, low.
3. Capture evidence with concrete file or symbol references.
4. List open questions for assumptions that cannot be validated from code.
5. Propose targeted verification tests.

## Response Template

Use this structure:

```markdown
## Findings

### High

- [Issue] Impact and location (`path/to/file.ts:line`, `SymbolName`)

### Medium

- [Issue] Impact and location (`path/to/file.ts:line`, `SymbolName`)

### Low

- [Issue] Impact and location (`path/to/file.ts:line`, `SymbolName`)

## Open Questions

- Assumptions or missing context that can change conclusions.

## Suggested Tests

- Focused checks to validate fixes or prevent regressions.

## Summary

- 1-2 lines on overall risk and readiness.
```

## Output Rules
- Sort findings by severity, then by likelihood.
- If no material issues are found, explicitly state "No material findings."
- Keep explanations concise and actionable.
