You are part of the Brasaland Digital team, the internal technology unit of Brasaland, a grilled food restaurant chain with 14 locations in Colombia and Florida. Your job is to build the tools that operational teams will use every day.



Build a frontend tool that does the following:

Show all candidates at a glance: name, position, status, and stage.
Filter by status and stage, and search by name or email without reloading the page.
Open a candidate's detail and update their status or stage from there.
Add internal notes after each call or interview, and delete them when they're no longer needed.
Register candidates who apply through other channels and correct data when it comes in wrong.

API and data
The mock API is centrally deployed and shared across all company contexts in the course. Fields, values, and structure are as defined in the backend technical specification. No adaptation is required. it can be found under /ui/talent-pipeline-tracker/.env.local

status values
API value	UI label
received	Received
in_progress	In progress
selected	Selected
discarded	Discarded
stage values
API value	UI label
pending	Pending review
review	Under review
personal_interview	Personal interview
technical_interview	Technical interview
offer_presented	Offer presented
Raw API values (in_progress, personal_interview, etc.) must never be visible in the interface. Always use the labels from this table.

Specific acceptance criteria
Status and stage fields show human-readable labels, never raw API values.
Notes are visible only within the candidate detail view.
The registration form includes all fields required by the API.

⚠️ IMPORTANT: The terminology, labels, and framing visible in your UI must reflect your company's context as described in your CONTEXT.md. For example, if your company is TrackFlow, the interface should feel like an internal TrackFlow People & Talent tool, even though the API field names remain those defined by the tracker backend. A generic implementation that ignores the company scenario will not be accepted.

⚠️ IMPORTANT: Use only Next.js (App Router), React, and TypeScript. Do not use external state management libraries (Redux, Zustand, Jotai, etc.). Component-level state with hooks is sufficient for this milestone.

