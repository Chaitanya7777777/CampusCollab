---
name: Academic Syndicate
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#464555'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#703a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#934e00'
  on-tertiary-container: '#ffd2b1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.015em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.025em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is tailored for university students, student researchers, and early-stage founders seeking project partners, hackathon teammates, and research collaborators.

The aesthetic is Modern Scholastic: crisp, functional, energetic, and highly legible. It borrows the structured clarity of modern developer tools and the optimism of collegiate innovation hubs. The interface prioritizes scannability, rapid information matching (skills, project scopes, open roles), and absolute focus on user-generated content. Rather than relying on heavy decoration or flashy trends, the design instills confidence through precise typography, crisp surfaces, restrained color coding, and unmistakable visual affordances.

## Colors

The color palette centers on functional utility, role status awareness, and optimal contrast against soft backdrops:

- **Canvas & Surface Tier:**
  - Base canvas: `#F8F9FA` with subtle section alternation in `#F1F5F9`.
  - Elevated surfaces & cards: Pure `#FFFFFF` for maximum separation.
  - Interactive hover state surfaces: `#F8FAFC`.
- **Key Brand Accents:**
  - **Primary (`#4F46E5`):** Used for primary CTAs, active team filters, and key navigation highlights. Hover shifts to `#4338CA`; pressed states use `#3730A3`.
  - **Secondary / Open Roles (`#0D9488`):** Restrained teal dedicated to "Open Position", "Actively Recruiting", and verified university badges. Soft background tint: `#F0FDFA` with border `#99F6E4`.
  - **Tertiary / Pending & Time-sensitive (`#D97706`):** Warm amber for "Hackathon Deadline Approaching", "Application Pending", and urgent team slot fill requests. Soft background tint: `#FFFBEB` with border `#FDE68A`.
- **Text & Borders:**
  - Headings & Primary Body: `#0F172A` (deep slate navy).
  - Secondary / Supporting Metadata: `#475569`.
  - Muted Placeholders & Disabled Text: `#94A3B8`.
  - Subtle Borders & Dividers: `#E2E8F0`. Focus rings use an offset `#4F46E5` ring with 2px width and 2px offset.

## Typography

The type scale combines **Plus Jakarta Sans** for headlines and structural titles with **Inter** for body copy, micro-labels, and interface controls.

- **Plus Jakarta Sans** provides a warm, modern collegiate character without sacrificing high-density legibility. Headings should maintain tight tracking (`-0.01em` to `-0.02em`) to stay compact on project boards.
- **Inter** ensures exceptional readability across skill tags, dense applicant tables, project specs, and chat bubbles.
- Numbers, university terms (e.g., "Fall '25", "3/5 Spots Filled"), and timestamp tags rely on `font-feature-settings: 'cv02', 'cv03', 'cv04', 'tnum'` to guarantee numeric alignment in cards and tables.

## Layout & Spacing

The layout is built upon an 8pt base grid with a max-width container of `1280px` for desktop dashboards and project discovery views.

- **Grid Model:**
  - **Desktop (1024px+):** 12-column layout, 24px (`1.5rem`) gutters, minimum 32px (`2rem`) page margin. Project exploration defaults to 3-column card layouts; team management screens default to an 8-column primary workstream + 4-column meta rail.
  - **Tablet (640px – 1023px):** 8-column layout, 16px (`1rem`) gutters, 24px margins. Cards reflow to 2 columns.
  - **Mobile (< 640px):** 4-column layout, 16px (`1rem`) gutters, 16px (`1rem`) margin. Cards collapse to a single column, filter chips wrap horizontally into a sticky scroll ribbon.
- **Spacing Rhythm:**
  - Internal card padding is consistently `space-md` (16px) or `space-lg` (24px).
  - Tightly paired metadata (such as an avatar next to an author name and department) uses `space-xs` (4px) or `space-sm` (8px).

## Elevation & Depth

This system avoids heavy shadows, instead using crisp borders with ambient, light-diffused elevations to maintain a lightweight, productive feel.

- **Level 0 (Flat Surface / Canvas):** Neutral background `#F8F9FA`, no shadow, separated from sections by 1px solid `#E2E8F0`.
- **Level 1 (Default Cards & Input Fields):** White `#FFFFFF` surface enclosed in a 1px solid `#E2E8F0` border. Shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.05)`.
- **Level 2 (Hovered Cards & Interactive Modules):** Border shifts to `#CBD5E1`. Shadow: `0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)`. Card translates vertically by `-1px` on hover.
- **Level 3 (Dropdowns, Popovers, & Flyouts):** White `#FFFFFF` surface, border `#E2E8F0`. Shadow: `0 10px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`.
- **Level 4 (Modal Dialogs & Drawers):** White `#FFFFFF` surface with backdrop scrim `rgba(15, 23, 42, 0.4)`. Shadow: `0 20px 30px -10px rgba(15, 23, 42, 0.15)`.

## Shapes

The design uses balanced, modern corner radii that bridge structure and friendliness:

- **Base Radius (`rounded-md`, 8px / 0.5rem):** Used for input fields, buttons, dropdown triggers, and status badge pill foundations.
- **Surface Radius (`rounded-lg`, 12px / 0.75rem to `rounded-xl`, 16px / 1rem):** Used for project cards, applicant summary panels, profile summary cards, and modals.
- **Pill Radius (`rounded-full`, 9999px):** Strictly reserved for member avatar cutouts, recruitment tags ("Recruiting", "Full"), skill chips ("Next.js", "Figma"), and counter badges.

## Components

### Buttons
- **Primary:** Filled `#4F46E5` background, `#FFFFFF` text, `font-weight: 600`, 8px radius. Hover: `#4338CA`. Active: `#3730A3`. Height: 40px (desktop), 44px (mobile). Focus: 2px solid `#4F46E5` with 2px white offset ring.
- **Secondary:** Surface `#FFFFFF`, 1px solid border `#CBD5E1`, text `#0F172A`. Hover: background `#F8FAFC`, border `#94A3B8`.
- **Tertiary / Ghost:** Transparent background, text `#475569`. Hover: background `#F1F5F9`, text `#0F172A`.
- **Destructive:** Background `#FEF2F2`, border `#FECACA`, text `#DC2626`. Hover: background `#FEE2E2`.

### Chips & Skill Badges
- **Skill Tags:** `#F1F5F9` background, `#334155` text, 1px border `#E2E8F0`, rounded-full, 6px horizontal padding, 2px vertical, `label-md` typography.
- **Recruitment Badges:**
  - *Open Role:* Background `#F0FDFA`, border `#99F6E4`, text `#0F766E`, leading dot indicator in `#0D9488`.
  - *Urgent / Hackathon:* Background `#FFFBEB`, border `#FDE68A`, text `#B45309`, leading dot indicator in `#D97706`.
  - *Filled:* Background `#F8FAFC`, border `#E2E8F0`, text `#64748B`.

### Cards (Project & Team Cards)
- Background `#FFFFFF`, 1px border `#E2E8F0`, 16px radius (`rounded-xl`), 20px internal padding.
- Card structure:
  - Header: Team/Project title, university department tag, bookmark toggle.
  - Body: 2-line truncated problem statement (`body-md`), visual skill stack chip list.
  - Footer: Member avatar stack (overlapping 28px circles with 2px white ring), open role status badge, and "Apply / Join" CTA.

### Form Inputs & Selects
- Height: 42px. 1px border `#CBD5E1`, background `#FFFFFF`, text `#0F172A`, placeholder `#94A3B8`, 8px radius.
- States: Focus ring 2px `#4F46E5` with 0px inner offset, error state uses 1px `#EF4444` and 2px `#FCA5A5` ring.
- Accompanying helper text rendered in `body-sm` (`#64748B`).

### Checkboxes & Radios
- 18px square (checkbox) or circle (radio), 1.5px border `#94A3B8`, background `#FFFFFF`.
- Checked state: background `#4F46E5`, border `#4F46E5`, with crisp white center checkmark or dot.

### Special Domain Components
- **Role Slot Matrix:** A grouped list of required roles (e.g., "Full-stack Developer", "Product Designer") within a project card, displaying filled versus vacant slots via filled or dashed circular indicators.
- **Member Avatar Stack:** Clustered student profiles with +N overflow count, tooltip showing university major and graduation year on hover.