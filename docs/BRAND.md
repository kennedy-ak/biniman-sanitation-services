# LiquidGo Brand Guide

## Palette

### Primary
| Name | Hex | RGB | Use |
|---|---|---|---|
| Deep Green | `#0B6B3A` | 11, 107, 58 | Logo, headings, primary buttons, brand surfaces |
| Charcoal | `#2E2E2E` | 46, 46, 46 | Body text, dark backgrounds, document copy |

### Accent
| Name | Hex | RGB | Use |
|---|---|---|---|
| Mustard Yellow | `#D4A017` | 212, 160, 23 | CTAs, highlights, badges. Use sparingly. |

### Supporting
| Name | Hex | Use |
|---|---|---|
| Light Green | `#6FCF97` | Freshness, success states, soft surfaces |
| Light Blue | `#56CCF2` | Water / sanitation accents, info states |

## Typography

### Headings — Montserrat
Weights: Bold, SemiBold. Used for the logo wordmark, page titles, section headings, marketing collateral, truck branding.

### Body — Open Sans
Weights: Regular, Medium. Used for paragraph copy, form fields, tables, reports, web body.

### Alternate — Poppins
Slightly softer than Montserrat; acceptable for marketing pages where a friendlier tone is wanted.

### Pairing
- Headings: Montserrat Bold
- Body: Open Sans Regular

## Tailwind Tokens

```js
// frontend/tailwind.config.js
colors: {
  primary: { DEFAULT: '#0B6B3A', light: '#6FCF97' },
  charcoal: '#2E2E2E',
  accent: '#D4A017',
  sky: '#56CCF2',
},
fontFamily: {
  heading: ['Montserrat', 'system-ui', 'sans-serif'],
  body: ['"Open Sans"', 'system-ui', 'sans-serif'],
}
```

## Usage Rules

- Primary green is the dominant brand surface. Use for hero sections, primary buttons, navigation accents.
- Mustard CTAs should appear at most once per screen — they signal the most important action.
- Charcoal beats pure black for body copy — softer, more professional.
- Light green and sky blue are supporting only, never primary brand surfaces.
