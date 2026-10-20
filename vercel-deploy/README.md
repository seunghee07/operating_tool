# Vercel deployment package for the existing dashboard

## App structure

This folder is the Vercel project root. It contains the existing static app (`index.html`, `styles.css`, `app.js`, `sales-data.js`, `operations.js`), public fictional training samples under `A_매출비교/`, `C_행사준비/`, and `D_화면과연결/`, and the existing Vercel Node function at `api/weather.js`. `vercel.json` sets clean URLs. No framework or build step is needed; leave Build Command and Output Directory at their Vercel defaults/blank for a static project.

## Public access and included files

Vercel serves the included HTML, JS, CSS, spreadsheet samples, CSV, and weather JSON as public files. The samples are documented as fictional training data, but anyone with a deployment URL can download them. The package excludes `.env.local`, other credentials, the popup brief, working originals outside the selected A/C/D copies, reports, verification tooling, and unrelated projects. `.env.example` contains only the empty placeholder `OPENWEATHER_API_KEY=`. `.gitignore` protects local secret files and generated workbooks.

The `/api/weather` function is unauthenticated and can be called by anyone who can reach the deployment. Review account access controls and the desired access scope before deploying. The app and API have no login layer in this package.

## Weather secret

Add `OPENWEATHER_API_KEY` in Vercel Project Settings → Environment Variables after importing, for the environments you intend to use. Never commit a real value or paste it into source files. The browser calls only `/api/weather`; the server function reads the secret from `process.env` and uses it for the upstream HTTPS calls. Without the variable, it returns the bundled example JSON with a visible sample label and reason.

## Manual deployment sequence

1. **Upload:** upload the `vercel-deploy/` folder contents (not its parent repository) to a private GitHub repository, or use Vercel's manual upload flow if offered for your account. Do not upload the parent training repository.
2. **Import:** in Vercel, choose Add New → Project → Import the uploaded repository. Set Root Directory to the repository root (the folder containing `index.html`, `vercel.json`, and `api/`). No build command or output directory is needed. Confirm framework is Other/No Framework.
3. **Secret:** open Project Settings → Environment Variables and add `OPENWEATHER_API_KEY`; select the deployment environments you need, save, then redeploy if the first deployment already ran.
4. **Deploy:** deploy and review the generated URL. Check that the page loads, `/api/weather` returns sample mode without a key or live mode with a valid key, and confirm the access controls and plan are appropriate before sharing the URL.

Check the current Vercel account, plan limits, Git provider connection, and manual upload options in your own Vercel dashboard before proceeding; they depend on your account. Deployment has not been initiated.
