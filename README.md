# FX Bias site

Open the site and it shows pair bias on five levels (very bullish to very bearish), built from macro data, COT positioning and scored news. Nothing runs in the background.

```
public/index.html   the dashboard
api/bias.js         server function: fetches data, scores it, returns JSON
```

## 1. Get the keys

| Key | Where | Cost |
|---|---|---|
| `FRED_API_KEY` | fred.stlouisfed.org (create account, request an API key) | Free |
| `FINNHUB_API_KEY` | finnhub.io (forex news) | Free tier, check limits |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Pay per use. Set a monthly spend limit |
| `ACCESS_KEY` | Make up any long random string | Free |

COT data from the CFTC needs no key.

## 2. Deploy on Vercel

1. Put this folder in a new GitHub repository.
2. Sign in to vercel.com with GitHub, click **Add New, Project**, and import the repository.
3. Under **Environment Variables**, add the four keys above.
4. Click **Deploy**.
5. Open `https://YOUR-SITE.vercel.app/?key=YOUR_ACCESS_KEY` and bookmark it.

## 3. Check before you trust it

- The data IDs at the top of `api/bias.js` (CFTC contract codes, FRED series) were written from memory and not tested against live services. If the status line on the page lists a missing input, check that ID on the source site.
- Scores are a decision aid, not trade signals. Compare them to price over a few weeks before using them.
- Server caching keeps calls low (news 30 minutes, COT and macro 6 hours), but costs and free-tier limits change, so check each provider's current terms.

## Tuning

Weights, the five-level cut-offs and the news half-life are plain constants in `api/bias.js`. Avoid tuning them until you have real results to test against.
