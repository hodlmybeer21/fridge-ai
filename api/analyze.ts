import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

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

    if (!imageUrl.startsWith('data:')) {
      try {
        const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 })
        const mimeType = imgResponse.headers['content-type'] || 'image/jpeg'
        imageData = `data:${mimeType};base64,${Buffer.from(imgResponse.data).toString('base64')}`
      } catch (proxyErr: any) {
        console.warn('Image proxy failed:', proxyErr.message)
      }
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageData } },
              {
                type: 'text',
                text: `You are a fridge inventory assistant. Look at this image and list ALL visible food items as a clean JSON array of ingredient names. Return ONLY a valid JSON array of strings, nothing else. Example: ["eggs","whole milk","cheddar cheese","broccoli","chicken breast"]. Be specific (e.g. "chicken breast" not "chicken", "cheddar cheese" not "cheese"). Include condiments and sauces you can identify.`
              }
            ]
          }
        ],
        max_tokens: 400
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fridge.goodbotai.tech',
          'X-Title': 'FridgeAI'
        },
        timeout: 60000
      }
    )

    const text = response.data.choices?.[0]?.message?.content || ''
    const match = text.match(/\[[\s\S]*?\]/s)
    if (!match) return res.status(200).json({ ingredients: [], raw: text.slice(0, 200) })
    try {
      const ingredients = JSON.parse(match[0])
      if (!Array.isArray(ingredients)) return res.status(200).json({ ingredients: [], raw: text.slice(0, 200) })
      return res.json({ ingredients: ingredients.filter((i: any) => typeof i === 'string') })
    } catch {
      return res.status(200).json({ ingredients: [], raw: text.slice(0, 200), parseError: true })
    }
  } catch (err: any) {
    console.error('Vision error:', err.response?.data || err.message)
    const detail = err.response?.data?.error?.message || err.message || 'Unknown error'
    res.status(500).json({ error: 'Vision analysis failed', detail: String(detail).slice(0, 200) })
  }
}
