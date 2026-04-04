import type { VercelRequest, VercelResponse } from '@vercel/node'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { imageUrl } = req.body || {}
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' })

  try {
    let imageData = imageUrl

    // Proxy external URLs through Vercel serverless to avoid CORS / fetch limits
    if (!imageUrl.startsWith('data:')) {
      try {
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) })
        if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`)
        const buf = await imgRes.arrayBuffer()
        const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'
        imageData = `data:${mimeType};base64,${Buffer.from(buf).toString('base64')}`
      } catch (proxyErr: any) {
        console.warn('Image proxy failed:', proxyErr.message)
      }
    }

    // Check size — refuse images that would make the request too large for OpenRouter
    if (imageData.length > 1_500_000) {
      return res.status(413).json({ error: 'Image too large. Please use a smaller photo.' })
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fridge.goodbotai.tech',
        'X-Title': 'FridgeAI',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageData } },
              {
                type: 'text',
                text: `You are a fridge inventory assistant. Look at this image and list ALL visible food items as a clean JSON array of ingredient names. Return ONLY a valid JSON array of strings, nothing else. Example: ["eggs","whole milk","cheddar cheese","broccoli","chicken breast"]. Be specific. Include condiments and sauces you can identify.`
              }
            ]
          }
        ],
        max_tokens: 400
      }),
      signal: AbortSignal.timeout(30000)
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText)
      return res.status(502).json({ error: 'OpenRouter request failed', detail: String(detail).slice(0, 200) })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const match = text.match(/\[[\s\S]*?\]/s)

    if (!match) {
      return res.status(200).json({ ingredients: [], raw: text.slice(0, 500) })
    }

    try {
      const ingredients = JSON.parse(match[0])
      if (!Array.isArray(ingredients)) return res.status(200).json({ ingredients: [], raw: text.slice(0, 500) })
      return res.json({ ingredients: ingredients.filter((i: any) => typeof i === 'string') })
    } catch {
      return res.status(200).json({ ingredients: [], raw: text.slice(0, 500), parseError: true })
    }

  } catch (err: any) {
    console.error('Vision error:', err.message)
    const detail = err.message || 'Unknown error'
    res.status(500).json({ error: 'Vision analysis failed', detail: String(detail).slice(0, 200) })
  }
}
