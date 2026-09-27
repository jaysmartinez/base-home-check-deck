# Base Home Check — customer deck

Standalone customer flow only. The dashboard is not included. Both `/` and `/customer-deck` open the deck.

## Run

Use Node 22 or newer. Run `npm ci` and `npm run dev`. Build with `npm run build`.

## Demo boundaries

The map example uses a supplied screenshot. Live Google Maps requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with Maps JavaScript API, Geocoding API, and Places API (New) enabled, billing configured, and HTTP referrer restrictions. Configure before building. No key is included. Address suggestions use Places.

Photos stay in the current tab. Refresh clears the session. There is no upload backend or AI qualification integration. Example photos and outcome screens are for demonstration only.

## Vercel

Import this repository as a Next.js project. Default build and output settings apply. No Cloudflare or Sites runtime is required.
