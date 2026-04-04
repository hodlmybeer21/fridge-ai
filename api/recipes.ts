import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' })
    return
  }

  const { ingredients, cuisine, diet, maxReadyTime } = req.body || {}
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' })
  }

  const junk = ['bag', 'shelf', 'door', 'container', 'box', 'bottle', 'nothing', 'visible', 'empty', 'fridge', 'freezer']
  const clean = ingredients.filter((i: any) =>
    typeof i === 'string' && i.length > 2 && !junk.some((j: string) => i.toLowerCase().includes(j))
  )
  if (clean.length === 0) return res.json({ recipes: [] })

  const hasFilters = cuisine || diet || maxReadyTime

  try {
    let response: any

    if (hasFilters) {
      // ── Filtered search via complexSearch ──────────────────────────────────
      const params: any = {
        includeIngredients: clean.join(','),
        number: 12,
        ranking: 2,
        ignorePantry: true,
        apiKey: SPOONACULAR_KEY,
        addRecipeInformation: true,
        fillIngredients: true,
      }
      if (cuisine) params.cuisine = cuisine
      if (diet) params.diet = diet
      if (maxReadyTime) params.maxReadyTime = Number(maxReadyTime)

      response = await axios.get(
        'https://api.spoonacular.com/recipes/complexSearch',
        { params }
      )

      const recipes = (response.data.results || []).map((r: any) => {
        const used = (r.usedIngredients || []).map((u: any) => u.original)
        const missed = (r.missedIngredients || []).map((m: any) => m.original)
        const total = used.length + missed.length
        return {
          id: r.id,
          title: r.title,
          image: r.image,
          usedCount: used.length,
          missedCount: missed.length,
          missedIngredients: missed,
          usedIngredients: used,
          matchPercent: total > 0 ? Math.round((used.length / total) * 100) : 0,
          readyInMinutes: r.readyInMinutes,
          servings: r.servings,
        }
      })

      recipes.sort((a: any, b: any) => b.matchPercent - a.matchPercent)
      res.json({ recipes, analyzedIngredients: clean })
    } else {
      // ── Standard search via findByIngredients ───────────────────────────────
      response = await axios.get(
        'https://api.spoonacular.com/recipes/findByIngredients',
        {
          params: {
            ingredients: clean.join(','),
            number: 8,
            ranking: 2,
            ignorePantry: true,
            apiKey: SPOONACULAR_KEY
          }
        }
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
    }
  } catch (err: any) {
    console.error('Spoonacular error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Recipe search failed', detail: err.response?.data })
  }
}
