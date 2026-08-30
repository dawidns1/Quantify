# Project Rules: Production Staging and Testing Workflow

Since this application is now live in production on Vercel:

1. **Do Not Push Directly to main:**
   - Always push code changes to a separate development branch (e.g., `develop` or a feature branch).
   - Use Vercel's automatic **Preview Deployments** on non-main branches to test changes on a live preview environment.
   - Only merge to `main` (which deploys to production) after successful verification on preview builds.

2. **Always Run Local Builds Before Committing:**
   - Always run `npm run build` in the `frontend` folder locally using the OS shell (bypassing PowerShell constraints where needed) to check for TypeScript or bundler errors.

3. **Verify Database Compatibility:**
   - Any database migrations or schema adjustments must be tested locally or on a staging database before applying them to the production Supabase database.

4. **Empirical Verification & Local Profiling (No Guessing):**
   - Never guess or declare a performance issue resolved based on code inspection alone.
   - Always construct and execute empirical runtime benchmarks (e.g. `scratch/test_perf_profile.py` simulating 140+ transactions across all tickers) to measure real execution times in milliseconds.
   - Verify that all background calls, cache logic, and network fetches complete cleanly in runtime tests before claiming success.

5. **Strict Internationalization (i18n) & Zero Hardcoded Strings Policy:**
   - **Never hardcode user-visible UI strings**, toast notifications, error messages, confirmation modals, prompts, placeholder text, tooltips (`title=`), or `aria-label` attributes directly in `.tsx` components.
   - **Always extract and translate**: Wrap every string using `t('section.key', 'Default English Text')` from `react-i18next`.
   - **Enforce 100% dictionary symmetry**: Whenever a new translation key is added, immediately add the corresponding key and translation across all 3 locale files: `frontend/src/locales/en/translation.json`, `frontend/src/locales/pl/translation.json`, and `frontend/src/locales/es/translation.json`.
   - **Dynamic locale formatters only**: Never hardcode `'en-US'` or omit locale arguments in `Intl.NumberFormat`, `toLocaleDateString`, `toLocaleTimeString`, or `toLocaleString`. Always pass `i18n.language || 'en'`.
   - **Avoid sentence fragmentation**: Never concatenate translated fragments (e.g. `{asset} + t('is up')`). Always use parameterized interpolation: `t('section.sentence_key', { asset, val })`.

