# Workspace Council Design

## 1. Theme

A newsroom desk meets an operations console: warm editorial surfaces, compact live status, and one amber signal for agent handoffs.

## 2. Palette

- Canvas: `#f2efe8`
- Paper: `#fbfaf6`
- Ink: `#171714`
- Muted ink: `#68675f`
- Rule: `#d8d3c8`
- Accent: `#d86f32`
- Success: `#26745b`
- Warning: `#a65d18`
- Danger: `#aa3d35`

Text and status labels never depend on color alone.

## 3. Typography

Use Georgia for the editorial display voice, Aptos or Segoe UI for interface copy, and a system monospace for timestamps and tool metadata. Metrics use tabular numerals.

## 4. Components

Buttons are compact, squared pills with visible hover and focus states. Panels use borders and surface steps rather than stacked cards. The agent roster is a semantic list. Approval actions always state that a workspace write will occur.

## 5. Layout

Desktop uses a 240px specialist rail and one fluid conversation workspace. Below 760px the rail becomes a horizontal roster and all controls remain at least 44px tall.

## 6. Depth

Depth comes from adjacent surface contrast and crisp rules. Shadows are reserved for the open CopilotKit panel.

## 7. Do and do not

Do show real specialist roles, real source links, tool activity, and verification state. Do not use decorative gradients, glass blur, nested cards, fake metrics, or simulated successful workspace writes.

## 8. Responsive

Check 1440px desktop and 375px mobile. Long deployment names, URLs, tool names, and localized action labels must wrap without clipping.

## 9. Extension guide

New features should strengthen the read, research, critique, approve, publish sequence. Reuse the existing tokens and status language. Add motion only when it communicates a specialist handoff or completed tool action.
