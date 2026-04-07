# tunnit

Static site showing opening hours for local places in Kirkkonummi. Data is fetched daily from the Google Places API.

## Prerequisites

- Node.js 22+
- A Google Cloud project with the [Places API](https://console.cloud.google.com/apis/library/places-backend.googleapis.com) enabled
- An API key for the Places API

## Setup

### 1. Install dependencies

```sh
npm install
```

### 2. Get Google Place IDs

Find the Place IDs for the places you want to track using the [Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder). Search for e.g. "Kirkkonummen uimahalli" or "Kirkkonummen kirjasto".

Update `src/places.json` with the IDs:

```json
[
  {
    "name": "Kirkkonummen uimahalli",
    "placeId": "ChIJ...",
    "category": "swimming"
  },
  {
    "name": "Kirkkonummen kirjasto",
    "placeId": "ChIJ...",
    "category": "library"
  }
]
```

### 3. Set your API key

```sh
cp .env.example .env
# edit .env and add your key
```

## Development

Fetch data and generate the site:

```sh
source .env
npm run fetch      # fetches hours → dist/data.json
npm run generate   # generates HTML → dist/index.html
npm run build      # both steps
```

Open `dist/index.html` in a browser to preview.

## Production (GitHub Pages)

The repo includes a workflow at `.github/workflows/build-and-deploy.yml` that builds the site daily and deploys it to GitHub Pages.

Setup:

1. In the repo settings, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions** and add a secret named `GOOGLE_PLACES_API_KEY` with your API key.
3. Push to `main` (or trigger the workflow manually from the Actions tab) to deploy.

The workflow runs daily at 04:00 UTC and on every push to `main`.

### Custom domain

To serve the site on a subdomain like `hours.example.com`:

1. Edit `public/CNAME` and replace the contents with your domain (single line, no `http://`).
2. At your DNS provider, add a CNAME record:
   - **Name/host**: the subdomain part (e.g. `hours`)
   - **Value/target**: `<your-github-username>.github.io`
   - **TTL**: 3600 (or default)
   - On **Cloudflare**, set proxy status to **DNS only** (grey cloud) so HTTPS cert issuance works.
3. Push to `main` to redeploy with the CNAME file.
4. In **Settings → Pages**, enter the custom domain and wait for the DNS check to pass.
5. Tick **Enforce HTTPS** once the Let's Encrypt cert is provisioned.
