# New Gallery Notes

These documents describe the clean-slate version of the personal media gallery. They are intended to be copied into a new repository and used without any other conversation context.

The desired app is a static-first personal photo/video gallery with first-class albums, polished deep-linked viewing, and a simple local-folder publishing workflow.

## Read Order

1. [Requirements](./requirements.md)
2. [Layout and Viewing Learnings](./layout-and-viewing-learnings.md)
3. [Implementation Guidance](./implementation-guidance.md)

## Core Direction

Build the next version as a static media gallery, not as a server-rendered app.

The source of truth should be a local folder tree. A processing script should generate optimized media assets and a static manifest. The web app should load that manifest and render the gallery entirely client-side.

The app should feel like a lightweight photo app:

- The first screen is the gallery, not a landing page.
- Photos, videos, and albums can appear together in the grid.
- Individual media URLs are shareable.
- Closing a media view returns to the relevant grid scrolled to that item.
- The layout should preserve the custom photo-wall feel from the previous implementation.

