import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const id = (req.query.id as string) || (req.url?.match(/\/api\/recipes\/(\d+)/)?.[1])
  if (!id) {
    res.status(400).json({ error: 'Recipe ID required' })
    return
  }

  try {
    const [summaryRes, infoRes] = await Promise.all([
      axios.get(`https://api.spoonacular.com/recipes/${id}/summary`, {
        params: { apiKey: SPOONACULAR_KEY }
      }),
      axios.get(`https://api.spoonacular.com/recipes/${id}/information`, {
        params: { apiKey: SPOONACULAR_KEY, includeNutrition: false }
      })
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
    console.error('Recipe detail error:', err.message)
    res.status(500).json({ error: 'Failed to get recipe details' })
  }
}
