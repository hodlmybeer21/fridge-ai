import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // ── /api/analyze ─────────────────────────────────────────────────────────
  if (req.path === '/api/analyze' || req.url?.startsWith('/api/analyze')) {
    const { imageUrl } = req.body || {}
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' })

    try {
      let imageData = imageUrl

      // Proxy external URLs as base64 to avoid CORS
      if (!imageUrl.startsWith('data:')) {
        try {
          const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 })
          const mimeType = imgResponse.headers['content-type'] || 'image/jpeg'
          imageData = `data:${mimeType};base64,${Buffer.from(imgResponse.data).toString('base64')}`
        } catch (proxyErr: any) {
          console.warn('Image proxy failed, passing URL directly:', proxyErr.message)
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
          }
        }
      )

      const text = response.data.choices?.[0]?.message?.content || ''
      const match = text.match(/\[[\s\S]*?\]/s)
      if (!match) return res.status(200).json({ ingredients: [], raw: text })
      let ingredients = JSON.parse(match[0])
      if (!Array.isArray(ingredients)) return res.status(200).json({ ingredients: [], raw: text })
      ingredients = ingredients.filter((i: any) => typeof i === 'string')
      res.json({ ingredients })
    } catch (err: any) {
      console.error('Vision error:', err.response?.data || err.message)
      res.status(500).json({ error: 'Vision analysis failed', detail: err.response?.data?.error?.message || err.message })
    }
    return
  }

  // ── /api/recipes ──────────────────────────────────────────────────────────
  if (req.path === '/api/recipes' || req.url?.startsWith('/api/recipes')) {
    if (req.method === 'GET') {
      // Return 405 for GET on /api/recipes (recipe details use GET /:id)
      res.status(405).json({ error: 'POST required' })
      return
    }
    const { ingredients } = req.body || {}
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'ingredients array required' })
    }

    const junk = ['bag', 'shelf', 'door', 'container', 'box', 'bottle', 'nothing', 'visible', 'empty', 'fridge']
    const clean = ingredients.filter((i: any) =>
      typeof i === 'string' && i.length > 2 && !junk.some((j: string) => i.toLowerCase().includes(j))
    )
    if (clean.length === 0) return res.json({ recipes: [] })

    try {
      const response = await axios.get(
        'https://api.spoonacular.com/recipes/findByIngredients',
        { params: { ingredients: clean.join(','), number: 8, ranking: 2, ignorePantry: true, apiKey: SPOONACULAR_KEY } }
      )

      const recipes = response.data.map((r: any) => ({
        id: r.id,
        title: r.title,
        image: r.image,
        usedCount: r.usedIngredientCount,
        missedCount: r.missedIngredientCount,
        missedIngredients: r.missedIngredients.map((m: any) => m.original),
        usedIngredients: r.usedIngredients.map((u: any) => u.original),
        matchPercent: Math.round((r.usedIngredientCount / (r.usedIngredientCount + r.missedIngredientCount)) * 100)
      }))

      recipes.sort((a: any, b: any) => b.matchPercent - a.matchPercent)
      res.json({ recipes, analyzedIngredients: clean })
    } catch (err: any) {
      res.status(500).json({ error: 'Recipe search failed', detail: err.response?.data })
    }
    return
  }

  // ── /api/recipes/:id ──────────────────────────────────────────────────────
  const recipeIdMatch = (req.path || req.url || '').match(/\/api\/recipes\/(\d+)/)
  if (recipeIdMatch) {
    const id = recipeIdMatch[1]
    try {
      const [summaryRes, infoRes] = await Promise.all([
        axios.get(`https://api.spoonacular.com/recipes/${id}/summary`, { params: { apiKey: SPOONACULAR_KEY } }),
        axios.get(`https://api.spoonacular.com/recipes/${id}/information`, { params: { apiKey: SPOONACULAR_KEY, includeNutrition: false } })
      ])
      res.json({
        summary: summaryRes.data,
        info: {
          readyInMinutes: infoRes.data.readyInMinutes,
          servings: infoRes.data.servings,
          sourceUrl: infoRes.data.sourceUrl,
          instructions: infoRes.data.instructions,
          extendedIngredients: infoRes.data.extendedIngredients?.map((i: any) => i.original)
        }
      })
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get recipe details' })
    }
    return
  }

  res.status(404).json({ error: 'Not found' })
}
