# WORKOUT TRACKER + NUTRITION — starter v2

This is the next version of the existing GitHub Pages PWA. It keeps the original workout/body-weight tracker and adds a food diary.

## Included in this version
- Food diary by date and meal
- Daily calorie, protein, carbs, fat and fibre totals
- Editable targets for weight gain, fat loss, maintenance or custom goals
- Searchable built-in list of common foods
- Natural-language entry for supported foods, e.g. `200g cooked rice, 2 eggs, 10g ghee`
- Optional Open Food Facts search for packaged-food products when online
- JSON backup/restore includes nutrition entries
- CSV export for workout, weight and food diary
- Existing local IndexedDB storage and PWA installation

## Important limitations in this starter
- Cloud sync is not enabled yet. The app continues to save locally on this browser/device. Next implementation step is to create a Supabase project, add authentication and Row Level Security, then wire sync without exposing any secret key.
- USDA FoodData Central is a good next data source for broader nutrition coverage, but its API key must be kept server-side (not placed in public GitHub Pages JavaScript). For this first pass, built-in generic estimates work offline and Open Food Facts can supply packaged-food results.
- The sentence parser currently supports common built-in foods and quantity formats such as `200g cooked rice`, `2 eggs`, `10g ghee`. It is not an AI food parser and unknown recipes must be added manually or searched.
- Nutrition values are estimates. Recipes, oil, serving size, and food preparation can change actual values significantly.

## Deploy on the existing GitHub Pages site
1. Download and unzip the project.
2. Open the existing `workout-tracker` GitHub repository.
3. Upload/replace the contents of this folder at the repository root (keep `icons/`).
4. Commit the changes. GitHub Pages will publish the updated app.
5. On your phone, open the site in Chrome and refresh. If an old version persists, close the installed PWA and clear the site's cached data, then reopen it. The service worker cache was bumped to `debo-fit-v2`.

Live project from previous setup: https://debojitcpu.github.io/workout-tracker/

## Planned next step: secure cloud sync
Use Supabase Auth + a table keyed to the authenticated user, with Row Level Security policies ensuring each user can only read/write their own data. Keep the Supabase anon/publishable key in client configuration only; never put a service-role key or USDA secret key in this repository. We will add this after the first local food diary is confirmed working.
