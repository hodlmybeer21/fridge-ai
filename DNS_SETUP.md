# FridgeAI — DNS Setup Required

## Issue
`fridge.goodbotai.tech` is verified in Vercel but has NO DNS A/CNAME record. The subdomain resolves to nothing.

## What Tyler needs to do
Add a CNAME record at your DNS provider:

```
Host: fridge
Type: CNAME
Value: cname.vercel-dns.com
TTL: auto or 3600
```

This is the same setup as `tracker.goodbotai.tech` and `hub.goodbotai.tech`.

## After DNS propagates (~5 min to 24h)
The app will be live at: https://fridge.goodbotai.tech
