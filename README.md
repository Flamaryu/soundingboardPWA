# Wilmington Community Sounding Board

A premium, hyper-local community bulletin board and planning district feedback platform for Wilmington, Delaware. This Progressive Web App (PWA) enables local citizens and businesses to coordinate planning actions, raise civic alerts, and build consensus on neighborhood-level proposals.

---

## Key Features

### 1. Interactive GIS Map Storefronts
- **Spatial Vectors**: Renders vector planning district grids and neighborhood boundaries for Wilmington, Delaware (including Forty Acres, Highlands, Rockford Park, Center City, etc.).
- **Local Business Storefronts**: Projects local business locations (e.g., *Brew Haha Cafe*, *Constitution Yards*) onto the map as glowing visual markers.
- **Geographic Filtering**: Clicking any map cell or business marker instantly scopes the bulletin feed and map zoom to focus on that specific area.

### 2. Civic Consensus Voting & Witty Reactions
- **Civic Proposals**: Users can flag posts as civic proposals to gauge community opinion. 
- **Consensus Gauge**: Proposals display an interactive gauge splitting community opinions (Second vs. Object) with a visual colored split bar.
- **Witty Standard Reactions**: Regular posts support quick local sentiments:
  - **❤️ Love Local**: *"Gives Wilmington warm fuzzies"*
  - **🤝 Second This**: *"We need this in our lives"*
  - **👎 No Thanks**: *"Not in my backyard!"*
- **User-Scoped Reaction Integrity**: Enforces that each user has at most one active reaction per post. Clicking a different reaction swaps their vote, and re-clicking their current reaction undoes/untoggles it.

### 3. PWA & Robust Offline Auto-Sync
- **Offline Draft Queue**: When network connectivity is lost (detected using periodic network fetch checks), the post creator swaps to **"Queue Offline Draft"**, saving payloads in `localStorage`.
- **Automatic Reconnection Sync**: When connection is restored, the application background-syncs queued posts, clears local storage, and refreshes the feed seamlessly.
- **Manual Installation Prompts**: Provides stand-alone custom PWA install triggers on mobile/desktop, with manual installation cards for Safari on iOS.

### 4. Premium Responsive Design & Light/Dark Mode
- **Palette**: Tailored using a charcoal/cream/brick red palette:
  - **Slate Charcoal (`#2B2D42`)** — Primary text, cards, and navigation bars.
  - **Warm Alabaster (`#FDFBF7`)** — Eye-strain-reducing background.
  - **Row-House Brick Red (`#D90429`)** — Civic-minded brand accent.
- **FOUC Prevention**: Prevents Flash of Unstyled Content by loading system/storage theme settings blocking-ly on root document setup.
- **Glassmorphic HUD Banners**: Uses custom CSS variables mapped to Tailwind v4 `@theme` properties for a premium glassmorphic feel.

### 5. Multi-User Sandbox Contexts
- **Profile Context Switcher**: A quick account switcher lets you simulate interactions under different local personas:
  - **Marcus Williams** (Citizen - Forty Acres)
  - **Sarah Thompson** (Citizen - Center City)
  - **Brew Haha Cafe** (Business - Delaware Ave)
  - **Constitution Yards** (Business - Riverfront)
- **Business Location Lock**: Business accounts are locked to post from their registered coordinates, ensuring foot traffic authenticity.

---

## Technical Stack & Architecture

- **Framework**: Next.js (App Router, Server Actions, Turbopack dev pipeline)
- **Styling**: Tailwind CSS v4 & Vanilla CSS custom variables
- **Database (Dual Mode)**:
  - **PostgreSQL Mode**: Uses `Drizzle ORM` to execute schema validation, unique indexes, and relational joins on tables (`users`, `posts`, `post_reactions`, `neighborhoods`, `planning_districts`).
  - **Mock Fallback Mode**: If PostgreSQL is unreachable, the system fails-fast into a local JSON database pipeline (`src/db/mock_db.json`) executing the exact same relational checks, counters, and updates.
- **Service Worker**: `/public/sw.js` intercepting assets using a **Network-First** strategy for root pages and API paths (ensuring dynamic feeds stay fresh) while bypassing localhost during development to preserve Fast Refresh speed.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
Run the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser.

### Building for Production
To build the application bundle and test static page compilation:
```bash
npm run build
```
To run the production build:
```bash
npm run start
```
